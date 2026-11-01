// Car's-back check-in timing and email copy.
// Plain JS so node tests and the edge functions share one rule.
// America/Chicago. An end at or before the start is the next day.
// There is no ending-mileage field. Fuel level is the gauge reading.
// Nudges and the owner alert count from the estimated return to the Benton
// shop: booking end plus the stored one-way drive_minutes (the same Google
// drive the mileage lookup saves, and the same minutes the overnight hotel
// rule adds to get the driver home). No stored drive time uses the end.

export const CHECKIN_TZ = "America/Chicago";
// 10:05 AM America/Chicago on 2026-11-01. Bookings that ended earlier are not nudged.
export const CHECKIN_REQUIRED_FROM = Date.parse("2026-11-01T16:05:00Z");
export const DRIVER_NUDGE_FIRST_MS = 60 * 60 * 1000;
export const DRIVER_NUDGE_EVERY_MS = 3 * 60 * 60 * 1000;
export const DRIVER_NUDGE_CAP = 4;
export const OWNER_MISSING_MS = 4 * 60 * 60 * 1000;
export const CHECKIN_LOOKBACK_DAYS = 3;

export const FUEL_LEVELS = ["empty", "1/4", "1/2", "3/4", "full"];

export const FUEL_LABEL = {
  empty: "Empty",
  "1/4": "1/4",
  "1/2": "1/2",
  "3/4": "3/4",
  full: "Full",
};

export const SEVERITY_LABEL = {
  ok_to_use: "OK to use",
  needs_fix: "Needs fix before next booking",
};

export function addDays(isoDate, days) {
  const [y, m, d] = String(isoDate).slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function clockMinutes(value) {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function normClock(value) {
  const mins = clockMinutes(value);
  if (mins == null) return "";
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function chicagoOffsetMs(utcMs) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: CHECKIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  let hour = Number(parts.hour);
  let day = Number(parts.day);
  let month = Number(parts.month);
  let year = Number(parts.year);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(year, month - 1, day, hour, Number(parts.minute), Number(parts.second));
  return asUtc - utcMs;
}

/** Chicago wall-clock time as a UTC epoch. Returns null when the clock is not a real time. */
export function chicagoWallTimeMs(dateStr, timeStr) {
  const date = String(dateStr || "").slice(0, 10);
  const clock = normClock(timeStr);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !clock) return null;
  const [y, mo, d] = date.split("-").map(Number);
  const [hh, mm] = clock.split(":").map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, hh, mm, 0);
  const offset = chicagoOffsetMs(utcGuess);
  let instant = utcGuess - offset;
  const offset2 = chicagoOffsetMs(instant);
  if (offset2 !== offset) instant = utcGuess - offset2;
  return instant;
}

/**
 * When the booking ends, in epoch ms.
 * Missing end time is 11:59 PM Chicago on the event date.
 * end <= start rolls the end onto the next calendar day.
 */
export function bookingEndMs(eventDate, startTime, endTime) {
  const date = String(eventDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const end = normClock(endTime);
  const startMin = clockMinutes(startTime);
  const endMin = clockMinutes(end);
  if (!end) return chicagoWallTimeMs(date, "23:59");
  const nextDay = startMin != null && endMin != null && endMin <= startMin;
  return chicagoWallTimeMs(nextDay ? addDays(date, 1) : date, end);
}

/**
 * One-way drive minutes already stored on the booking (shop to the event, and
 * the drive back). Blank, negative, or not a number means the drive was not saved.
 */
export function storedDriveMinutes(booking) {
  const raw = booking?.drive_minutes;
  if (raw == null || raw === "") return null;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  return Math.round(minutes);
}

/**
 * When the car should be back at the shop.
 * Stored drive time is added to the booking end. Otherwise this is the end.
 */
export function estimatedReturnMs(booking) {
  const endMs = bookingEndMs(booking?.event_date, booking?.start_time, booking?.end_time);
  if (endMs == null) return null;
  const drive = storedDriveMinutes(booking);
  if (drive == null) return endMs;
  return endMs + drive * 60 * 1000;
}

/** 1-based driver nudge slot, or null when it is too early or past the cap. */
export function driverNudgeSlot(endMs, nowMs) {
  if (endMs == null || nowMs == null) return null;
  const elapsed = nowMs - endMs;
  if (elapsed < DRIVER_NUDGE_FIRST_MS) return null;
  const slot = 1 + Math.floor((elapsed - DRIVER_NUDGE_FIRST_MS) / DRIVER_NUDGE_EVERY_MS);
  if (slot < 1 || slot > DRIVER_NUDGE_CAP) return null;
  return slot;
}

export function ownerMissingDue(endMs, nowMs) {
  if (endMs == null || nowMs == null) return false;
  return nowMs - endMs >= OWNER_MISSING_MS;
}

export function checkinNoticePlan(booking, hasCheckin, nowMs) {
  if (!booking || hasCheckin || !booking.driver_id || booking.status === "cancelled") {
    return { endMs: null, returnMs: null, driverSlot: null, owner: false };
  }
  const endMs = bookingEndMs(booking.event_date, booking.start_time, booking.end_time);
  // The cutoff stays on the booking end. A long drive home does not pull an older booking in.
  if (endMs == null || endMs < CHECKIN_REQUIRED_FROM) {
    return { endMs: null, returnMs: null, driverSlot: null, owner: false };
  }
  const returnMs = estimatedReturnMs(booking);
  return {
    endMs,
    returnMs,
    driverSlot: driverNudgeSlot(returnMs, nowMs),
    owner: ownerMissingDue(returnMs, nowMs),
  };
}

export function formatChicago(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CHECKIN_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(Number(ms)));
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[c]));
}

function fuelLabel(level) {
  return FUEL_LABEL[level] || String(level || "—");
}

function severityLabel(severity) {
  return SEVERITY_LABEL[severity] || String(severity || "—");
}

export function checkinLink(appUrl, bookingId) {
  const base = String(appUrl || "https://app.chanceclassics.com").replace(/\/$/, "");
  return `${base}/#checkin=${bookingId}`;
}

export function checkinOwnerMail({ appUrl, carName, driverName, booking, checkin, photoUrls, photoCount }) {
  const car = carName || "the car";
  const driver = driverName || "The driver";
  const customer = booking?.customer_name || "the booking";
  const fuel = fuelLabel(checkin?.fuel_level);
  const issues = checkin?.has_issues ? "Yes" : "No";
  const severity = severityLabel(checkin?.severity);
  const notes = String(checkin?.notes || "").trim();
  const parked = formatChicago(Date.parse(checkin?.parked_at || "")) || "just now";
  const count = Number(photoCount || 0);
  const urls = (Array.isArray(photoUrls) ? photoUrls : []).filter(Boolean);
  const needsFix = checkin?.severity === "needs_fix";
  const subject = `Car's back — ${car}${needsFix ? " — needs a fix" : ""}`;
  const photoLine = count
    ? `${count} photo${count === 1 ? "" : "s"}${urls.length ? "" : " saved in the garage"}`
    : "No photos";
  const link = String(appUrl || "https://app.chanceclassics.com").replace(/\/$/, "");
  const photoHtml = urls.length
    ? `<ul>${urls.map((url) => `<li><a href="${esc(url)}">${esc(url)}</a></li>`).join("")}</ul>`
    : "";
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f">
    <h2 style="color:#6e1d1a">Car's back</h2>
    <p>${esc(driver)} checked ${esc(car)} in for ${esc(customer)}.</p>
    <table style="border-collapse:collapse;margin:14px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#6b6052">Parked</td><td style="padding:4px 0;font-weight:600">${esc(parked)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b6052">Fuel</td><td style="padding:4px 0;font-weight:600">${esc(fuel)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b6052">Issues</td><td style="padding:4px 0;font-weight:600">${esc(issues)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b6052">Severity</td><td style="padding:4px 0;font-weight:600">${esc(severity)}</td></tr>
      ${notes ? `<tr><td style="padding:4px 12px 4px 0;color:#6b6052;vertical-align:top">Notes</td><td style="padding:4px 0;font-weight:600;white-space:pre-line">${esc(notes)}</td></tr>` : ""}
      <tr><td style="padding:4px 12px 4px 0;color:#6b6052">Photos</td><td style="padding:4px 0;font-weight:600">${esc(photoLine)}</td></tr>
    </table>
    ${photoHtml}
    <p>Photo links last 7 days. The garage keeps the originals.</p>
    <p><a href="${esc(link)}" style="background:#6e1d1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Open the garage</a></p>
  </div>`;
  const text = [
    `${driver} checked ${car} in for ${customer}.`,
    `Parked: ${parked}`,
    `Fuel: ${fuel}`,
    `Issues: ${issues}`,
    `Severity: ${severity}`,
    notes ? `Notes: ${notes}` : "",
    `Photos: ${photoLine}`,
    ...urls,
    link,
  ].filter(Boolean).join("\n");
  return { subject, html, text };
}

export function checkinDriverNudgeMail({ appUrl, carName, driverName, booking, bookingId, slot }) {
  const car = carName || "the car";
  const name = driverName || "there";
  const when = booking?.customer_name ? ` for ${booking.customer_name}` : "";
  const link = checkinLink(appUrl, bookingId);
  const again = slot > 1 ? " This is another reminder." : "";
  const subject = `Car's back — check ${car} in`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f">
    <h2 style="color:#6e1d1a">Is the car home?</h2>
    <p>Hi ${esc(name)}, ${esc(car)} should be back from the booking${esc(when)}. Open the app and confirm it is home and parked.${esc(again)}</p>
    <p><a href="${esc(link)}" style="background:#6e1d1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Check the car in</a></p>
  </div>`;
  const text = `Hi ${name}, ${car} should be back from the booking${when}. Confirm it is home and parked.${again}\n${link}`;
  return { subject, html, text };
}

export function checkinOwnerMissingMail({ appUrl, carName, driverName, booking, bookingId }) {
  const car = carName || "the car";
  const driver = driverName || "The driver";
  const customer = booking?.customer_name || "a booking";
  const link = checkinLink(appUrl, bookingId);
  const subject = `No car check-in yet — ${car}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f">
    <h2 style="color:#6e1d1a">Still no check-in</h2>
    <p>${esc(driver)} has not checked ${esc(car)} in after ${esc(customer)}. Driver pay stays locked until that check-in is in.</p>
    <p><a href="${esc(link)}" style="background:#6e1d1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Open the booking</a></p>
  </div>`;
  const text = `${driver} has not checked ${car} in after ${customer}. Driver pay stays locked until that check-in is in.\n${link}`;
  return { subject, html, text };
}
