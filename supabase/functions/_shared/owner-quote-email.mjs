// Pure helpers for the Wix price-quote webhook.
// No secrets, no network. quote-capture uses these, and node tests import them.

export function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[c]));
}

export function webhookAuthorized(secret, provided) {
  if (!secret) return false;
  return String(provided ?? "") === String(secret);
}

// Recursively collect {label,value} pairs from anywhere in the payload.
export function collectFields(obj, out = {}, depth = 0) {
  if (!obj || depth > 8) return out;
  if (Array.isArray(obj)) {
    for (const i of obj) collectFields(i, out, depth + 1);
    return out;
  }
  if (typeof obj === "object") {
    const label = obj.label ?? obj.fieldName ?? obj.name ?? obj.title ?? obj.key;
    const value = obj.value ?? obj.fieldValue ?? obj.answer ?? obj.text;
    if (typeof label === "string" && (typeof value === "string" || typeof value === "number")) {
      out[label.toLowerCase().trim()] = String(value);
    }
    for (const k of Object.keys(obj)) collectFields(obj[k], out, depth + 1);
  }
  return out;
}

export function byLabel(ff, needles) {
  for (const n of needles) {
    for (const [k, v] of Object.entries(ff)) {
      if (k.includes(n) && v) return v;
    }
  }
  return null;
}

export function toDate(v) {
  if (!v) return null;
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(String(v).replace(/\s+at\s+/i, " ").replace(/\s+[A-Z]{2,4}$/, ""));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function quoteFromWixPayload(body) {
  const ff = collectFields(body);
  const first = byLabel(ff, ["first name"]) ?? "";
  const last = byLabel(ff, ["last name"]) ?? "";
  const name = [first, last].filter(Boolean).join(" ") || byLabel(ff, ["name"]) || null;
  const dateTime = byLabel(ff, ["event date and time", "event date", "date and time"]);
  let eventTime = null;
  if (dateTime) {
    const tm = String(dateTime).match(/(\d{1,2}:\d{2}(:\d{2})?\s*[AP]?M?)/i);
    eventTime = tm ? tm[1] : null;
  }
  return {
    customer_name: name,
    customer_email: byLabel(ff, ["email"]),
    customer_phone: byLabel(ff, ["phone", "contact number"]),
    service_name: byLabel(ff, ["select a service", "service"]),
    event_type: byLabel(ff, ["type of event"]),
    event_date: toDate(dateTime),
    event_time: eventTime,
    event_date_raw: dateTime,
    event_location: byLabel(ff, ["event location", "location"]),
    details: byLabel(ff, ["more details", "give us more details", "details"]),
    planner: byLabel(ff, ["event planner"]),
  };
}

export function matchCar(service, cars) {
  if (!service || !Array.isArray(cars)) return null;
  const s = String(service).toLowerCase();
  return cars.find((c) => c && c.name && s.startsWith(String(c.name).toLowerCase()))
    ?? cars.find((c) => c && c.name && s.includes(String(c.name).toLowerCase()))
    ?? null;
}

function oneLine(s) {
  return String(s ?? "").replace(/[\r\n]+/g, " ").trim();
}

function filled(value) {
  if (value == null) return "";
  return String(value).trim();
}

export function ownerQuoteRequestSubject(quote) {
  const q = quote ?? {};
  const who = oneLine(q.customer_name);
  const when = oneLine(q.event_date);
  if (who && when) return `New price quote request — ${who} / ${when}`;
  if (who) return `New price quote request — ${who}`;
  if (when) return `New price quote request — ${when}`;
  return "New price quote request";
}

export function ownerQuoteRequestRows(quote) {
  const q = quote ?? {};
  const rows = [];
  const add = (label, value) => {
    const text = filled(value);
    if (text) rows.push([label, text]);
  };
  add("Customer", q.customer_name);
  add("Email", q.customer_email);
  add("Phone", q.customer_phone);
  add("Service / car", q.service_name);
  add("Car", q.car_name);
  add("Event", q.event_type);
  add("Date", q.event_date);
  add("Time", q.event_time);
  if (!filled(q.event_date) && filled(q.event_date_raw)) {
    add("Event date and time", q.event_date_raw);
  }
  add("Location", q.event_location);
  add("Details", q.details);
  if (filled(q.planner)) add("Event planner", q.planner);
  return rows;
}

export function ownerQuoteRequestHtml(quote, appUrl) {
  const rows = ownerQuoteRequestRows(quote)
    .map(([k, v]) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#6b6052;font-size:13px;vertical-align:top">${esc(k)}</td><td style="padding:4px 0;font-weight:600;white-space:pre-line">${esc(v)}</td></tr>`
    )
    .join("");
  const link = filled(appUrl)
    ? `<p><a href="${esc(appUrl)}">Open the app</a></p>`
    : "";
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f"><h2 style="color:#6e1d1a">New price quote request</h2><p>A Price Quote form was just saved in the app.</p><table style="border-collapse:collapse;margin:14px 0">${rows}</table>${link}</div>`;
}
