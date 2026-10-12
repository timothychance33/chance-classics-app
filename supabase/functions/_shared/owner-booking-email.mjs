// Owner "new booking" email. No secrets and no network.
// send-notification and node tests both import this.

export function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[c]));
}

function oneLine(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function moneyNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/[$,]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function formatClock(value) {
  const text = oneLine(value);
  if (!text) return "";
  if (/[ap]m/i.test(text)) return text.replace(/\s*([ap]m)/i, (_, ap) => ` ${ap.toUpperCase()}`);
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return text;
  let hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
}

export function bookingWhen(booking) {
  const start = formatClock(booking?.start_time);
  const end = formatClock(booking?.end_time);
  if (start && end) return `${start} – ${end}`;
  return start || end;
}

export function bookingPriceText(booking) {
  const direct = moneyNumber(booking?.price ?? booking?.total_usd ?? booking?.total);
  if (direct != null) return `$${direct.toFixed(2)}`;
  const notes = String(booking?.notes || "");
  const patterns = [
    /Price:\s*\$([0-9]+(?:\.[0-9]+)?)/i,
    /Booking total:\s*\$([0-9]+(?:\.[0-9]+)?)/i,
    /Quote total:\s*\$([0-9]+(?:\.[0-9]+)?)/i,
  ];
  for (const pattern of patterns) {
    const match = notes.match(pattern);
    const amount = match ? moneyNumber(match[1]) : null;
    if (amount != null) return `$${amount.toFixed(2)}`;
  }
  return "";
}

export function bookingPlannerText(booking) {
  const direct = oneLine(booking?.planner);
  if (direct) return direct;
  const notes = String(booking?.notes || "");
  const line = notes.match(/^Event Planner(?: Name and Contact Info)?:\s*(.+)$/im);
  if (line && oneLine(line[1])) return oneLine(line[1]);
  const role = oneLine(booking?.day_of_contact_role);
  if (/planner/i.test(role)) {
    return [booking?.day_of_contact_name, booking?.day_of_contact_phone, role].map(oneLine).filter(Boolean).join(" · ");
  }
  return "";
}

export function bookingEventLocation(booking) {
  const direct = oneLine(booking?.event_location);
  if (direct) return direct;
  const notes = String(booking?.notes || "");
  const line = notes.match(/^Event Location:\s*(.+)$/im);
  return line ? oneLine(line[1]) : "";
}

export function ownerBookingCreatedSubject(booking) {
  const who = oneLine(booking?.customer_name);
  const when = oneLine(booking?.event_date);
  const tail = [who, when].filter(Boolean).join(" / ");
  return tail ? `New Chance Classics booking — ${tail}` : "New Chance Classics booking";
}

export function ownerBookingCreatedRows(booking) {
  const pickup = oneLine(booking?.pickup_location);
  const eventLocation = bookingEventLocation(booking);
  const samePlace = pickup && eventLocation && pickup.toLowerCase() === eventLocation.toLowerCase();
  const rows = [
    ["Booking id", oneLine(booking?.id)],
    ["Client", oneLine(booking?.customer_name)],
    ["Phone", oneLine(booking?.customer_phone)],
    ["Email", oneLine(booking?.customer_email)],
    ["Car", oneLine(booking?.car_name)],
    ["Date", oneLine(booking?.event_date)],
    ["Time", bookingWhen(booking)],
  ];
  if (samePlace) rows.push(["Pickup / event location", pickup]);
  else {
    if (pickup) rows.push(["Pickup", pickup]);
    if (eventLocation) rows.push(["Event location", eventLocation]);
    if (!pickup && !eventLocation) {
      const dropoff = oneLine(booking?.return_location);
      if (dropoff) rows.push(["Pickup / event location", dropoff]);
    }
  }
  rows.push(["Price", bookingPriceText(booking)]);
  rows.push(["Planner", bookingPlannerText(booking)]);
  return rows.filter(([, value]) => value);
}

export function ownerBookingCreatedHtml(booking, appUrl) {
  const rows = ownerBookingCreatedRows(booking)
    .map(([label, value]) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#6b6052;font-size:13px;vertical-align:top">${esc(label)}</td><td style="padding:4px 0;font-weight:600">${esc(value)}</td></tr>`,
    )
    .join("");
  const link = oneLine(appUrl);
  const button = link
    ? `<p><a href="${esc(link)}" style="background:#6e1d1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Open the app</a></p>`
    : "";
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f">
    <h2 style="color:#6e1d1a">New booking</h2>
    <p>A Chance Classics booking was just created.</p>
    <table style="border-collapse:collapse;margin:14px 0">${rows}</table>
    ${button}
  </div>`;
}

/** Hold and cancelled rows are not a booking Tim needs. A stamp means the email already went out. */
export function shouldEmailOwnerAboutBooking(row) {
  if (!row || row.owner_notified_at) return false;
  const status = String(row.status || "").trim().toLowerCase();
  if (!status || status === "hold" || status === "cancelled") return false;
  return true;
}
