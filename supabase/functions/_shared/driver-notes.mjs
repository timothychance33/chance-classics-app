// Driver-facing booking notes. One sanitizer for the garage, driver emails,
// the Monday digest, and (via rental.sanitize_driver_notes) the proposed
// bookings_for_session view. Owner screens keep the raw notes.

const FIELD_LABELS = [
  "Vehicle reliability acknowledged",
  "Balance billed separately",
  "Overnight driver hotel",
  "Additional notes",
  "Waiver accepted",
  "Listing total",
  "Booking total",
  "Quote total",
  "Mileage fee",
  "Sales tax",
  "Deposit paid",
  "Deposit due",
  "Balance due",
  "Balance remaining",
  "Tax exempt",
  "Subtotal",
  "Gratuity",
  "Occasion",
  "Duration",
  "Refunded",
  "Deposit",
  "Balance",
  "Mileage",
  "Refund",
  "Quote",
  "Price",
  "Total",
  "Venmo",
  "Stripe",
  "Car",
  "Tip",
  "Wix",
].sort((a, b) => b.length - a.length);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

const LABEL_MATCHERS = FIELD_LABELS.map((label) => {
  const body = escapeRegExp(label);
  const tax = /^sales\s+tax$/i.test(label) ? "(?:\\s*\\([^)]*\\))?" : "";
  return new RegExp(`^${body}${tax}\\s*:`, "i");
});

function splitFields(text) {
  const source = String(text || "").replace(/\r\n/g, "\n");
  let out = "";
  for (let i = 0; i < source.length;) {
    const atBoundary = i === 0 || /\s/.test(source[i - 1]);
    let matched = "";
    if (atBoundary) {
      const rest = source.slice(i);
      for (const matcher of LABEL_MATCHERS) {
        const found = rest.match(matcher);
        if (found) {
          matched = found[0];
          break;
        }
      }
    }
    if (matched) {
      if (i > 0 && !out.endsWith("\n")) out += "\n";
      out += matched;
      i += matched.length;
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out;
}

const MONEY_LINE = /^\s*(?:sales\s+tax|quote\s+total|booking\s+total|listing\s+total|subtotal|mileage\s+fee|deposit|balance|price|total|tip|gratuity|refund|amount\s+paid|customer\s+amount|venmo|stripe|wix)\b/i;

const MONEY_HINT = /\$\s?\d|\b(?:usd|dollars)\b|\b(?:sales\s+tax|quote\s+total|booking\s+total|listing\s+total|subtotal|mileage\s+fee|deposit|balance|price|total|tip|gratuity|refund|venmo|stripe|wix|amount\s+paid|customer\s+amount)\b/i;

const PAREN_MONEY = /\([^)]*(?:\$|\bdue\b|\bbalance\b|\bpaid\b|\brefund\b|\bvenmo\b|\bstripe\b|\bwix\b)[^)]*\)/gi;
const DOLLAR = /\$\s?\d[\d,]*(?:\.\d{1,2})?/g;
const USD_BEFORE = /\b(?:usd|dollars)\s*\d[\d,]*(?:\.\d{1,2})?\b/gi;
const USD_AFTER = /\b\d[\d,]*(?:\.\d{2})\s*(?:usd|dollars)\b/gi;
const MONEY_PHRASE = /\b(?:sales\s+tax(?:\s*\([^)]*\))?|quote\s+total|booking\s+total|listing\s+total|subtotal|mileage\s+fee|gratuity|deposit(?:\s+(?:paid|due))?|balance(?:\s+(?:billed(?:\s+separately)?|due|remaining))?|amount\s+paid|customer\s+amount|refund(?:ed)?|venmo|stripe|wix|paid|billed\s+with\s+the\s+balance)\b\s*:?/gi;
const FEE_WORD = /,?\s*\bfee\b\s*/gi;

const GLUE = new Set([
  "a", "an", "the", "and", "or", "of", "to", "for", "on", "via", "with", "by",
  "from", "was", "were", "is", "are", "be", "been", "sent", "customer", "their",
  "our", "this", "that", "it", "in", "at", "after", "only", "separately",
  "including", "includes", "about", "then", "also",
]);

function contentWords(text) {
  const words = String(text || "").match(/[a-z]{3,}/gi) || [];
  return words.filter((word) => !GLUE.has(word.toLowerCase()));
}

function tidy(text) {
  return String(text || "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:]){2,}/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/:\s*\(\s*/g, ": ")
    .replace(/\s*\)\s*([.!]?)\s*$/g, "$1")
    .replace(/^[,\s;:-]+|[,\s;:-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripMoneyTokens(text) {
  return tidy(
    String(text || "")
      .replace(PAREN_MONEY, " ")
      .replace(DOLLAR, " ")
      .replace(USD_BEFORE, " ")
      .replace(USD_AFTER, " ")
      .replace(MONEY_PHRASE, " ")
      .replace(FEE_WORD, " "),
  );
}

function keepSegment(segment) {
  const text = String(segment || "").trim();
  if (!text) return "";
  if (MONEY_LINE.test(text)) return "";
  if (!MONEY_HINT.test(text)) return text;
  const cleaned = stripMoneyTokens(text).replace(/^\.+/, "").trim();
  if (!cleaned || /:\s*$/.test(cleaned) || /^[.\s]+$/.test(cleaned)) return "";
  if (contentWords(cleaned).length < 2) return "";
  if (/\$\s?\d/.test(cleaned)) return "";
  return cleaned;
}

export function driverFacingNotes(notes) {
  if (notes == null || notes === "") return "";
  const normalized = splitFields(notes);
  const kept = [];
  for (const raw of normalized.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/(?<=[.!;])\s+/);
    const keptParts = [];
    for (const part of parts) {
      const next = keepSegment(part);
      if (next) keptParts.push(next);
    }
    if (keptParts.length) kept.push(keptParts.join(" "));
  }
  return kept.join("\n").trim();
}

if (typeof globalThis !== "undefined") {
  globalThis.sanitizeDriverNotes = driverFacingNotes;
}
