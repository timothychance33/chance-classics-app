// Day-before client email. No secrets and no network.
// scheduled-tasks fills the pay link, then sends with the same Resend wrapper
// as the Monday balance reminder (FROM_EMAIL, reply-to, plain text).

import { balanceEventDate, balanceFirstName } from "./balance-pay-email.mjs";
import { formatClock } from "./owner-booking-email.mjs";
import { carLabelFor } from "./car-label.mjs";

export const BUSINESS_PHONE = "318-344-5001";
export const NO_DRIVER_LINE = "Your driver will be confirmed shortly — questions? Call 318-344-5001.";
export const DAY_BEFORE_STATUSES = ["confirmed", "prepping", "ready", "out", "completed"];
export const PAID_NEW_PAYMENTS = ["deposit", "paid"];

/** A Wix or garage row can stay `new` after a deposit or full payment. That row is confirmed for this email. */
export function isPaidNewBooking(booking) {
  const status = String(booking?.status || "").trim().toLowerCase();
  const pay = String(booking?.payment_status || "").trim().toLowerCase();
  return status === "new" && PAID_NEW_PAYMENTS.includes(pay);
}

const SKIP_STATUSES = new Set([
  "cancelled",
  "canceled",
  "declined",
  "new",
  "hold",
  "draft",
  "unconfirmed",
  "inquiry",
  "pending",
]);

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[char]));
}

function addIsoDays(iso, days) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** First hourly run at or after 10:00 AM America/Chicago. eventDate is the next Chicago date. */
export function dayBeforeWindow(chicago) {
  const date = String(chicago?.date || "");
  const hour = Number(chicago?.hour);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(hour)) {
    return { ok: false, reason: "Chicago clock is missing", eventDate: "" };
  }
  if (hour < 10) {
    return {
      ok: false,
      reason: `before 10:00 AM in America/Chicago (hour ${hour})`,
      eventDate: "",
    };
  }
  return { ok: true, eventDate: addIsoDays(date, 1) };
}

/**
 * reviewed_at and photos_received_at stop only the post-event review and photo
 * reminders. replied_at is the flag whose comment says it suppresses all reminders.
 */
export function dayBeforeSkipReason(booking) {
  const status = String(booking?.status || "").trim().toLowerCase();
  const eligibleStatus = isPaidNewBooking(booking)
    || (Boolean(status) && !SKIP_STATUSES.has(status) && DAY_BEFORE_STATUSES.includes(status));
  if (!eligibleStatus) {
    if (status === "cancelled" || status === "canceled") return "cancelled";
    if (status === "declined") return "declined";
    return "unconfirmed";
  }
  if (String(booking?.source || "").trim().toLowerCase() === "site-test") return "test";
  const email = String(booking?.customer_email || "").trim();
  if (!email || !email.includes("@")) return "no_email";
  if (booking?.day_before_email_sent_at) return "already_sent";
  if (booking?.replied_at) return "suppressed";
  return "";
}

function money(amount) {
  return `$${Number(amount).toFixed(2)}`;
}

export function balanceDue(booking) {
  const raw = booking?.balance_due_usd;
  if (raw != null && raw !== "") {
    const amount = Math.round(Number(raw) * 100) / 100;
    if (Number.isFinite(amount)) return amount;
  }
  if (booking?.total_usd != null && booking.total_usd !== "") {
    const total = Number(booking.total_usd);
    const paid = Number(booking.amount_paid_usd || 0);
    if (Number.isFinite(total)) return Math.round((total - paid) * 100) / 100;
  }
  const notes = String(booking?.notes || "");
  const due = notes.match(/Price:\s*\$([0-9]+(?:\.[0-9]+)?)(?:\s*\(\$?([0-9]+(?:\.[0-9]+)?)\s*due\))?/i);
  if (due && due[2] != null) {
    const amount = Math.round(Number(due[2]) * 100) / 100;
    if (Number.isFinite(amount)) return amount;
  }
  const billed = notes.match(/Balance billed separately:\s*\$([0-9]+(?:\.[0-9]+)?)/i);
  if (billed) {
    const amount = Math.round(Number(billed[1]) * 100) / 100;
    if (Number.isFinite(amount)) return amount;
  }
  if (String(booking?.payment_status || "").toLowerCase() === "paid") return 0;
  return null;
}

function clockMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function hoursBetween(start, end) {
  const from = clockMinutes(start);
  const to = clockMinutes(end);
  if (from == null || to == null || from === to) return null;
  let diff = to - from;
  if (diff < 0) diff += 24 * 60;
  return diff / 60;
}

function formatHours(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value) || value <= 0 || value > 16) return "";
  const half = Math.round(value * 2) / 2;
  const shown = Math.abs(value - half) <= 0.05 ? half : Math.round(value * 10) / 10;
  const text = String(shown);
  return `${text} hour${shown === 1 ? "" : "s"}`;
}

function hoursFromText(value) {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  return match ? Number(match[1]) : null;
}

const NOTE_FIELDS = [
  ["occasion", /^occasion\s*:\s*(.*)$/i],
  ["duration", /^duration\s*:\s*(.*)$/i],
  ["rentalPeriod", /^rental period\s*:\s*(.*)$/i],
  ["eventLocation", /^event location\s*:\s*(.*)$/i],
  ["dropoff", /^drop(?:\s|-)?off location(?:\s*\([^)]*\))?\s*:\s*(.*)$/i],
  ["dropoff", /^drop-off\s*:\s*(.*)$/i],
  ["additional", /^additional notes\s*:\s*(.*)$/i],
];

export function clientNoteFields(notes) {
  const fields = {};
  let current = "";
  for (const raw of String(notes || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let matched = false;
    for (const [key, pattern] of NOTE_FIELDS) {
      const hit = line.match(pattern);
      if (!hit) continue;
      current = key;
      const bit = String(hit[1] || "").trim();
      fields[key] = fields[key] ? `${fields[key]}\n${bit}` : bit;
      matched = true;
      break;
    }
    if (matched) continue;
    if (/^[A-Za-z][^:]{0,80}:\s*\S/.test(line)) {
      current = "";
      continue;
    }
    if (current && fields[current]) fields[current] = `${fields[current]}\n${line}`.trim();
  }
  return fields;
}

function clean(value) {
  return String(value || "").replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

function uniqueParts(parts) {
  const out = [];
  const seen = new Set();
  for (const part of parts) {
    const text = clean(part);
    if (!text) continue;
    const key = text.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out.join("\n");
}

function realOccasion(value) {
  const text = clean(value);
  if (!text || /^rental\s*:/i.test(text)) return "";
  return text;
}

function quoteDropoff(quote) {
  const column = clean(quote?.dropoff_location);
  if (column) return column;
  const match = String(quote?.details || "").match(/^Drop-off:\s*(.+)$/im);
  return match ? clean(match[1]) : "";
}

export function tripDetails(booking, car, quote) {
  const notes = clientNoteFields(booking?.notes);
  const fromClock = formatHours(hoursBetween(booking?.start_time, booking?.end_time));
  const fromQuote = formatHours(quote?.hours);
  const fromDuration = formatHours(hoursFromText(notes.duration));
  const fromPeriod = formatHours(hoursFromText(notes.rentalPeriod));
  return {
    car: carLabelFor(car),
    date: balanceEventDate(booking?.event_date),
    pickupTime: formatClock(booking?.start_time),
    pickup: clean(booking?.pickup_location) || clean(quote?.event_location) || clean(notes.eventLocation),
    stops: uniqueParts([
      booking?.return_location,
      quoteDropoff(quote),
      notes.dropoff,
      notes.additional,
    ]),
    hours: fromClock || fromQuote || fromDuration || fromPeriod,
    occasion: realOccasion(notes.occasion) || realOccasion(booking?.event_type) || realOccasion(quote?.event_type),
  };
}

function safePayUrl(value) {
  const url = String(value || "").trim();
  return /^https:\/\//i.test(url) ? url : "";
}

function telHref(phone) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "";
}

function phoneLink(phone) {
  const text = clean(phone);
  const href = telHref(text);
  if (!text) return "";
  if (!href) return esc(text);
  return `<a href="${esc(href)}" style="color:#6e1d1a">${esc(text)}</a>`;
}

export function bookingTaxExempt(booking) {
  const flag = booking?.tax_exempt;
  if (flag === true || String(flag).toLowerCase() === "true") return true;
  if (flag === false || String(flag).toLowerCase() === "false") return false;
  return /(?:^|\n)\s*Tax exempt\b/i.test(String(booking?.notes || ""));
}

function paymentCopy(balance, taxExempt) {
  const exempt = taxExempt ? " Tax exempt." : "";
  if (balance == null) {
    return `If a balance is still open, it is due the day before your event. Call ${BUSINESS_PHONE} and we will confirm the amount.${exempt}`;
  }
  if (balance <= 0) return `Paid in full.${exempt}`;
  const line = `Balance remaining ${money(balance)}. The balance is due the day before your event.${exempt}`;
  if (balance < 0.5) return `${line} Call ${BUSINESS_PHONE} to pay it.`;
  return line;
}

function detailPairs(details) {
  return [
    ["Status", "Confirmed"],
    ["Car", details.car],
    ["Date", details.date],
    ["Pickup time", details.pickupTime],
    ["Pickup", details.pickup],
    ["Stops / destination", details.stops],
    ["Hours", details.hours],
    ["Occasion", details.occasion],
  ].filter(([, value]) => clean(value));
}

function detailHtml(pairs) {
  return pairs.map(([label, value]) => {
    const body = esc(value).replace(/\n/g, "<br>");
    return `<p style="margin:0 0 12px"><span style="display:block;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#6b6052">${esc(label)}</span><span style="display:block;font-size:16px;line-height:1.45;font-weight:600">${body}</span></p>`;
  }).join("");
}

function driverBlock(driver) {
  const name = clean(driver?.name);
  const phone = clean(driver?.phone);
  if (!name) {
    return {
      assigned: false,
      html: `<p style="margin:16px 0;font-size:16px;line-height:1.45">${esc(NO_DRIVER_LINE)}</p>`,
      text: NO_DRIVER_LINE,
    };
  }
  const phoneText = phone ? ` Phone: ${phone}.` : "";
  const phoneHtml = phone ? `<br>Phone: ${phoneLink(phone)}` : "";
  return {
    assigned: true,
    html: `<p style="margin:16px 0 12px"><span style="display:block;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#6b6052">Driver</span><span style="display:block;font-size:16px;line-height:1.45;font-weight:600">${esc(name)}${phoneHtml}</span></p>`,
    text: `Driver: ${name}.${phoneText}`,
  };
}

export function renderDayBeforeEmail(input) {
  const booking = input?.booking || {};
  const details = tripDetails(booking, input?.car, input?.quote);
  const balance = balanceDue(booking);
  const needsPayLink = balance != null && balance >= 0.5;
  const payUrl = needsPayLink ? safePayUrl(input?.payUrl) : "";
  const who = balanceFirstName(booking.customer_name);
  const payment = paymentCopy(balance, bookingTaxExempt(booking));
  const driver = driverBlock(input?.driver);
  const pairs = detailPairs(details);
  const button = payUrl
    ? `<p style="margin:16px 0"><a href="${esc(payUrl)}" style="background:#6e1d1a;color:#ffffff;padding:14px 18px;border-radius:8px;text-decoration:none;display:block;text-align:center;font-weight:700;font-size:16px">Pay the balance</a></p><p style="font-size:14px;line-height:1.45;word-break:break-all;margin:0 0 16px">${esc(payUrl)}</p>`
    : "";
  const questionsHtml = driver.assigned
    ? `<p style="margin:16px 0">Questions? Call ${phoneLink(BUSINESS_PHONE)}.</p>`
    : "";
  const questionsText = driver.assigned ? ["", `Questions? Call ${BUSINESS_PHONE}.`] : [];
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f;font-size:16px;line-height:1.45">
    <p style="margin:0 0 12px">Hi ${esc(who)},</p>
    <p style="margin:0 0 16px">Your booking for tomorrow is confirmed.</p>
    ${detailHtml(pairs)}
    <p style="margin:4px 0 0;font-size:16px;line-height:1.45">${esc(payment)}</p>
    ${button}
    ${driver.html}
    ${questionsHtml}
    <p style="margin:16px 0 0">See you tomorrow,<br>Tim Chance<br>Chance Classics<br>${phoneLink(BUSINESS_PHONE)}</p>
  </div>`;
  const lines = [
    `Hi ${who},`,
    "",
    "Your booking for tomorrow is confirmed.",
    "",
  ];
  for (const [label, value] of pairs) lines.push(`${label}: ${clean(value).replace(/\n/g, " / ")}`);
  lines.push("", payment);
  if (payUrl) lines.push("", "Pay the balance", payUrl);
  lines.push("", driver.text, ...questionsText, "", "See you tomorrow,", "Tim Chance", "Chance Classics", BUSINESS_PHONE);
  return {
    subject: "Tomorrow: your Chance Classics booking",
    html,
    text: lines.join("\n"),
    balance,
    needsPayLink,
    payUrl,
  };
}
