import type Stripe from "stripe";
import { addDays, CARD_SAVE_TEXT, roundMoney } from "./booking-rules";
import { moneyNumber } from "./deposit-payment";

export { CARD_SAVE_TEXT };

export const CHARGE_REASONS = ["balance", "overage", "damage"] as const;
export type ChargeReason = (typeof CHARGE_REASONS)[number];

export function isChargeReason(value: unknown): value is ChargeReason {
  return CHARGE_REASONS.includes(value as ChargeReason);
}

/**
 * Fields that save the deposit card for later off-session charges.
 * Checkout rejects payment_method_types; methods come from the Dashboard.
 * These sessions are payment mode, so currency stays on the line item.
 * A setup-mode session would pass currency instead of payment_method_types.
 */
export function depositCheckoutSaveCard(metadata?: Record<string, string>): {
  customer_creation: "always";
  payment_intent_data: {
    setup_future_usage: "off_session";
    metadata?: Record<string, string>;
  };
  custom_text: { submit: { message: string } };
} {
  const payment_intent_data: {
    setup_future_usage: "off_session";
    metadata?: Record<string, string>;
  } = { setup_future_usage: "off_session" };
  if (metadata && Object.keys(metadata).length) payment_intent_data.metadata = metadata;
  return {
    customer_creation: "always",
    payment_intent_data,
    custom_text: { submit: { message: CARD_SAVE_TEXT } },
  };
}

export async function savedCardFromSession(stripe: Stripe, session: Stripe.Checkout.Session) {
  const customer = session.customer;
  const customerId = typeof customer === "string" ? customer : customer?.id || null;
  const intent = session.payment_intent;
  let paymentMethodId: string | null = null;
  if (intent && typeof intent !== "string") {
    const method = intent.payment_method;
    paymentMethodId = typeof method === "string" ? method : method?.id || null;
  }
  const intentId = typeof intent === "string" ? intent : intent?.id || null;
  if (!paymentMethodId && intentId) {
    const loaded = await stripe.paymentIntents.retrieve(intentId);
    const method = loaded.payment_method;
    paymentMethodId = typeof method === "string" ? method : method?.id || null;
  }
  return { customerId, paymentMethodId };
}

export function priceFromNotes(notes: string | null | undefined) {
  const match = String(notes || "").match(/Price:\s*\$([0-9]+(?:\.[0-9]+)?)(?:\s*\(\$?([0-9]+(?:\.[0-9]+)?)\s*due\))?/i);
  if (!match) return null;
  const amount = moneyNumber(match[1]);
  if (amount == null) return null;
  const due = match[2] != null ? moneyNumber(match[2]) : null;
  return { amount, due };
}

export function bookingTotals(row: {
  total_usd?: unknown;
  amount_paid_usd?: unknown;
  notes?: string | null;
}) {
  const fromColumn = moneyNumber(row.total_usd);
  const fromNotes = priceFromNotes(row.notes);
  return {
    total: fromColumn != null ? fromColumn : fromNotes?.amount ?? null,
    paid: moneyNumber(row.amount_paid_usd) ?? 0,
  };
}

export function notesWithPrice(notes: string | null | undefined, total: number, paid: number) {
  const due = roundMoney(Math.max(0, total - paid));
  const line = `Price: $${total.toFixed(2)} ($${due.toFixed(2)} due)`;
  const text = String(notes || "");
  if (!text.trim()) return line;
  let replaced = false;
  const next = text.split("\n").map((row) => {
    if (/^\s*Price:\s*\$/i.test(row)) {
      replaced = true;
      return line;
    }
    return row;
  });
  if (replaced) return next.join("\n");
  return `${text.replace(/\s+$/, "")}\n${line}`;
}

export function paymentStatusFor(total: number, paid: number) {
  if (roundMoney(total - paid) <= 0) return "paid";
  if (paid > 0) return "deposit";
  return "unpaid";
}

/**
 * Balance payments reduce what is still owed.
 * Overage and damage raise the booking total and the amount collected by the same dollars,
 * so the previous balance stays put.
 * Checkout payments that exceed a stale balance are still recorded.
 */
export function chargeAmounts(input: {
  total: number | null;
  paid: number | null;
  amount: number;
  reason: ChargeReason;
  source?: "owner" | "checkout";
}): { total: number; paid: number } | { error: string } {
  const amount = roundMoney(input.amount);
  if (!(amount > 0)) return { error: "Enter an amount greater than zero." };
  if (amount < 0.5) return { error: "The smallest charge is $0.50." };
  if (amount > 100000) return { error: "That amount is too large to charge from the garage." };
  const paid = roundMoney(input.paid ?? 0);
  const total = input.total == null ? null : roundMoney(input.total);
  const checkout = input.source === "checkout";
  if (total == null) {
    if (!checkout) return { error: "Set the booking total before charging the saved card." };
    const nextPaid = roundMoney(paid + amount);
    return { total: nextPaid, paid: nextPaid };
  }
  if (input.reason === "balance") {
    const due = roundMoney(total - paid);
    if (due <= 0) return { error: "This booking has no balance." };
    if (amount > due + 0.001) {
      if (!checkout) return { error: "That is more than the balance due." };
      const nextPaid = roundMoney(paid + amount);
      return { total: roundMoney(Math.max(total, nextPaid)), paid: nextPaid };
    }
    return { total, paid: roundMoney(paid + amount) };
  }
  return {
    total: roundMoney(total + amount),
    paid: roundMoney(paid + amount),
  };
}

/** Monday the balance reminder goes out. Wed–Sun use that week's Monday. Mon–Tue use the previous Monday. */
export function balanceReminderMonday(isoDate: string) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const dow = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const weekMonday = addDays(date, -daysFromMonday);
  if (dow === 1 || dow === 2) return addDays(weekMonday, -7);
  return weekMonday;
}

/**
 * Deposit and balance refunds lower amount paid only.
 * Overage and damage refunds lower the total and amount paid together,
 * so the previous balance stays put.
 */
export function refundAmounts(input: {
  total: number | null;
  paid: number | null;
  amount: number;
  reason: "deposit" | "balance" | "overage" | "damage";
}): { total: number | null; paid: number } | { error: string } {
  const amount = roundMoney(input.amount);
  if (!(amount > 0)) return { error: "Refund amount must be greater than zero." };
  const paid = roundMoney(Math.max(0, (input.paid ?? 0) - amount));
  const shrinksTotal = input.reason === "overage" || input.reason === "damage";
  const total = input.total == null
    ? null
    : shrinksTotal
      ? roundMoney(Math.max(0, input.total - amount))
      : roundMoney(input.total);
  return { total, paid };
}

export function chargeDescription(reason: ChargeReason) {
  if (reason === "overage") return "Chance Classics extra hours or mileage";
  if (reason === "damage") return "Chance Classics damage";
  return "Chance Classics rental balance";
}
