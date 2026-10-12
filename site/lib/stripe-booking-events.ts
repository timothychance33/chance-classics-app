import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { applyBookingRefund, bookingIdForRefund } from "@/lib/booking-refund";
import { applySucceededCharge } from "@/lib/booking-charge";
import {
  emailOwnerAboutMoney,
  failedChargeNoticeIds,
  paymentNoticeIds,
  refundNoticeIds,
} from "@/lib/owner-booking-notify";
import type { rentalDb } from "@/lib/rental-db";
import { isChargeReason } from "@/lib/saved-card";

type Db = NonNullable<ReturnType<typeof rentalDb>>;

export function moneyEmailResponse(mailed: { ok: boolean; retry?: boolean; error?: string }) {
  if (mailed.ok) return null;
  if (mailed.retry === false) {
    console.error("owner money email failed:", mailed.error);
    return NextResponse.json({ received: true, ownerEmailFailed: true });
  }
  return NextResponse.json(
    { error: mailed.error || "The payment was recorded, but the owner email did not send." },
    { status: 500 },
  );
}

function stringId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return "";
}

async function refundMetadata(stripe: Stripe, paymentIntentId: string, chargeMetadata?: Stripe.Metadata | null) {
  const metadata: Record<string, string> = { ...(chargeMetadata || {}) };
  let customerId = "";
  if (!paymentIntentId) return { metadata, customerId };
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    Object.assign(metadata, intent.metadata || {});
    customerId = stringId(intent.customer);
  } catch {
    // The payment intent id can still match booking_charges.
  }
  return { metadata, customerId };
}

async function recordRefund(stripe: Stripe, db: Db, eventId: string, input: {
  refundId: string;
  amountCents: number;
  paymentIntentId: string;
  chargeId: string;
  chargeMetadata?: Stripe.Metadata | null;
}) {
  const amount = Math.round(input.amountCents) / 100;
  if (!(amount > 0) || !input.refundId) return NextResponse.json({ received: true });
  const lookedUp = await refundMetadata(stripe, input.paymentIntentId, input.chargeMetadata);
  const bookingId = await bookingIdForRefund(db, {
    metadata: lookedUp.metadata,
    paymentIntentId: input.paymentIntentId,
    customerId: lookedUp.customerId,
  });
  if (!bookingId) return NextResponse.json({ received: true, refund: "unresolved" });
  const applied = await applyBookingRefund(db, {
    bookingId,
    amountUsd: amount,
    refundId: input.refundId,
    chargeId: input.chargeId || null,
    paymentIntentId: input.paymentIntentId || null,
    metadata: lookedUp.metadata,
  });
  if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: applied.status });
  const mailed = await emailOwnerAboutMoney(db, bookingId, {
    amount,
    reason: "refund",
    chargeReason: applied.reason,
    noticeIds: refundNoticeIds({ eventId, refundId: input.refundId }),
    amountPaid: applied.amountPaid,
    balance: applied.balance,
  });
  return moneyEmailResponse(mailed) || NextResponse.json({
    received: true,
    refunded: true,
    already: applied.already === true,
  });
}

export async function handleChargeRefunded(stripe: Stripe, db: Db, event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const ready = (charge.refunds?.data || []).filter((refund) => refund.status === "succeeded" && refund.id);
  if (!ready.length) {
    if ((charge.refunds?.data || []).some((refund) => refund.status === "pending")) {
      return NextResponse.json({ received: true, pending: true });
    }
    return NextResponse.json({ received: true });
  }
  let response: NextResponse = NextResponse.json({ received: true, refunded: true });
  for (const refund of ready) {
    response = await recordRefund(stripe, db, event.id, {
      refundId: refund.id,
      amountCents: refund.amount,
      paymentIntentId: stringId(refund.payment_intent) || stringId(charge.payment_intent),
      chargeId: stringId(refund.charge) || charge.id,
      chargeMetadata: charge.metadata,
    });
    if (response.status >= 400) return response;
  }
  return response;
}

export async function handleRefundEvent(stripe: Stripe, db: Db, event: Stripe.Event) {
  const refund = event.data.object as Stripe.Refund;
  if (refund.status !== "succeeded") return NextResponse.json({ received: true, pending: true });
  return recordRefund(stripe, db, event.id, {
    refundId: refund.id,
    amountCents: refund.amount,
    paymentIntentId: stringId(refund.payment_intent),
    chargeId: stringId(refund.charge),
  });
}

export async function handleOffSessionIntent(db: Db, event: Stripe.Event) {
  const intent = event.data.object as Stripe.PaymentIntent;
  if (intent.metadata?.source !== "off_session" || intent.metadata?.purpose !== "charge") {
    return NextResponse.json({ received: true });
  }
  const bookingId = intent.metadata.booking_id || "";
  if (!bookingId) return NextResponse.json({ received: true, unresolved: true });
  const reason = isChargeReason(intent.metadata.reason) ? intent.metadata.reason : "balance";
  const amount = Math.round(intent.amount_received || intent.amount) / 100;
  if (event.type === "payment_intent.payment_failed") {
    await db.from("booking_charges").insert({
      booking_id: bookingId,
      amount_usd: Math.round(intent.amount) / 100,
      reason,
      status: "failed",
      stripe_payment_intent_id: intent.id,
      error_message: (intent.last_payment_error?.message || "The card was declined.").slice(0, 300),
    });
    const mailed = await emailOwnerAboutMoney(db, bookingId, {
      amount: Math.round(intent.amount) / 100,
      reason: "failed",
      chargeReason: reason,
      detail: intent.last_payment_error?.message || "",
      noticeIds: failedChargeNoticeIds(intent.id),
    });
    if (!mailed.ok && "missingTable" in mailed && mailed.missingTable) {
      return NextResponse.json({ received: true, failed: true });
    }
    return moneyEmailResponse(mailed) || NextResponse.json({ received: true, failed: true });
  }
  const applied = await applySucceededCharge(db, {
    bookingId,
    amountUsd: amount,
    reason,
    paymentIntentId: intent.id,
    source: "owner",
  });
  if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: applied.status });
  const mailed = await emailOwnerAboutMoney(db, bookingId, {
    amount,
    reason,
    noticeIds: paymentNoticeIds({ eventId: event.id, paymentIntentId: intent.id }),
    ...("paid" in applied ? { amountPaid: applied.paid, balance: applied.balance } : {}),
  });
  if (!mailed.ok && "missingTable" in mailed && mailed.missingTable) {
    return NextResponse.json({ received: true, charged: true, already: applied.already === true });
  }
  return moneyEmailResponse(mailed) || NextResponse.json({
    received: true,
    charged: true,
    already: applied.already === true,
  });
}
