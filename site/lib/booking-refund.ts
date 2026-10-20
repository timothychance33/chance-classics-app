import type { rentalDb } from "@/lib/rental-db";
import { quoteLinkedBookingId } from "@/lib/owner-booking-notify";
import { promotedStatusIfNew } from "@/lib/deposit-payment";
import { bookingTotals, notesWithPrice, paymentStatusFor, refundAmounts } from "@/lib/saved-card";
import { updateBooking } from "@/lib/site-booking";

type Db = NonNullable<ReturnType<typeof rentalDb>>;

export type RefundReason = "deposit" | "balance" | "overage" | "damage";

function missingRefunds(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01"
    || error.code === "PGRST205"
    || /booking_refunds/i.test(error.message || "");
}

export function refundReasonFor(input: {
  chargeReason?: string | null;
  metadataReason?: string | null;
  purpose?: string | null;
}): RefundReason {
  const fromCharge = String(input.chargeReason || "");
  if (fromCharge === "balance" || fromCharge === "overage" || fromCharge === "damage") return fromCharge;
  const fromMeta = String(input.metadataReason || "");
  if (fromMeta === "balance" || fromMeta === "overage" || fromMeta === "damage") return fromMeta;
  return "deposit";
}

export async function bookingIdForRefund(db: Db, input: {
  metadata?: Record<string, string> | null;
  paymentIntentId?: string | null;
  customerId?: string | null;
}) {
  const meta = input.metadata || {};
  if (meta.booking_id) return meta.booking_id;
  if (meta.quote_id) {
    const linked = await quoteLinkedBookingId(db, meta.quote_id);
    if (linked) return linked;
  }
  if (input.paymentIntentId) {
    const row = await db.from("booking_charges")
      .select("booking_id")
      .eq("stripe_payment_intent_id", input.paymentIntentId)
      .maybeSingle();
    if (!row.error && row.data?.booking_id) return String(row.data.booking_id);
  }
  if (input.customerId) {
    const rows = await db.from("bookings").select("id").eq("stripe_customer_id", input.customerId).limit(2);
    if (!rows.error && rows.data?.length === 1 && rows.data[0]?.id) return String(rows.data[0].id);
  }
  return "";
}

async function currentFigures(db: Db, bookingId: string) {
  const loaded = await db.from("bookings")
    .select("total_usd,amount_paid_usd")
    .eq("id", bookingId)
    .maybeSingle();
  if (loaded.error || !loaded.data) return { amountPaid: null, balance: null };
  const totals = bookingTotals(loaded.data);
  const balance = totals.total == null ? null : Math.round((totals.total - totals.paid) * 100) / 100;
  return { amountPaid: totals.paid, balance };
}

/** Subtract a refund from the booking once. A repeated Stripe refund id does not subtract again. */
export async function applyBookingRefund(db: Db, input: {
  bookingId: string;
  amountUsd: number;
  refundId: string;
  chargeId?: string | null;
  paymentIntentId?: string | null;
  metadata?: Record<string, string> | null;
}) {
  const charge = input.paymentIntentId
    ? await db.from("booking_charges")
      .select("id,reason,refunded_usd")
      .eq("stripe_payment_intent_id", input.paymentIntentId)
      .maybeSingle()
    : { data: null, error: null };
  const reason = refundReasonFor({
    chargeReason: charge.data?.reason,
    metadataReason: input.metadata?.reason,
    purpose: input.metadata?.purpose,
  });

  const inserted = await db.from("booking_refunds").insert({
    stripe_refund_id: input.refundId,
    booking_id: input.bookingId,
    amount_usd: input.amountUsd,
    reason,
    status: "pending",
    stripe_charge_id: input.chargeId || null,
    stripe_payment_intent_id: input.paymentIntentId || null,
  }).select("stripe_refund_id");
  if (inserted.error?.code === "23505") {
    const existing = await db.from("booking_refunds").select("status").eq("stripe_refund_id", input.refundId).maybeSingle();
    if (existing.data?.status === "applied") {
      const figures = await currentFigures(db, input.bookingId);
      return { ok: true as const, already: true, reason, ...figures };
    }
    if (existing.data?.status !== "pending") {
      return { ok: false as const, status: 500, error: existing.error?.message || "The refund could not be recorded." };
    }
  } else if (inserted.error && missingRefunds(inserted.error)) {
    return {
      ok: false as const,
      status: 503,
      error: "Apply the owner_money_notices migration before recording this refund.",
    };
  } else if (inserted.error) {
    return { ok: false as const, status: 500, error: inserted.error.message };
  }

  const loaded = await db.from("bookings")
    .select("id,status,notes,total_usd,amount_paid_usd,payment_status")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (loaded.error || !loaded.data) {
    await db.from("booking_refunds").delete().eq("stripe_refund_id", input.refundId);
    return {
      ok: false as const,
      status: loaded.error ? 500 : 404,
      error: loaded.error?.message || "Booking not found.",
    };
  }
  const totals = bookingTotals(loaded.data);
  const next = refundAmounts({ ...totals, amount: input.amountUsd, reason });
  if ("error" in next) {
    await db.from("booking_refunds").delete().eq("stripe_refund_id", input.refundId);
    return { ok: false as const, status: 409, error: next.error };
  }
  const paymentStatus = next.total == null
    ? (next.paid > 0 ? "deposit" : "unpaid")
    : paymentStatusFor(next.total, next.paid);
  const patch: Record<string, unknown> = {
    amount_paid_usd: next.paid,
    payment_status: paymentStatus,
  };
  const promoted = promotedStatusIfNew(loaded.data.status, paymentStatus);
  if (promoted) patch.status = promoted;
  if (next.total != null) {
    patch.total_usd = next.total;
    patch.notes = notesWithPrice(loaded.data.notes, next.total, next.paid);
  }
  const updated = await updateBooking(db, input.bookingId, patch);
  if (updated.error) {
    await db.from("booking_refunds").delete().eq("stripe_refund_id", input.refundId);
    return { ok: false as const, status: 500, error: updated.error.message };
  }
  await db.from("booking_refunds").update({ status: "applied" }).eq("stripe_refund_id", input.refundId);
  if (charge.data?.id) {
    const refunded = Math.round((Number(charge.data.refunded_usd || 0) + input.amountUsd) * 100) / 100;
    await db.from("booking_charges").update({ refunded_usd: refunded }).eq("id", charge.data.id);
  }
  const balance = next.total == null ? null : Math.round((next.total - next.paid) * 100) / 100;
  return { ok: true as const, already: false, reason, amountPaid: next.paid, balance };
}
