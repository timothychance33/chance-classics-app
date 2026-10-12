import { NextResponse } from "next/server";
import Stripe from "stripe";
import { applySucceededCharge } from "@/lib/booking-charge";
import { authorizeCharge, chargeCors } from "@/lib/charge-auth";
import { emailOwnerAboutMoney, failedChargeNoticeIds, paymentNoticeIds } from "@/lib/owner-booking-notify";
import { rentalDb } from "@/lib/rental-db";
import { bookingTotals, chargeDescription, isChargeReason } from "@/lib/saved-card";

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

async function tellOwnerAboutCharge(
  db: NonNullable<ReturnType<typeof rentalDb>>,
  bookingId: string,
  input: {
    amount: number;
    reason: "balance" | "overage" | "damage" | "failed";
    chargeReason?: "balance" | "overage" | "damage";
    detail?: string;
    noticeIds: string[];
    amountPaid?: number | null;
    balance?: number | null;
  },
) {
  if (!input.noticeIds.length) return "";
  const mailed = await emailOwnerAboutMoney(db, bookingId, input, { sendIfUntracked: true });
  if (!mailed.ok) return mailed.error || "The email to you did not send.";
  return "";
}

async function payLink(stripe: Stripe, input: {
  origin: string;
  customerId: string;
  bookingId: string;
  amountCents: number;
  reason: "balance" | "overage" | "damage";
  description: string;
}) {
  const paid = input.reason === "balance" ? "balance" : "charge";
  return stripe.checkout.sessions.create({
    mode: "payment",
    customer: input.customerId,
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
  });
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: chargeCors(request) });
}

export async function POST(request: Request) {
  if (!(await authorizeCharge(request))) {
    return json(request, { error: "Sign in as the owner to charge a saved card." }, 401);
  }
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
    "id,status,customer_name,customer_email,total_usd,amount_paid_usd,notes,payment_status,stripe_customer_id,stripe_payment_method_id",
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
  if (!customerId || !paymentMethodId) {
    return json(request, { error: "No card was saved on this booking." }, 409);
  }
  const totals = bookingTotals(row);
  const amountCents = Math.round(amount * 100);
  if (amountCents < 50) return json(request, { error: "The smallest charge is $0.50." }, 400);

  const stripe = new Stripe(secret);
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
