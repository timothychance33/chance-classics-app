// Shared helpers for driver booking emails.
// Used by unit tests. The browser app and edge functions keep a copy of
// the same rules so a booking edit and the Monday digest stay in sync.

export const CHICAGO_TZ = 'America/Chicago';

export const DRIVER_FACING_FIELDS = [
  { key: 'event_date', label: 'Date' },
  { key: 'start_time', label: 'Start' },
  { key: 'end_time', label: 'End' },
  { key: 'car_id', label: 'Car' },
  { key: 'pickup_location', label: 'Pickup' },
  { key: 'return_location', label: 'Drop-off' },
  { key: 'customer_name', label: 'Customer' },
  { key: 'event_type', label: 'Event' },
  { key: 'customer_phone', label: 'Phone' },
  { key: 'customer_email', label: 'Email' },
  { key: 'notes', label: 'Notes' },
  { key: 'needs_trailer', label: 'Trailer' },
  { key: 'pay_tier', label: 'Pay tier' },
  { key: 'status', label: 'Status' },
];

// Owner-only / internal fields. Changing these must not email the driver.
export const OWNER_ONLY_FIELDS = [
  'payment_status',
  'offer_rank',
  'passed_by',
  'offered_at',
  'offer_warned',
  'open_to_all',
  'assigned_by',
  'release_requested',
  'source',
  'wix_booking_id',
  'review_email_sent_at',
  'photo_email_sent_at',
  'driver_paid_at',
  'created_at',
];

export function driverFacingNotes(notes) {
  if (!notes) return '';
  return String(notes)
    .split('\n')
    .filter((line) => !/^\s*Price:\s*\$/i.test(line))
    .join('\n')
    .trim();
}

export function normTime(t) {
  if (t == null || t === '') return '';
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(t).trim();
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function fmtTime(t) {
  const n = normTime(t);
  if (!n) return '';
  const [h, m] = n.split(':');
  let hh = +h;
  const ap = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  return `${hh}:${m}${ap}`;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtEventDate(isoDate) {
  if (!isoDate) return '';
  const [y, mo, d] = String(isoDate).slice(0, 10).split('-').map(Number);
  if (!y || !mo || !d) return String(isoDate);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return `${DOW[dt.getUTCDay()]} ${MON[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
}

export function fmtTimeRange(start, end) {
  const a = fmtTime(start);
  const b = fmtTime(end);
  if (a && b) return `${a} – ${b}`;
  return a || b || '';
}

export function blank(v) {
  return v == null || v === '';
}

export function sameDriverVal(key, a, b) {
  if (key === 'notes') return driverFacingNotes(a) === driverFacingNotes(b);
  if (key === 'start_time' || key === 'end_time') return normTime(a) === normTime(b);
  if (key === 'needs_trailer') return !!a === !!b;
  if (key === 'pay_tier') {
    const na = a == null || a === '' ? null : Number(a);
    const nb = b == null || b === '' ? null : Number(b);
    return na === nb;
  }
  if (blank(a) && blank(b)) return true;
  return String(a) === String(b);
}

export function displayDriverVal(key, value, ctx = {}) {
  if (key === 'notes') return driverFacingNotes(value) || '—';
  if (key === 'start_time' || key === 'end_time') return fmtTime(value) || '—';
  if (key === 'event_date') return fmtEventDate(value) || '—';
  if (key === 'car_id') {
    if (ctx.carName) return ctx.carName(value) || '—';
    return value || '—';
  }
  if (key === 'needs_trailer') return value ? 'Yes — car must be trailered' : 'No';
  if (key === 'pay_tier') {
    if (value == null || value === '') return '—';
    const tier = `Tier ${value}`;
    if (ctx.payRate != null) return `${tier} ($${Number(value) * Number(ctx.payRate)})`;
    return tier;
  }
  if (blank(value)) return '—';
  return String(value);
}

export function diffDriverFacing(previous, next, ctx = {}) {
  const changes = [];
  for (const field of DRIVER_FACING_FIELDS) {
    const before = previous ? previous[field.key] : undefined;
    const after = next ? next[field.key] : undefined;
    if (sameDriverVal(field.key, before, after)) continue;
    changes.push({
      key: field.key,
      label: field.label,
      from: displayDriverVal(field.key, before, ctx),
      to: displayDriverVal(field.key, after, ctx),
    });
  }
  return changes;
}

export function classifyDriverNotify({ previous, next, deleted = false } = {}) {
  const emails = [];
  if (deleted && previous?.driver_id) {
    emails.push({ kind: 'booking_unassigned', driverId: previous.driver_id, booking: previous });
    return emails;
  }
  const prevDriver = previous?.driver_id || null;
  const nextDriver = next?.driver_id || null;
  if (prevDriver && prevDriver !== nextDriver) {
    emails.push({ kind: 'booking_unassigned', driverId: prevDriver, booking: previous });
  }
  if (nextDriver && nextDriver !== prevDriver) {
    emails.push({ kind: 'booking_assigned', driverId: nextDriver, booking: next });
  }
  if (nextDriver && prevDriver && prevDriver === nextDriver) {
    const changes = diffDriverFacing(previous, next);
    if (changes.length) {
      emails.push({ kind: 'booking_updated', driverId: nextDriver, booking: next, changes });
    }
  }
  return emails;
}

export function chicagoParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO_TZ,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    weekday: parts.weekday,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function chicagoWeekWindow(now = new Date()) {
  const chicago = chicagoParts(now);
  const weekdayIndex = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  }[chicago.weekday];
  const diffToMon = weekdayIndex === 0 ? -6 : 1 - weekdayIndex;
  const weekStart = addDays(chicago.date, diffToMon);
  const weekEnd = addDays(weekStart, 6);
  return { chicago, weekStart, weekEnd };
}

export function shouldSendWeeklyDigest(now = new Date(), { force = false } = {}) {
  const { chicago, weekStart, weekEnd } = chicagoWeekWindow(now);
  if (force) return { ok: true, chicago, weekStart, weekEnd };
  if (chicago.weekday !== 'Monday') {
    return {
      ok: false,
      chicago,
      weekStart,
      weekEnd,
      reason: `not Monday in ${CHICAGO_TZ} (it is ${chicago.weekday})`,
    };
  }
  // Morning window so an 8am pg_cron hit and a ~13:00 UTC Vercel cron
  // (7am CST / 8am CDT) both count, without sending all day.
  if (chicago.hour < 7 || chicago.hour > 10) {
    return {
      ok: false,
      chicago,
      weekStart,
      weekEnd,
      reason: `outside Monday morning window in ${CHICAGO_TZ} (hour ${chicago.hour})`,
    };
  }
  return { ok: true, chicago, weekStart, weekEnd };
}

export function bookingsForDriverWeek(bookings, driverId, weekStart, weekEnd) {
  return (bookings || [])
    .filter((b) =>
      b
      && b.driver_id === driverId
      && b.status !== 'cancelled'
      && b.event_date
      && b.event_date >= weekStart
      && b.event_date <= weekEnd
    )
    .slice()
    .sort((a, b) => {
      const d = (a.event_date || '').localeCompare(b.event_date || '');
      if (d) return d;
      return normTime(a.start_time).localeCompare(normTime(b.start_time));
    });
}

export function driverPayAmount(booking, driver) {
  if (!booking || booking.pay_tier == null || !driver || driver.pay_rate == null) return null;
  const amt = Number(booking.pay_tier) * Number(driver.pay_rate);
  return Number.isFinite(amt) ? amt : null;
}

export function weeklySubject() {
  return 'Your Chance Classics bookings this week';
}

export function updatedSubject(booking) {
  const who = booking?.customer_name || booking?.event_type || 'booking';
  const when = fmtEventDate(booking?.event_date);
  return when ? `Booking updated: ${who} — ${when}` : `Booking updated: ${who}`;
}

export function assignedSubject(booking) {
  const who = booking?.customer_name || booking?.event_type || 'booking';
  const when = fmtEventDate(booking?.event_date);
  return when ? `You're on a booking: ${who} — ${when}` : `You're on a booking: ${who}`;
}

export function unassignedSubject(booking) {
  const who = booking?.customer_name || booking?.event_type || 'booking';
  const when = fmtEventDate(booking?.event_date);
  return when ? `You're off a booking: ${who} — ${when}` : `You're off a booking: ${who}`;
}
