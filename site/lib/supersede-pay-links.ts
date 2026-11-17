import type Stripe from "stripe";
import {
  SUPERSEDED_PAY_LINK,
  balanceCheckoutIsStale,
} from "@/lib/customer-amount.mjs";
import type { rentalDb } from "@/lib/rental-db";

type Db = NonNullable<ReturnType<typeof rentalDb>>;

const OPEN_CHARGE = ["pending", "authentication_required"];

function sessionAmountUsd(session: Stripe.Checkout.Session) {
  if (session.amount_total == null || !Number.isFinite(session.amount_total)) return null;
  return Math.round(session.amount_total) / 100;
}

function isBalanceCheckout(session: Stripe.Checkout.Session) {
  const purpose = String(session.metadata?.purpose || "");
  const reason = String(session.metadata?.reason || "");
  if (purpose && purpose !== "charge") return false;
  if (reason && reason !== "balance") return false;
  return purpose === "charge" || reason === "balance";
}

async function markSuperseded(db: Db, input: {
  bookingId: string;
  sessionId: string;
  payUrl: string;
  amountUsd: number;
  createdAt: string;
}) {
  const existing = await db.from("booking_charges")
    .select("id")
    .eq("stripe_checkout_session_id", input.sessionId)
    .maybeSingle();
  if (existing.error) {
    if (/booking_charges/i.test(existing.error.message || "")) return "";
    return "A voided pay link could not be saved on the booking.";
  }
  if (existing.data?.id) {
    const updated = await db.from("booking_charges").update({
      status: "failed",
      error_message: SUPERSEDED_PAY_LINK,
      amount_usd: input.amountUsd,
    }).eq("id", existing.data.id).in("status", [...OPEN_CHARGE, "failed"]);
    if (updated.error) return "A voided pay link could not be saved on the booking.";
  } else {
    const inserted = await db.from("booking_charges").insert({
      booking_id: input.bookingId,
      amount_usd: input.amountUsd,
      reason: "balance",
      status: "failed",
      stripe_checkout_session_id: input.sessionId,
      pay_url: input.payUrl || null,
      error_message: SUPERSEDED_PAY_LINK,
      ...(input.createdAt ? { created_at: input.createdAt } : {}),
    });
    if (inserted.error && inserted.error.code !== "23505") {
      return "A voided pay link could not be saved on the booking.";
    }
  }
  const cleared = await db.from("bookings")
    .update({ stripe_balance_session_id: null })
    .eq("id", input.bookingId)
    .eq("stripe_balance_session_id", input.sessionId);
  if (cleared.error && !/stripe_balance_session_id/i.test(cleared.error.message || "")) {
    return "A voided pay link could not be cleared on the booking.";
  }
  return "";
}

/**
 * Expire open balance Checkout sessions that would still collect a stale amount.
 * A link stamped with the current total is left alone, including a partial balance.
 */
export async function supersedeStaleBalanceLinks(
  stripe: Stripe,
  db: Db,
  input: {
    bookingId: string;
    totalUsd: number | null;
    balanceUsd: number | null;
    knownSessionId?: string | null;
    customerId?: string | null;
  },
): Promise<{ expired: number; warning: string }> {
  const sessions = new Map<string, Stripe.Checkout.Session>();
  let warning = "";
  const remember = (session: Stripe.Checkout.Session) => {
    if (session?.id) sessions.set(session.id, session);
  };
  const customerId = String(input.customerId || "");
  let discovered = false;
  if (customerId.startsWith("cus_")) {
    try {
      const listed = await stripe.checkout.sessions.list({
        customer: customerId,
        status: "open",
        limit: 100,
      });
      for (const session of listed.data || []) {
        if (session.metadata?.booking_id === input.bookingId) remember(session);
      }
      discovered = true;
    } catch (error) {
      console.error("supersede pay link list failed", error instanceof Error ? error.message : error);
    }
  }
  try {
    const found = await stripe.rawRequest("GET", "/v1/checkout/sessions/search", {
      query: `status:'open' AND metadata['booking_id']:'${input.bookingId}'`,
      limit: 100,
    }) as { data?: Stripe.Checkout.Session[] };
    for (const session of found?.data || []) remember(session);
    discovered = true;
  } catch (error) {
    console.error("supersede pay link search failed", error instanceof Error ? error.message : error);
  }
  if (!discovered) {
    warning = "An open pay link could not be listed, so it may still be payable until it expires.";
  }

  const extraIds = new Set<string>();
  const known = String(input.knownSessionId || "");
  if (known.startsWith("cs_")) extraIds.add(known);
  const stored = await db.from("booking_charges")
    .select("stripe_checkout_session_id")
    .eq("booking_id", input.bookingId)
    .eq("reason", "balance")
    .in("status", OPEN_CHARGE);
  if (!stored.error) {
    for (const row of stored.data || []) {
      const id = String(row.stripe_checkout_session_id || "");
      if (id.startsWith("cs_")) extraIds.add(id);
    }
  }
  for (const id of extraIds) {
    if (sessions.has(id)) continue;
    try {
      const session = await stripe.checkout.sessions.retrieve(id);
      if (session.status === "open") remember(session);
    } catch (error) {
      warning = warning || "An open pay link could not be voided.";
      console.error("supersede pay link retrieve failed", error instanceof Error ? error.message : error);
    }
  }

  let expired = 0;
  for (const session of sessions.values()) {
    if (!isBalanceCheckout(session) || session.status !== "open") continue;
    const amount = sessionAmountUsd(session);
    if (amount == null) continue;
    const stale = balanceCheckoutIsStale({
      reason: "balance",
      amountUsd: amount,
      metadataTotalUsd: session.metadata?.total_usd,
      currentTotalUsd: input.totalUsd,
      currentBalanceUsd: input.balanceUsd,
    });
    if (!stale) continue;
    try {
      await stripe.checkout.sessions.expire(session.id);
    } catch (error) {
      warning = "An open pay link could not be voided. It must not be used for the old balance.";
      console.error("supersede pay link expire failed", error instanceof Error ? error.message : error);
      continue;
    }
    const saved = await markSuperseded(db, {
      bookingId: input.bookingId,
      sessionId: session.id,
      payUrl: session.url || "",
      amountUsd: amount,
      createdAt: session.created ? new Date(session.created * 1000).toISOString() : "",
    });
    if (saved) warning = warning || saved;
    expired += 1;
  }
  return { expired, warning };
}

/** Refund a balance Checkout payment that no longer matches the booking, and do not record it as collected. */
export async function refundStaleBalanceCheckout(
  stripe: Stripe,
  db: Db,
  input: { bookingId: string; session: Stripe.Checkout.Session; amountUsd: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const intent = input.session.payment_intent;
  const intentId = typeof intent === "string" ? intent : intent?.id || "";
  if (!intentId) return { ok: false, error: "The pay link was paid but had no payment to refund." };
  try {
    await stripe.refunds.create(
      { payment_intent: intentId },
      { idempotencyKey: `stale-balance-${input.session.id}`.slice(0, 255) },
    );
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code || "")
      : "";
    if (code !== "charge_already_refunded") {
      console.error("stale balance refund failed", error instanceof Error ? error.message : error);
      return { ok: false, error: "The old pay link was paid and the refund did not go through." };
    }
  }
  await markSuperseded(db, {
    bookingId: input.bookingId,
    sessionId: input.session.id,
    payUrl: input.session.url || "",
    amountUsd: input.amountUsd,
    createdAt: input.session.created ? new Date(input.session.created * 1000).toISOString() : "",
  });
  return { ok: true };
}
