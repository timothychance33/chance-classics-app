// Customer balance pay-link email. No secrets and no network.
// scheduled-tasks and send-notification both import this.
// The Monday reminder and a one-click garage pay link use the same copy.

function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[c]));
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function balanceEventDate(isoDate) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return `${DOW[dt.getUTCDay()]} ${MON[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
}

export function balanceFirstName(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return first || "there";
}

export function balancePaySubject(eventDate) {
  const date = balanceEventDate(eventDate);
  return date
    ? `Your ${date} Chance Classics booking: final details`
    : "Your Chance Classics booking: final details";
}

function money(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  return `$${n.toFixed(2)}`;
}

function safePayUrl(value) {
  const url = String(value || "").trim();
  return /^https:\/\//i.test(url) ? url : "";
}

function clock(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  let hour = Number(match[1]);
  if (hour > 23) return "";
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${match[2]}${suffix}`;
}

function minutesOf(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const mins = Number(match[2]);
  if (hour > 23 || mins > 59) return null;
  return hour * 60 + mins;
}

function timeLabel(input) {
  const startRaw = input?.startTime ?? input?.start_time;
  const endRaw = input?.endTime ?? input?.end_time;
  const start = clock(startRaw);
  const end = clock(endRaw);
  if (start && end) {
    const startMin = minutesOf(startRaw);
    const endMin = minutesOf(endRaw);
    const nextDay = startMin != null && endMin != null && endMin <= startMin;
    return nextDay ? `${start} – ${end} the next day` : `${start} – ${end}`;
  }
  return start || end;
}

function detailPairs(input) {
  const pairs = [
    ["Date", balanceEventDate(input?.eventDate) || ""],
    ["Time", timeLabel(input)],
    ["Event", String(input?.eventType ?? input?.event_type ?? "").trim()],
    ["Car", String(input?.car ?? input?.carName ?? input?.car_name ?? "").trim()],
    ["Pickup", String(input?.pickup ?? input?.pickupLocation ?? input?.pickup_location ?? "").trim()],
    ["Drop-off", String(input?.dropoff ?? input?.returnLocation ?? input?.return_location ?? "").trim()],
    ["Balance", money(input?.amount)],
    ["Overnight driver hotel", String(input?.hotelLine || "").trim()],
  ];
  return pairs.filter(([, value]) => value);
}

export const MONDAY_DRIVER_LINE =
  "You'll get your driver's name and contact info the day before your event.";

function warmCopy(input) {
  const who = balanceFirstName(input?.firstName ?? input?.customerName);
  const date = balanceEventDate(input?.eventDate) || "your event";
  const car = String(input?.car ?? input?.carName ?? input?.car_name ?? "").trim();
  const carSentence = car
    ? `${car} is getting polished up and ready to roll.`
    : "Your car is getting polished up and ready to roll.";
  return {
    who,
    greeting: `We're so excited to be a part of your event on ${date}! ${carSentence}`,
    balance: input?.taxExempt
      ? `Your remaining balance is ${money(input?.amount)}. Tax exempt. It is due the day before your event. You can pay securely with the button below.`
      : `Your remaining balance is ${money(input?.amount)} (the booking total includes 10.25% sales tax), due the day before your event. You can pay securely with the button below.`,
  };
}

export function balancePayHtml(input) {
  const copy = warmCopy(input);
  const href = safePayUrl(input?.payUrl ?? input?.pay_url);
  const button = href
    ? `<p><a href="${esc(href)}" style="background:#6e1d1a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Pay the balance</a></p>`
    : "";
  const details = detailPairs(input)
    .map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b6052;font-size:13px;vertical-align:top">${esc(label)}</td><td style="padding:4px 0;font-weight:600">${esc(value)}</td></tr>`)
    .join("");
  const detailsTable = details
    ? `<table style="border-collapse:collapse;margin:14px 0">${details}</table>`
    : "";
  const writtenLink = href
    ? `<p style="font-size:14px;word-break:break-all;margin:0 0 16px">${esc(href)}</p>`
    : "";
  const driverLine = input?.mondayReminder ? `<p>${esc(MONDAY_DRIVER_LINE)}</p>` : "";
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f">
    <p>Hi ${esc(copy.who)},</p>
    <p>${esc(copy.greeting)}</p>
    <p>${esc(copy.balance)}</p>
    ${button}
    ${detailsTable}
    ${writtenLink}
    ${driverLine}
    <p>If you have any questions at all, just reply to this email or give us a call at (318) 344-5001.</p>
    <p>See you soon!<br>Tim Chance<br>Chance Classics</p>
  </div>`;
}

export function balancePayText(input) {
  const copy = warmCopy(input);
  const href = safePayUrl(input?.payUrl ?? input?.pay_url);
  const lines = [
    `Hi ${copy.who},`,
    "",
    copy.greeting,
    "",
    copy.balance,
  ];
  if (href) lines.push("", "Pay the balance");
  const details = detailPairs(input);
  if (details.length) {
    lines.push("");
    for (const [label, value] of details) lines.push(`${label}: ${value}`);
  }
  if (href) lines.push("", href);
  if (input?.mondayReminder) lines.push("", MONDAY_DRIVER_LINE);
  lines.push(
    "",
    "If you have any questions at all, just reply to this email or give us a call at (318) 344-5001.",
    "",
    "See you soon!",
    "Tim Chance",
    "Chance Classics",
  );
  return lines.join("\n");
}
