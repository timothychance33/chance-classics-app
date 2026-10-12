import type { rentalDb } from "@/lib/rental-db";
import {
  bookingTotals,
  chargeAmounts,
  chargeDescription,
  isChargeReason,
  notesWithPrice,
  paymentStatusFor,
  type ChargeReason,
} from "@/lib/saved-card";
import { updateBooking } from "@/lib/site-booking";

type Db = NonNullable<ReturnType<typeof rentalDb>>;

const OPEN_CHARGE = ["pending", "authentication_required", "failed"];

export function chargePatch(row: {
  notes?: string | null;
  total_usd?: unknown;
  amount_paid_usd?: unknown;
  payment_status?: string | null;
}, amount: number, reason: ChargeReason, source: "owner" | "checkout", sessionId?: string | null) {
  const totals = bookingTotals(row);
  const next = chargeAmounts({ ...totals, amount, reason, source });
  if ("error" in next) return next;
  const patch: Record<string, unknown> = {
    total_usd: next.total,
    amount_paid_usd: next.paid,
    payment_status: paymentStatusFor(next.total, next.paid),
    notes: notesWithPrice(row.notes, next.total, next.paid),
  };
  if (reason === "balance" && sessionId) patch.stripe_balance_session_id = sessionId;
  return { patch, total: next.total, paid: next.paid };
}

async function findCharge(db: Db, input: { checkoutSessionId?: string | null; paymentIntentId?: string | null }) {
  if (input.checkoutSessionId) {
    return db.from("booking_charges").select("id,status").eq("stripe_checkout_session_id", input.checkoutSessionId).maybeSingle();
  }
  if (input.paymentIntentId) {
    return db.from("booking_charges").select("id,status").eq("stripe_payment_intent_id", input.paymentIntentId).maybeSingle();
  }
  return { data: null, error: { message: "Missing Stripe id.", code: "" } };
}

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || /booking_charges/i.test(error.message || "");
}

/** Record a payment Stripe already collected and move amount_paid / balance. Safe to retry. */
export async function applySucceededCharge(db: Db, input: {
  bookingId: string;
  amountUsd: number;
  reason: ChargeReason;
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  source: "owner" | "checkout";
}) {
  if (!isChargeReason(input.reason)) return { ok: false as const, status: 400, error: "Unknown charge reason." };
  const existing = await findCharge(db, input);
  if (existing.error && missingTable(existing.error)) {
    return { ok: false as const, status: 503, error: "Apply the booking_charges migration before recording this payment." };
  }
  if (existing.error) return { ok: false as const, status: 500, error: existing.error.message };
  if (existing.data?.status === "succeeded") return { ok: true as const, already: true };

  let chargeId = existing.data?.id ? String(existing.data.id) : "";
  if (!chargeId) {
    const inserted = await db.from("booking_charges").insert({
      booking_id: input.bookingId,
      amount_usd: input.amountUsd,
      reason: input.reason,
      status: "pending",
      stripe_payment_intent_id: input.paymentIntentId || null,
      stripe_checkout_session_id: input.checkoutSessionId || null,
    }).select("id").single();
    if (inserted.error?.code === "23505") {
      const again = await findCharge(db, input);
      if (again.data?.status === "succeeded") return { ok: true as const, already: true };
      chargeId = again.data?.id ? String(again.data.id) : "";
    } else if (inserted.error) {
      return { ok: false as const, status: 500, error: inserted.error.message };
    } else {
      chargeId = String(inserted.data.id);
    }
  }
  if (!chargeId) return { ok: false as const, status: 500, error: "The charge could not be recorded." };

  const claimed = await db.from("booking_charges").update({
    status: "succeeded",
    amount_usd: input.amountUsd,
    reason: input.reason,
    stripe_payment_intent_id: input.paymentIntentId || null,
    error_message: null,
  }).eq("id", chargeId).in("status", OPEN_CHARGE).select("id");
  if (claimed.error) return { ok: false as const, status: 500, error: claimed.error.message };
  if (!claimed.data?.length) return { ok: true as const, already: true };

  const loaded = await db.from("bookings")
    .select("id,notes,total_usd,amount_paid_usd,payment_status")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (loaded.error || !loaded.data) {
    await db.from("booking_charges").update({ status: "pending" }).eq("id", chargeId);
    return { ok: false as const, status: loaded.error ? 500 : 404, error: loaded.error?.message || "Booking not found." };
  }
  const built = chargePatch(loaded.data, input.amountUsd, input.reason, input.source, input.checkoutSessionId);
  if ("error" in built) {
    await db.from("booking_charges").update({ status: "pending", error_message: built.error }).eq("id", chargeId);
    return { ok: false as const, status: 409, error: built.error };
  }
  const updated = await updateBooking(db, input.bookingId, built.patch);
  if (updated.error) {
    await db.from("booking_charges").update({ status: "pending", error_message: updated.error.message }).eq("id", chargeId);
    return { ok: false as const, status: 500, error: updated.error.message };
  }
  return {
    ok: true as const,
    already: false,
    total: built.total,
    paid: built.paid,
    balance: Math.round((built.total - built.paid) * 100) / 100,
    paymentStatus: built.patch.payment_status,
    description: chargeDescription(input.reason),
  };
}
