import { NextResponse } from "next/server";
import Stripe from "stripe";
import { applySucceededCharge } from "@/lib/booking-charge";
import { authorizeCharge, chargeCors } from "@/lib/charge-auth";
import { emailCustomerBalancePay, emailOwnerAboutMoney, failedChargeNoticeIds, paymentNoticeIds } from "@/lib/owner-booking-notify";
import { rentalDb } from "@/lib/rental-db";
import { bookingTotals, chargeAmounts, chargeDescription, isChargeReason } from "@/lib/saved-card";

export const runtime = "nodejs";

function json(request: Request, body: unknown, status = 200) {
  const headers = chargeCors(request);
  headers.set("Content-Type", "application/json");
  return new NextResponse(JSON.stringify(body), { status, headers });
}

function stripeCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return String((error as { code?: string }).code || "");
}

function stripeIntent(error: unknown) {
  if (!error || typeof error !== "object" || !("payment_intent" in error)) return null;
  const intent = (error as { payment_intent?: Stripe.PaymentIntent | string }).payment_intent;
  return intent && typeof intent === "object" ? intent : null;
}

function stripeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "The card could not be charged.";
  return message.slice(0, 300);
}

function failureText(error: unknown) {
  if (error instanceof Error) {
    const message = error.message ? `${error.name}: ${error.message}` : error.name;
    return message.slice(0, 300);
  }
  return "The charge request failed.";
}

async function tellOwnerAboutCharge(
  db: NonNullable<ReturnType<typeof rentalDb>>,
  bookingId: string,
  input: {
    amount: number;
    reason: "balance" | "overage" | "damage" | "failed" | "pay_link";
    chargeReason?: "balance" | "overage" | "damage";
    detail?: string;
    noticeIds: string[];
    amountPaid?: number | null;
    balance?: number | null;
  },
) {
  if (!input.noticeIds.length) return "";
  try {
    const mailed = await emailOwnerAboutMoney(db, bookingId, input, { sendIfUntracked: true });
    if (!mailed.ok) return mailed.error || "The email to you did not send.";
    return "";
  } catch (error) {
    console.error("bookings/charge owner email failed", error);
    return failureText(error);
  }
}

async function payLink(stripe: Stripe, input: {
  origin: string;
  customerId?: string;
  customerEmail?: string;
  bookingId: string;
  amountCents: number;
  reason: "balance" | "overage" | "damage";
  description: string;
}) {
  const paid = input.reason === "balance" ? "balance" : "charge";
  const base: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    client_reference_id: input.bookingId,
    metadata: {
      booking_id: input.bookingId,
      purpose: "charge",
      reason: input.reason,
    },
    payment_intent_data: {
      metadata: {
        booking_id: input.bookingId,
        purpose: "charge",
        reason: input.reason,
        source: "checkout",
      },
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.amountCents,
          product_data: {
            name: input.description,
            description: "The balance is due the day before the event. The booking total includes 10.25% sales tax.",
          },
        },
      },
    ],
    success_url: `${input.origin}/booking/confirmed/?paid=${paid}`,
    cancel_url: `${input.origin}/payment-request-page/`,
  };
  const customerId = input.customerId && input.customerId.startsWith("cus_") ? input.customerId : "";
  const email = String(input.customerEmail || "").trim();
  const create = (who: { customer?: string; customer_email?: string }) =>
    stripe.checkout.sessions.create({ ...base, ...who });
  if (!customerId) return create(email ? { customer_email: email } : {});
  try {
    return await create({ customer: customerId });
  } catch (error) {
    if (!email) throw error;
    return create({ customer_email: email });
  }
}

function sameMoney(left: unknown, right: number) {
  const n = Number(left);
  if (!Number.isFinite(n)) return false;
  return Math.round(n * 100) === Math.round(right * 100);
}

function chargesTableMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /booking_charges/i.test(error.message || "");
}

async function storePayLinkMessageId(
  db: NonNullable<ReturnType<typeof rentalDb>>,
  input: { sessionId: string; chargeId: string; resendMessageId: string },
) {
  const resendMessageId = String(input.resendMessageId || "").trim();
  if (!resendMessageId) return "";
  const update = db.from("booking_charges").update({ resend_message_id: resendMessageId });
  const saved = input.sessionId
    ? await update.eq("stripe_checkout_session_id", input.sessionId)
    : input.chargeId
      ? await update.eq("id", input.chargeId)
      : null;
  if (!saved?.error) return "";
  if (/resend_message_id/i.test(saved.error.message || "")) return "";
  return saved.error.message;
}

async function customerCarName(db: NonNullable<ReturnType<typeof rentalDb>>, carId: unknown) {
  if (!carId) return "";
  const car = await db.from("cars").select("name").eq("id", String(carId)).maybeSingle();
  if (car.error || !car.data?.name) return "";
  return String(car.data.name);
}

async function sendBalancePayLink(
  request: Request,
  db: NonNullable<ReturnType<typeof rentalDb>>,
  stripe: Stripe,
  row: {
    customer_name?: string | null;
    customer_email?: string | null;
    event_date?: string | null;
    event_type?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    pickup_location?: string | null;
    return_location?: string | null;
    car_id?: string | null;
    total_usd?: unknown;
    amount_paid_usd?: unknown;
    notes?: string | null;
    stripe_customer_id?: string | null;
  },
  input: {
    bookingId: string;
    reason: "balance" | "overage" | "damage";
    amount: number;
  },
) {
  const email = String(row.customer_email || "").trim();
  if (!email) return json(request, { error: "This booking has no customer email." }, 409);
  const amountUsd = Math.round(input.amount * 100) / 100;
  const amountCents = Math.round(amountUsd * 100);
  if (amountCents < 50) return json(request, { error: "The smallest charge is $0.50." }, 400);
  const totals = bookingTotals(row);
  const checked = chargeAmounts({ ...totals, amount: amountUsd, reason: input.reason, source: "owner" });
  if ("error" in checked) return json(request, { error: checked.error }, 409);

  const pending = await db.from("booking_charges")
    .select("id,pay_url,stripe_checkout_session_id,amount_usd")
    .eq("booking_id", input.bookingId)
    .eq("reason", input.reason)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (pending.error) {
    const missing = chargesTableMissing(pending.error);
    return json(request, {
      error: missing
        ? "Apply the saved-card migration before a pay link can be saved."
        : pending.error.message,
    }, missing ? 503 : 500);
  }
  const match = (pending.data || []).find((item) => sameMoney(item.amount_usd, amountUsd));
  let payUrl = match?.pay_url ? String(match.pay_url) : "";
  let sessionId = match?.stripe_checkout_session_id ? String(match.stripe_checkout_session_id) : "";

  if (!payUrl) {
    let session: Stripe.Checkout.Session;
    try {
      session = await payLink(stripe, {
        origin: new URL(request.url).origin,
        customerId: String(row.stripe_customer_id || ""),
        customerEmail: email,
        bookingId: input.bookingId,
        amountCents,
        reason: input.reason,
        description: chargeDescription(input.reason),
      });
    } catch (error) {
      return json(request, { error: stripeMessage(error) }, 502);
    }
    payUrl = session.url || "";
    sessionId = session.id;
    if (!payUrl) return json(request, { error: "Stripe did not return a pay link." }, 502);
    const saved = match?.id
      ? await db.from("booking_charges").update({
        stripe_checkout_session_id: session.id,
        pay_url: payUrl,
        error_message: null,
      }).eq("id", match.id)
      : await db.from("booking_charges").insert({
        booking_id: input.bookingId,
        amount_usd: amountUsd,
        reason: input.reason,
        status: "pending",
        stripe_checkout_session_id: session.id,
        pay_url: payUrl,
      });
    if (saved.error) {
      return json(request, {
        ok: false,
        payUrl,
        mode: "pay_link",
        emailedTo: "",
        error: `The pay link was opened but not saved. ${saved.error.message}`,
      }, 500);
    }
  }

  const carName = await customerCarName(db, row.car_id);
  const mailed = await emailCustomerBalancePay({
    to: email,
    customerName: String(row.customer_name || ""),
    eventDate: String(row.event_date || ""),
    carName,
    amount: amountUsd,
    payUrl,
    eventType: String(row.event_type || ""),
    startTime: String(row.start_time || ""),
    endTime: String(row.end_time || ""),
    pickupLocation: String(row.pickup_location || ""),
    returnLocation: String(row.return_location || ""),
  });
  let messageIdError = "";
  if (mailed.ok) {
    try {
      messageIdError = await storePayLinkMessageId(db, {
        sessionId,
        chargeId: match?.id ? String(match.id) : "",
        resendMessageId: mailed.resendMessageId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The Resend id was not saved.";
      if (!/resend_message_id/i.test(message)) messageIdError = message;
    }
  }
  let stampError = "";
  if (mailed.ok && input.reason === "balance") {
    const stamped = await db.from("bookings").update({
      balance_reminder_sent_at: new Date().toISOString(),
    }).eq("id", input.bookingId);
    if (stamped.error && !/balance_reminder_sent_at/i.test(stamped.error.message || "")) {
      stampError = stamped.error.message;
    }
  }
  const ownerEmailError = await tellOwnerAboutCharge(db, input.bookingId, {
    amount: amountUsd,
    reason: "pay_link",
    chargeReason: input.reason,
    detail: mailed.ok
      ? `Pay link emailed to ${email}. ${payUrl}`
      : `Pay link created but the customer email did not send (${mailed.error || "email failed"}). ${payUrl}`,
    noticeIds: [`pay-link:${sessionId || input.bookingId}:${Date.now()}`],
    amountPaid: totals.paid,
    balance: totals.total == null ? null : Math.round((totals.total - totals.paid) * 100) / 100,
  });
  return json(request, {
    ok: mailed.ok,
    payUrl,
    mode: "pay_link",
    emailedTo: mailed.ok ? email : "",
    ...(mailed.ok ? {} : { error: mailed.error || "The pay link email did not send." }),
    ...(ownerEmailError ? { ownerEmailFailed: true, ownerEmailError } : {}),
    ...(stampError ? { reminderStampError: stampError } : {}),
    ...(messageIdError ? { resendMessageIdError: messageIdError } : {}),
  }, mailed.ok ? 200 : 502);
}

export async function OPTIONS(request: Request) {
  try {
    return new NextResponse(null, { status: 204, headers: chargeCors(request) });
  } catch (error) {
    console.error("bookings/charge OPTIONS failed", error);
    return json(request, { error: failureText(error) }, 500);
  }
}

export async function POST(request: Request) {
  try {
    return await handleChargePost(request);
  } catch (error) {
    console.error("bookings/charge POST failed", error);
    return json(request, { error: failureText(error) }, 500);
  }
}

async function handleChargePost(request: Request) {
  const auth = await authorizeCharge(request);
  if (!auth.ok) return json(request, { error: auth.error }, auth.status);
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return json(request, { error: "Payments aren’t connected yet." }, 503);
  const db = rentalDb();
  if (!db) return json(request, { error: "The booking calendar isn’t connected." }, 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "The form could not be read." }, 400);
  }
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const bookingId = String(raw.bookingId || raw.booking_id || "").trim();
  const reason = raw.reason;
  const amount = Number(raw.amount);
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return json(request, { error: "Missing booking." }, 400);
  if (!isChargeReason(reason)) return json(request, { error: "Choose balance, overage, or damage." }, 400);
  if (!Number.isFinite(amount)) return json(request, { error: "Enter an amount." }, 400);

  const loaded = await db.from("bookings").select(
    "id,status,customer_name,customer_email,event_date,event_type,start_time,end_time,pickup_location,return_location,car_id,total_usd,amount_paid_usd,notes,payment_status,stripe_customer_id,stripe_payment_method_id",
  ).eq("id", bookingId).maybeSingle();
  if (loaded.error && /stripe_customer_id|stripe_payment_method_id/i.test(loaded.error.message || "")) {
    return json(request, { error: "Apply the saved-card migration before charging a card." }, 503);
  }
  if (loaded.error) return json(request, { error: loaded.error.message }, 500);
  if (!loaded.data) return json(request, { error: "Booking not found." }, 404);
  const row = loaded.data;
  if (row.status === "cancelled" || row.status === "hold") {
    return json(request, { error: "That booking cannot be charged." }, 409);
  }
  const customerId = String(row.stripe_customer_id || "");
  const paymentMethodId = String(row.stripe_payment_method_id || "");
  const mode = String(raw.mode || "").trim();
  const totals = bookingTotals(row);
  const amountCents = Math.round(amount * 100);
  if (amountCents < 50) return json(request, { error: "The smallest charge is $0.50." }, 400);

  const stripe = new Stripe(secret);
  if (mode === "pay_link" || !customerId || !paymentMethodId) {
    return sendBalancePayLink(request, db, stripe, row, { bookingId, reason, amount });
  }
  const description = chargeDescription(reason);
  const requestId = String(raw.clientRequestId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  const idempotencyKey = requestId ? `offsession-${bookingId}-${requestId}` : undefined;
  const origin = new URL(request.url).origin;

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description,
      metadata: {
        booking_id: bookingId,
        purpose: "charge",
        reason,
        source: "off_session",
      },
    }, idempotencyKey ? { idempotencyKey } : undefined);
  } catch (error) {
    const code = stripeCode(error);
    const failedIntent = stripeIntent(error);
    if (code === "authentication_required" || failedIntent?.status === "requires_action") {
      if (failedIntent?.id) {
        try { await stripe.paymentIntents.cancel(failedIntent.id); } catch { /* a leftover intent cannot be confirmed from the garage */ }
      }
      try {
        const session = await payLink(stripe, {
          origin,
          customerId,
          customerEmail: String(row.customer_email || ""),
          bookingId,
          amountCents,
          reason,
          description,
        });
        await db.from("booking_charges").insert({
          booking_id: bookingId,
          amount_usd: Math.round(amount * 100) / 100,
          reason,
          status: "authentication_required",
          stripe_checkout_session_id: session.id,
          pay_url: session.url,
          error_message: "The bank needs the customer to approve this charge.",
        });
        const emailError = await tellOwnerAboutCharge(db, bookingId, {
          amount: Math.round(amount * 100) / 100,
          reason: "failed",
          chargeReason: reason,
          detail: "The bank needs the customer to approve this charge.",
          noticeIds: failedIntent?.id
            ? failedChargeNoticeIds(failedIntent.id)
            : requestId ? [`failed:${bookingId}:${requestId}`] : [],
        });
        return json(request, {
          ok: false,
          code: "authentication_required",
          error: emailError
            ? `The bank needs the customer to approve this charge. Send them this pay link. ${emailError}`
            : "The bank needs the customer to approve this charge. Send them this pay link.",
          payUrl: session.url,
        }, 402);
      } catch (linkError) {
        return json(request, {
          ok: false,
          code: "authentication_required",
          error: `The bank needs the customer to approve this charge. A pay link could not be opened. ${stripeMessage(linkError)}`,
        }, 402);
      }
    }
    await db.from("booking_charges").insert({
      booking_id: bookingId,
      amount_usd: Math.round(amount * 100) / 100,
      reason,
      status: "failed",
      stripe_payment_intent_id: failedIntent?.id || null,
      error_message: stripeMessage(error),
    });
    const declineMail = await tellOwnerAboutCharge(db, bookingId, {
      amount: Math.round(amount * 100) / 100,
      reason: "failed",
      chargeReason: reason,
      detail: stripeMessage(error),
      noticeIds: failedIntent?.id
        ? failedChargeNoticeIds(failedIntent.id)
        : requestId ? [`failed:${bookingId}:${requestId}`] : [],
    });
    return json(request, {
      error: declineMail ? `${stripeMessage(error)} ${declineMail}` : stripeMessage(error),
    }, 402);
  }

  if (intent.status !== "succeeded") {
    if (intent.status === "requires_action") {
      try { await stripe.paymentIntents.cancel(intent.id); } catch { /* same as the thrown path */ }
      try {
        const session = await payLink(stripe, {
          origin,
          customerId,
          customerEmail: String(row.customer_email || ""),
          bookingId,
          amountCents,
          reason,
          description,
        });
        await db.from("booking_charges").insert({
          booking_id: bookingId,
          amount_usd: Math.round(amount * 100) / 100,
          reason,
          status: "authentication_required",
          stripe_checkout_session_id: session.id,
          pay_url: session.url,
          error_message: "The bank needs the customer to approve this charge.",
        });
        const emailError = await tellOwnerAboutCharge(db, bookingId, {
          amount: Math.round(amount * 100) / 100,
          reason: "failed",
          chargeReason: reason,
          detail: "The bank needs the customer to approve this charge.",
          noticeIds: failedChargeNoticeIds(intent.id),
        });
        return json(request, {
          ok: false,
          code: "authentication_required",
          error: emailError
            ? `The bank needs the customer to approve this charge. Send them this pay link. ${emailError}`
            : "The bank needs the customer to approve this charge. Send them this pay link.",
          payUrl: session.url,
        }, 402);
      } catch (linkError) {
        return json(request, {
          ok: false,
          code: "authentication_required",
          error: `The bank needs the customer to approve this charge. A pay link could not be opened. ${stripeMessage(linkError)}`,
        }, 402);
      }
    }
    const stalledMail = await tellOwnerAboutCharge(db, bookingId, {
      amount: Math.round(amount * 100) / 100,
      reason: "failed",
      chargeReason: reason,
      detail: `The charge did not complete (${intent.status}).`,
      noticeIds: failedChargeNoticeIds(intent.id),
    });
    return json(request, {
      error: stalledMail
        ? `The charge did not complete (${intent.status}). ${stalledMail}`
        : `The charge did not complete (${intent.status}).`,
    }, 402);
  }

  const applied = await applySucceededCharge(db, {
    bookingId,
    amountUsd: intent.amount_received ? intent.amount_received / 100 : amountCents / 100,
    reason,
    paymentIntentId: intent.id,
    source: "owner",
  });
  if (!applied.ok) {
    return json(request, {
      error: `The card was charged (${intent.id}) but the booking was not updated. Do not charge again. ${applied.error}`,
      paymentIntentId: intent.id,
      charged: true,
    }, applied.status);
  }
  const paid = "paid" in applied ? applied.paid : totals.paid;
  const balance = "balance" in applied ? applied.balance : null;
  const emailError = await tellOwnerAboutCharge(db, bookingId, {
    amount: intent.amount_received ? intent.amount_received / 100 : amountCents / 100,
    reason,
    noticeIds: paymentNoticeIds({ paymentIntentId: intent.id }),
    amountPaid: paid,
    balance,
  });
  return json(request, {
    ok: true,
    paymentIntentId: intent.id,
    amountPaid: paid,
    balance,
    paymentStatus: "paymentStatus" in applied ? applied.paymentStatus : row.payment_status,
    already: applied.already === true,
    ...(emailError ? { ownerEmailFailed: true, ownerEmailError: emailError } : {}),
  });
}
