// Shared helpers for send-notification
export const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
export const NOTIFY_SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";
export const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") ?? "chanceclassics@gmail.com";
export const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@chanceclassics.com";
export const APP_URL = Deno.env.get("APP_URL") ?? "https://app.chanceclassics.com";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-notify-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function esc(s: unknown) {
  return (s ?? "").toString().replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[c] as string));
}

export async function sendEmail(to: string, subject: string, html: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: `Chance Classics <${FROM_EMAIL}>`, to, subject, html }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Resend ${r.status}: ${t}`);
  }
  return await r.json();
}

export function bookingBlock(b: Record<string, unknown>) {
  const rows: [string, unknown][] = [
    ["Customer", b.customer_name],
    ["Event", b.event_type],
    ["Date", b.event_date],
    ["Time", b.start_time],
    ["Car", b.car_name],
    ["Pickup", b.pickup_location],
    ["Drop-off", b.return_location],
  ];
  return rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b6052;font-size:13px">${k}</td><td style="padding:4px 0;font-weight:600">${v}</td></tr>`)
    .join("");
}

export function driverBookingBlock(b: Record<string, unknown>) {
  const time = [b.start_time, b.end_time].filter(Boolean).join(" – ");
  const rows: [string, unknown][] = [
    ["Customer", b.customer_name],
    ["Event", b.event_type],
    ["Date", b.event_date],
    ["Time", time || b.start_time],
    ["Car", b.car_name],
    ["Pickup", b.pickup_location],
    ["Drop-off", b.return_location],
    ["Phone", b.customer_phone],
    ["Email", b.customer_email],
    ["Notes", b.notes],
    ["Status", b.status],
  ];
  let html = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b6052;font-size:13px;vertical-align:top">${esc(k)}</td><td style="padding:4px 0;font-weight:600;white-space:pre-line">${esc(v)}</td></tr>`)
    .join("");
  if (b.needs_trailer) {
    html += `<tr><td style="padding:4px 12px 4px 0;color:#6b6052;font-size:13px">Trailer</td><td style="padding:4px 0;font-weight:600">Yes — car must be trailered</td></tr>`;
  }
  return html;
}

export function wrap(inner: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f">${inner}</div>`;
}

export function appButton(label: string) {
  return `<p><a href="${APP_URL}" style="background:#6e1d1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">${esc(label)}</a></p>`;
}

export function payLine(pay: unknown) {
  if (pay == null || pay === "") return "";
  return `<p style="font-size:18px;font-weight:700;color:#3c6b4f">You earn $${esc(pay)}</p>`;
}

export function bookingTitle(b: Record<string, unknown>) {
  const who = b.customer_name || b.event_type || "Booking";
  const when = b.event_date ? ` — ${b.event_date}` : "";
  return `${who}${when}`;
}
