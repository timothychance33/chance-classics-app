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
    ? `Getting ready for your event on ${date}, balance due`
    : "Getting ready for your event, balance due";
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

export function balancePayHtml(input) {
  const who = esc(balanceFirstName(input?.firstName ?? input?.customerName));
  const date = esc(balanceEventDate(input?.eventDate) || "your event");
  const car = String(input?.car ?? input?.carName ?? "").trim();
  const carSentence = car
    ? `${esc(car)} is getting polished up and ready to roll.`
    : "Your car is getting polished up and ready to roll.";
  const href = safePayUrl(input?.payUrl ?? input?.pay_url);
  const button = href
    ? `<p><a href="${esc(href)}" style="background:#6e1d1a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Pay the balance</a></p>`
    : "";
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f">
    <p>Hi ${who},</p>
    <p>We're so excited to be a part of your event on ${date}! ${carSentence}</p>
    <p>Your remaining balance is ${esc(money(input?.amount))} (the booking total includes 10.25% sales tax), due the day before your event. You can pay securely with the button below.</p>
    ${button}
    <p>If you have any questions at all, just reply to this email or give us a call at (318) 344-5001.</p>
    <p>See you soon!<br>Tim Chance<br>Chance Classics</p>
  </div>`;
}
