// Copy of site/lib/customer-amount.mjs for the scheduled-tasks edge function.
// Customer amount on a booking is the tax-inclusive total the customer owes.
// Same 10.25% rounding as salesTax() in site/lib/booking-rules.ts:
// tax cents = round(subtotal cents * 0.1025). A tax-exempt booking has no tax.

export const SUPERSEDED_PAY_LINK =
  "superseded: the customer amount changed, so this pay link no longer matches the balance.";

function roundMoney(amount) {
  return Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
}

function taxCentsFor(subtotalCents) {
  return Math.round(subtotalCents * 0.1025);
}

/** Split a tax-inclusive total into subtotal and sales tax. Tax-exempt totals have no tax. */
export function splitTaxInclusiveTotal(totalUsd, taxExempt) {
  const total = roundMoney(Math.max(0, Number(totalUsd) || 0));
  if (taxExempt || total === 0) return { total, subtotal: total, tax: 0 };
  const totalCents = Math.round(total * 100);
  const guess = Math.round(totalCents / 1.1025);
  let closest = null;
  for (let delta = -8; delta <= 8; delta += 1) {
    const subtotalCents = guess + delta;
    if (subtotalCents < 0) continue;
    const taxCents = taxCentsFor(subtotalCents);
    const drift = Math.abs(subtotalCents + taxCents - totalCents);
    if (drift === 0) {
      return { total, subtotal: subtotalCents / 100, tax: taxCents / 100 };
    }
    if (!closest || drift < closest.drift) closest = { subtotalCents, taxCents, drift };
  }
  const subtotalCents = closest ? closest.subtotalCents : guess;
  const taxCents = totalCents - subtotalCents;
  return { total, subtotal: subtotalCents / 100, tax: Math.max(0, taxCents) / 100 };
}

export function bookingIsTaxExempt(row) {
  if (!row) return false;
  const flag = row.tax_exempt;
  if (flag === true || String(flag).toLowerCase() === "true") return true;
  if (flag === false || String(flag).toLowerCase() === "false") return false;
  return /(?:^|\n)\s*Tax exempt\b/i.test(String(row.notes || ""));
}

function replaceFirstLine(text, pattern, nextLine) {
  let replaced = false;
  const lines = String(text || "").split("\n").map((row) => {
    if (!replaced && pattern.test(row)) {
      replaced = true;
      return nextLine;
    }
    return row;
  });
  return { text: lines.join("\n"), replaced };
}

/**
 * Rewrite the live money lines on a booking.
 * Quote total stays the original quote. Price, sales tax, and balance billed follow the new total.
 */
export function notesAfterCustomerAmount(notes, input) {
  const total = roundMoney(input.total);
  const tax = roundMoney(input.tax);
  const owed = roundMoney(Math.max(0, Number(input.balance) || 0));
  const price = `Price: $${total.toFixed(2)} ($${owed.toFixed(2)} due)`;
  let { text, replaced } = replaceFirstLine(String(notes || ""), /^\s*Price:\s*\$/i, price);
  if (!replaced) text = text.trim() ? `${text.replace(/\s+$/, "")}\n${price}` : price;
  if (input.taxExempt) {
    const zeroed = replaceFirstLine(text, /^\s*Sales tax\b/i, "Sales tax (10.25%): $0.00");
    text = zeroed.text;
  } else {
    const taxed = replaceFirstLine(text, /^\s*Sales tax\b/i, `Sales tax (10.25%): $${tax.toFixed(2)}`);
    text = taxed.text;
  }
  const billed = replaceFirstLine(text, /^\s*Balance billed separately\s*:/i, `Balance billed separately: $${owed.toFixed(2)}`);
  return billed.text;
}

function paymentStatusFor(total, paid) {
  if (roundMoney(total - paid) <= 0) return "paid";
  if (paid > 0) return "deposit";
  return "unpaid";
}

/** Money to store when the owner sets the customer amount. balance is what is still owed (never negative). */
export function customerAmountUpdate(input) {
  const amount = roundMoney(input && input.amount);
  if (!Number.isFinite(amount) || amount < 0) return { error: "Enter the customer amount." };
  if (amount > 100000) return { error: "That amount is too large." };
  const paid = roundMoney(Math.max(0, Number(input.paid) || 0));
  const taxExempt = input.taxExempt === true;
  const parts = splitTaxInclusiveTotal(amount, taxExempt);
  const rawBalance = roundMoney(parts.total - paid);
  const balance = roundMoney(Math.max(0, rawBalance));
  return {
    total: parts.total,
    subtotal: parts.subtotal,
    tax: parts.tax,
    paid,
    balance,
    paymentStatus: paymentStatusFor(parts.total, paid),
    taxExempt,
    notes: notesAfterCustomerAmount(input.notes, {
      total: parts.total,
      tax: parts.tax,
      balance,
      taxExempt,
    }),
  };
}

function metadataMoney(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return roundMoney(n);
}

function sameMoney(left, right) {
  if (left == null || right == null) return false;
  return Math.round(left * 100) === Math.round(right * 100);
}

/**
 * A balance Checkout session is stale when it was priced against a different booking total,
 * or (legacy links with no total stamp) when its amount is not the live balance.
 * A link stamped with the current total may be a partial balance and stays payable.
 * Overage and damage links are not balance links.
 */
export function balanceCheckoutIsStale(input) {
  const reason = String(input && input.reason || "");
  if (reason !== "balance") return false;
  const amount = metadataMoney(input.amountUsd);
  const total = metadataMoney(input.currentTotalUsd);
  const balance = metadataMoney(input.currentBalanceUsd);
  const stamped = metadataMoney(input.metadataTotalUsd);
  if (amount == null) return false;
  if (stamped != null && total != null) return !sameMoney(stamped, total);
  if (balance == null) return false;
  return !sameMoney(amount, balance);
}

export function balanceLinkMetadata(bookingId, reason, totalUsd) {
  const metadata = {
    booking_id: String(bookingId || ""),
    purpose: "charge",
    reason: String(reason || "balance"),
  };
  const total = metadataMoney(totalUsd);
  if (total != null) metadata.total_usd = total.toFixed(2);
  return metadata;
}
