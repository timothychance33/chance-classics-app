/** Same $250 as DEPOSIT_USD in booking-rules.ts. Kept local so this file has no path alias. */
const DEPOSIT_FALLBACK_USD = 250;
/** Same 10.25% as SALES_TAX_RATE in booking-rules.ts. */
const SALES_TAX_RATE = 0.1025;

function salesTaxOn(subtotal: number) {
  const cents = Math.round(Math.max(0, Number(subtotal) || 0) * 100);
  return Math.round(cents * SALES_TAX_RATE) / 100;
}

/** Garage jobs with a collected deposit use confirmed, not the import default `new`. */
export const CONFIRMED_DEPOSIT_STATUS = "confirmed";

/**
 * A paid deposit or balance confirms a `new` booking.
 * Cancelled, declined, and later garage statuses stay as written.
 * A website hold is not in this set: paying the deposit still confirms it.
 */
const LOCKED_AFTER_PAYMENT = new Set([
  "confirmed",
  "prepping",
  "ready",
  "out",
  "completed",
  "cancelled",
  "canceled",
  "declined",
]);

/** `confirmed` only when a still-new booking is deposit or paid. Otherwise leave status alone. */
export function promotedStatusIfNew(
  status: string | null | undefined,
  paymentStatus: string | null | undefined,
): "confirmed" | null {
  const current = String(status ?? "").trim().toLowerCase();
  const pay = String(paymentStatus ?? "").trim().toLowerCase();
  if (current === "new" && (pay === "deposit" || pay === "paid")) return "confirmed";
  return null;
}

export function moneyNumber(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/[$,]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** What Stripe actually collected. Checkout amount_total is cents. */
export function depositDollarsFromSession(session: {
  amount_total?: number | null;
  metadata?: { deposit_usd?: string | null } | null;
}) {
  if (session.amount_total != null && Number.isFinite(session.amount_total)) {
    return Math.round(session.amount_total) / 100;
  }
  return moneyNumber(session.metadata?.deposit_usd) ?? DEPOSIT_FALLBACK_USD;
}

/**
 * Tax-inclusive booking total. Not the $250 deposit.
 * Checkout metadata and "Booking total" / "Quote total" are already final.
 * A listing-only note gets 10.25% sales tax on listing plus mileage.
 */
export function totalDollarsFromCheckout(input: {
  metadata?: { total_usd?: string | null } | null;
  notes?: string | null;
  mileageFeeUsd?: number | null;
}) {
  const fromMeta = moneyNumber(input.metadata?.total_usd);
  if (fromMeta != null) return fromMeta;
  const notes = String(input.notes || "");
  const bookingTotal = notes.match(/Booking total:\s*\$([0-9]+(?:\.[0-9]+)?)/i);
  if (bookingTotal) return moneyNumber(bookingTotal[1]);
  const quote = notes.match(/Quote total:\s*\$([0-9]+(?:\.[0-9]+)?)/i);
  if (quote) return moneyNumber(quote[1]);
  const listing = notes.match(/Listing total:\s*\$([0-9]+(?:\.[0-9]+)?)/i);
  if (!listing) return null;
  const listingUsd = moneyNumber(listing[1]);
  if (listingUsd == null) return null;
  const feeLine = notes.match(/fee \$([0-9]+(?:\.[0-9]+)?)/i);
  const fee = moneyNumber(input.mileageFeeUsd) ?? moneyNumber(feeLine?.[1]) ?? 0;
  const subtotal = Math.round((listingUsd + fee) * 100) / 100;
  const taxLine = notes.match(/Sales tax[^$\n]*\$([0-9]+(?:\.[0-9]+)?)/i);
  const exempt = /(?:^|\n)\s*Tax exempt\b/i.test(notes);
  const tax = exempt ? 0 : (taxLine ? (moneyNumber(taxLine[1]) ?? 0) : salesTaxOn(subtotal));
  return Math.round((subtotal + tax) * 100) / 100;
}

export function notesAfterDeposit(notes: string, total: number | null, paid: number | null) {
  let text = String(notes || "");
  if (!text.includes("Deposit paid")) {
    text = `${text}\nDeposit paid. Booking confirmed.`;
  }
  if (total != null && paid != null && !/^\s*Price:\s*\$/im.test(text)) {
    const due = Math.round((total - paid) * 100) / 100;
    text = `${text.replace(/\s+$/, "")}\nPrice: $${total.toFixed(2)} ($${due.toFixed(2)} due)`;
  }
  return text.replace(/^\n/, "");
}

/**
 * Columns to write after a paid deposit. balance_due_usd is generated
 * (total_usd - amount_paid_usd) and must not be written.
 */
export function confirmedDepositUpdate(input: {
  status?: string | null;
  paymentStatus?: string | null;
  existingTotal?: number | null;
  existingPaid?: number | null;
  existingSessionId?: string | null;
  totalUsd: number | null;
  depositUsd: number | null;
  sessionId?: string | null;
  notes?: string | null;
  includeSessionId?: boolean;
  stripeCustomerId?: string | null;
  stripePaymentMethodId?: string | null;
  existingCustomerId?: string | null;
  existingPaymentMethodId?: string | null;
}) {
  const total = input.existingTotal != null ? input.existingTotal : input.totalUsd;
  const paid = input.existingPaid != null && input.existingPaid > 0
    ? Math.max(input.existingPaid, input.depositUsd ?? 0)
    : input.depositUsd;
  const current = String(input.status || "").trim();
  const status = current && LOCKED_AFTER_PAYMENT.has(current.toLowerCase())
    ? current
    : CONFIRMED_DEPOSIT_STATUS;
  const patch: Record<string, unknown> = {
    status,
    payment_status: input.paymentStatus === "paid" ? "paid" : "deposit",
    notes: notesAfterDeposit(String(input.notes || ""), total, paid),
  };
  if (total != null) patch.total_usd = total;
  if (paid != null) patch.amount_paid_usd = paid;
  if (input.includeSessionId && input.sessionId && !input.existingSessionId) {
    patch.stripe_deposit_session_id = input.sessionId;
  }
  if (input.stripeCustomerId && !input.existingCustomerId) patch.stripe_customer_id = input.stripeCustomerId;
  if (input.stripePaymentMethodId && !input.existingPaymentMethodId) {
    patch.stripe_payment_method_id = input.stripePaymentMethodId;
  }
  return patch;
}
