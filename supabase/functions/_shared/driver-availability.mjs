// Who may be offered a booking, and who may claim it.
//
// Overlap uses the same 2-hour prep/travel buffer as car availability
// (BOOKING_BUFFER_HOURS in lib/quotes.mjs and index.html). Cancelled
// bookings are ignored. A driver is busy only when driver_id is already
// set on another non-cancelled booking.
//
// When both bookings have a date, a start, and an end:
//   If end is at or before start, the end is the next calendar day
//   (22:00–00:00). Expand one booking by 2 hours on both sides and
//   compare that to the other booking's raw [start, end). They overlap
//   when expandedStart < otherEnd and otherStart < expandedEnd.
//   Touching endpoints do not overlap, so a job that starts exactly when
//   the buffer ends is free. The check is symmetric: buffering either
//   side gives the same answer. That is a 2-hour gap, not 4.
// When either booking is missing a start or an end, the window cannot
// be placed, so the same calendar date counts as an overlap. Different
// dates do not.
//
// The database trigger in
// supabase/migrations/20261017160000_driver_claim_no_time_overlap.sql
// uses this same rule. It is not applied automatically.

export const BOOKING_BUFFER_HOURS = 2;
export const DRIVER_BUSY_MESSAGE = 'You already have a booking at that time';

const MINUTES_PER_DAY = 1440;

export function clockMinutes(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  const ampm = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])$/);
  if (ampm) {
    let hours = Number(ampm[1]);
    const minutes = Number(ampm[2]);
    const pm = ampm[3].toLowerCase() === 'pm';
    if (hours === 12) hours = pm ? 12 : 0;
    else if (pm) hours += 12;
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function dayNumber(iso) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

export function blockedInterval(booking, bufferHours = BOOKING_BUFFER_HOURS) {
  if (!booking || booking.status === 'cancelled' || !booking.event_date) return null;
  const day = dayNumber(booking.event_date);
  const startMin = clockMinutes(booking.start_time);
  const endMin = clockMinutes(booking.end_time);
  if (day == null || startMin == null || endMin == null) return null;
  let end = endMin;
  if (end <= startMin) end += MINUTES_PER_DAY;
  const buffer = Number(bufferHours) * 60;
  const origin = day * MINUTES_PER_DAY;
  return { start: origin + startMin - buffer, end: origin + end + buffer };
}

export function intervalsOverlap(a, b) {
  return !!(a && b && a.start < b.end && b.start < a.end);
}

export function driverWindowsOverlap(a, b) {
  if (!a || !b) return false;
  if (a.status === 'cancelled' || b.status === 'cancelled') return false;
  const blocked = blockedInterval(a);
  const raw = blockedInterval(b, 0);
  if (blocked && raw) return intervalsOverlap(blocked, raw);
  const da = a.event_date ? String(a.event_date).slice(0, 10) : '';
  const db = b.event_date ? String(b.event_date).slice(0, 10) : '';
  return !!(da && da === db);
}

export function driverBusyWith(driverId, booking, bookings) {
  if (!driverId || !booking) return null;
  const id = booking.id == null ? null : String(booking.id);
  return (bookings || []).find((other) => {
    if (!other || other.driver_id !== driverId) return false;
    if (id != null && String(other.id) === id) return false;
    return driverWindowsOverlap(booking, other);
  }) || null;
}

function hasDriverRole(staff) {
  return String(staff?.role || '').split(',').map((part) => part.trim()).includes('driver');
}

export function offerCandidates(staff, booking) {
  return (staff || []).filter((d) =>
    d && d.active && hasDriverRole(d) && (!booking?.needs_trailer || d.pulls_trailer !== false)
  );
}

export function offerRankFor(staff, booking, bookings, passedIds, afterRank) {
  const passed = passedIds || [];
  const ranks = offerCandidates(staff, booking)
    .filter((d) => d.priority != null && !passed.includes(d.id) && !driverBusyWith(d.id, booking, bookings))
    .filter((d) => afterRank == null || d.priority > afterRank)
    .map((d) => d.priority);
  return ranks.length ? Math.min(...ranks) : null;
}

export function isDriverTurn(driver, booking) {
  if (!driver || driver.priority == null || !booking || booking.driver_id) return false;
  if (booking.needs_trailer && driver.pulls_trailer === false) return false;
  if (booking.open_to_all) return true;
  if (booking.offer_rank == null) return false;
  if ((booking.passed_by || []).includes(driver.id)) return false;
  return driver.priority === booking.offer_rank;
}

export function claimDecision({ me, booking, bookings }) {
  if (!me) return { ok: false, status: 403, error: 'No crew record linked to your login' };
  if (!booking) return { ok: false, status: 404, error: 'Booking not found' };
  if (booking.status === 'cancelled') return { ok: false, status: 409, error: 'This booking was cancelled' };
  if (booking.driver_id) return { ok: false, status: 409, error: 'This booking is already claimed' };
  if (!isDriverTurn(me, booking)) return { ok: false, status: 403, error: 'This offer is not yours to claim' };
  if (driverBusyWith(me.id, booking, bookings)) {
    return { ok: false, status: 409, error: DRIVER_BUSY_MESSAGE };
  }
  return { ok: true };
}

// Open offers still pointed at this driver after they took an overlapping job.
// Returns the row patches; the caller writes them and emails the next driver.
export function busyOfferAdvances(staff, driver, openOffers, bookings) {
  if (!driver) return [];
  const advances = [];
  for (const booking of openOffers || []) {
    if (!booking || booking.driver_id || booking.open_to_all || booking.status === 'cancelled') continue;
    if (booking.offer_rank == null || driver.priority !== booking.offer_rank) continue;
    if ((booking.passed_by || []).includes(driver.id)) continue;
    if (!driverBusyWith(driver.id, booking, bookings)) continue;
    const passed = [...(booking.passed_by || [])];
    if (!passed.includes(driver.id)) passed.push(driver.id);
    const offerRank = offerRankFor(staff, booking, bookings, passed, booking.offer_rank);
    advances.push({
      id: booking.id,
      passed_by: passed,
      offer_rank: offerRank,
      offered_at: offerRank != null ? true : null,
    });
  }
  return advances;
}
