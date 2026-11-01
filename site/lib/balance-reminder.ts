import type Stripe from "stripe";
import { SITE_URL } from "@/lib/content";
import { chicagoDate } from "@/lib/booking-rules";
import { emailCustomerBalancePay } from "@/lib/owner-booking-notify";
import type { rentalDb } from "@/lib/rental-db";
import {
  balanceCheckoutDuePhrase,
  balanceReminderDue,
  balanceReminderStatusOk,
  reminderBalanceUsd,
} from "@/lib/saved-card";

type Db = NonNullable<ReturnType<typeof rentalDb>>;

const REMINDER_COLUMNS =
  "id,status,payment_status,customer_name,customer_email,event_date,event_type,start_time,end_time,pickup_location,return_location,notes,total_usd,amount_paid_usd,balance_due_usd,balance_reminder_sent_at,stripe_customer_id,car_id,tax_exempt";

export type BalanceReminderResult = {
  sent: boolean;
  skipped?: string;
  error?: string;
};

function taxExemptRow(row: { tax_exempt?: unknown; notes?: unknown }) {
  const flag = row.tax_exempt;
  if (flag === true || String(flag).toLowerCase() === "true") return true;
  if (flag === false || String(flag).toLowerCase() === "false") return false;
  return /(?:^|\n)\s*Tax exempt\b/i.test(String(row.notes || ""));
}

function checkoutDescription(eventDate: string, today: string, taxExempt: boolean) {
  const due = balanceCheckoutDuePhrase(eventDate, today);
  return taxExempt
    ? `Balance for ${eventDate}. Tax exempt. The balance is due ${due}.`
    : `Balance for ${eventDate}. The booking total includes 10.25% sales tax. The balance is due ${due}.`;
}

async function openBalanceCheckout(stripe: Stripe, input: {
  bookingId: string;
  email: string;
  customerId: string;
  amountCents: number;
  description: string;
}) {
  const base: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    client_reference_id: input.bookingId,
    success_url: `${SITE_URL}/booking/confirmed/?paid=balance`,
    cancel_url: `${SITE_URL}/payment-request-page/`,
    metadata: {
      booking_id: input.bookingId,
      purpose: "charge",
      reason: "balance",
    },
    payment_intent_data: {
      metadata: {
        booking_id: input.bookingId,
        purpose: "charge",
        reason: "balance",
      },
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.amountCents,
          product_data: {
            name: "Chance Classics rental balance",
            description: input.description,
          },
        },
      },
    ],
  };
  const customerId = input.customerId.startsWith("cus_") ? input.customerId : "";
  const create = (who: { customer?: string; customer_email?: string }) =>
    stripe.checkout.sessions.create({ ...base, ...who });
  if (!customerId) return create({ customer_email: input.email });
  try {
    return await create({ customer: customerId });
  } catch {
    return create({ customer_email: input.email });
  }
}

async function carName(db: Db, carId: unknown) {
  if (!carId) return "";
  const car = await db.from("cars").select("name").eq("id", String(carId)).maybeSingle();
  if (car.error || !car.data?.name) return "";
  return String(car.data.name);
}

/**
 * Send the balance reminder as soon as a deposit lands on or after its reminder Monday.
 * A failure leaves balance_reminder_sent_at empty so the hourly catch-up can retry.
 * This does not fail the deposit webhook.
 */
export async function sendCatchUpBalanceReminder(
  db: Db,
  stripe: Stripe,
  bookingId: string,
): Promise<BalanceReminderResult> {
  try {
    return await sendIfDue(db, stripe, bookingId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The balance reminder did not send.";
    console.error("balance reminder after deposit failed", bookingId, message);
    return { sent: false, error: message };
  }
}

async function sendIfDue(db: Db, stripe: Stripe, bookingId: string): Promise<BalanceReminderResult> {
  let loaded = await db.from("bookings").select(REMINDER_COLUMNS).eq("id", bookingId).maybeSingle();
  if (loaded.error && /tax_exempt/i.test(loaded.error.message || "")) {
    loaded = await db.from("bookings").select(REMINDER_COLUMNS.replace(",tax_exempt", "")).eq("id", bookingId).maybeSingle();
  }
  if (loaded.error && /balance_reminder_sent_at|balance_due_usd/i.test(loaded.error.message || "")) {
    return { sent: false, skipped: "migration" };
  }
  if (loaded.error) return { sent: false, error: loaded.error.message };
  if (!loaded.data) return { sent: false, skipped: "missing" };

  const row = loaded.data;
  const email = String(row.customer_email || "").trim();
  const eventDate = String(row.event_date || "").slice(0, 10);
  const today = chicagoDate();
  if (!email) return { sent: false, skipped: "no_email" };
  if (!balanceReminderStatusOk(row)) return { sent: false, skipped: "unconfirmed" };
  if (row.balance_reminder_sent_at) return { sent: false, skipped: "already_sent" };
  if (!balanceReminderDue(eventDate, today)) return { sent: false, skipped: "not_due" };

  const balance = reminderBalanceUsd(row);
  if (balance == null || !Number.isFinite(balance) || balance < 0.5) {
    return { sent: false, skipped: "settled" };
  }

  const claimed = await db.from("bookings")
    .update({ balance_reminder_sent_at: new Date().toISOString() })
    .eq("id", bookingId)
    .is("balance_reminder_sent_at", null)
    .select("id");
  if (claimed.error) {
    if (/balance_reminder_sent_at/i.test(claimed.error.message || "")) {
      return { sent: false, skipped: "migration" };
    }
    return { sent: false, error: claimed.error.message };
  }
  if (!claimed.data?.length) return { sent: false, skipped: "already_sent" };

  const release = async () => {
    await db.from("bookings").update({ balance_reminder_sent_at: null }).eq("id", bookingId);
  };

  try {
    const taxExempt = taxExemptRow(row);
    const session = await openBalanceCheckout(stripe, {
      bookingId,
      email,
      customerId: String(row.stripe_customer_id || ""),
      amountCents: Math.round(balance * 100),
      description: checkoutDescription(eventDate, today, taxExempt),
    });
    const payUrl = session.url || "";
    if (!payUrl) {
      await release();
      return { sent: false, error: "Stripe did not return a pay link." };
    }
    const mailed = await emailCustomerBalancePay({
      to: email,
      customerName: String(row.customer_name || ""),
      eventDate,
      carName: await carName(db, row.car_id),
      amount: balance,
      payUrl,
      eventType: String(row.event_type || ""),
      startTime: String(row.start_time || ""),
      endTime: String(row.end_time || ""),
      pickupLocation: String(row.pickup_location || ""),
      returnLocation: String(row.return_location || ""),
      taxExempt,
      notes: String(row.notes || ""),
      mondayReminder: true,
      today,
    });
    if (!mailed.ok) {
      await release();
      return { sent: false, error: mailed.error || "The balance reminder email did not send." };
    }
    return { sent: true };
  } catch (error) {
    await release();
    const message = error instanceof Error ? error.message : "The balance reminder did not send.";
    console.error("balance reminder after deposit failed", bookingId, message);
    return { sent: false, error: message };
  }
}
