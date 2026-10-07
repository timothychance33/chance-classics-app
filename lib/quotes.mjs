// Shared quote math + time-window car availability.
// Used by unit tests. The browser quote builder keeps the same rules
// (calcQuote, carsOpenOnDate, carsForAlternateOffers, pricedAlternateQuotes,
// blockedInterval, BOOKING_BUFFER_HOURS)
// so a request only loses a car when its hours overlap a booking, including
// the buffer — except Elvira, who is never a fallback offer.

export const OVERAGE_RATE = 100;
export const INCLUDED_HOURS = 2;
export const FREE_MILES = 30;
export const PER_MILE = 3;
export const TAX_RATE = 0.10;
export const HOTEL_FEE = 200;
export const QUOTE_VALID_DAYS = 7;

// Prep, travel, and trailer time kept clear on BOTH sides of each booking
// for the same car. Change this one number to adjust the gap.
// rental.bookings_no_car_time_overlap does not include it — that constraint
// only rejects a true overlap of [start, end).
export const BOOKING_BUFFER_HOURS = 2;

export const NO_AVAILABILITY_REASON = 'no availability';

const MINUTES_PER_DAY = 1440;

export function calcQuoteFromBase(baseRate, hours, miles, hotelFee) {
  const base = Number(baseRate || 0);
  const extraH = Math.max(0, (Number(hours) || 0) - INCLUDED_HOURS);
  const overage = extraH * OVERAGE_RATE;
  const mi = Number(miles) || 0;
  const travel = mi > FREE_MILES ? mi * PER_MILE : 0;
  const hotel = (Number(hotelFee) || 0) > 0 ? HOTEL_FEE : 0;
  const subtotal = base + overage + travel + hotel;
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  return { base, extraH, overage, mi, travel, hotel, subtotal, tax, total };
}

export function isActiveOnDate(booking, evDate, carId) {
  return !!(
    booking &&
    booking.car_id === carId &&
    booking.event_date === evDate &&
    booking.status !== 'cancelled'
  );
}

/** Clock time to minutes after midnight. Accepts "13:00", "13:00:00", and "1:00 PM". */
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

/**
 * Minutes since a fixed epoch for the window a booking blocks, including
 * BOOKING_BUFFER_HOURS before start and after end. An end at or before the
 * start runs past midnight (22:00–00:00). Returns null when start or end
 * is missing — callers then fall back to a same-day block.
 */
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

/** Requested rental window. hours is the quote's total hours, starting at event_time. */
export function requestedInterval(evDate, startTime, hours) {
  const day = dayNumber(evDate);
  const startMin = clockMinutes(startTime);
  const duration = Number(hours);
  if (day == null || startMin == null || !Number.isFinite(duration) || duration <= 0) return null;
  const start = day * MINUTES_PER_DAY + startMin;
  return { start, end: start + duration * 60 };
}

export function intervalsOverlap(a, b) {
  return !!(a && b && a.start < b.end && b.start < a.end);
}

/**
 * A car clashes when the requested window overlaps an active booking,
 * expanded by the buffer on both sides. Bookings on the next or previous
 * day count when the buffer crosses midnight.
 * With no usable request time, a same-day booking still clashes.
 * A same-day booking with no end time still clashes, because its window
 * cannot be placed.
 */
export function findBookingClash(bookings, carId, evDate, request) {
  if (!evDate || !carId) return null;
  const wanted = request
    ? requestedInterval(evDate, request.startTime, request.hours)
    : null;
  return (bookings || []).find((b) => {
    if (!b || b.car_id !== carId || b.status === 'cancelled') return false;
    if (!wanted) return isActiveOnDate(b, evDate, carId);
    const blocked = blockedInterval(b);
    if (!blocked) return b.event_date === evDate;
    return intervalsOverlap(wanted, blocked);
  }) || null;
}

// Elvira (2000 Lincoln Limo) stays bookable when someone asks for her.
// rental.cars has no slug — identify by display name and the live row id.
export const ELVIRA_CAR_ID = 'afa12220-a923-454e-b1d9-758906d72419';
export const ELVIRA_CAR_NAME = 'Elvira';

export function isElviraCar(car) {
  if (!car) return false;
  if (car.id && car.id === ELVIRA_CAR_ID) return true;
  return String(car.name || '').trim().toLowerCase() === ELVIRA_CAR_NAME.toLowerCase();
}

export function carsOpenOnDate(cars, bookings, evDate, excludeCarId, request) {
  return (cars || []).filter(
    (c) => c.id !== excludeCarId && !findBookingClash(bookings, c.id, evDate, request),
  );
}

export function carsForAlternateOffers(cars, bookings, evDate, excludeCarId, request) {
  return carsOpenOnDate(cars, bookings, evDate, excludeCarId, request).filter((c) => !isElviraCar(c));
}

export function pricedAlternateQuotes(cars, bookings, evDate, excludeCarId, hours, miles, hotelFee, startTime) {
  const request = startTime ? { startTime, hours } : undefined;
  return carsForAlternateOffers(cars, bookings, evDate, excludeCarId, request).map((car) => {
    const q = calcQuoteFromBase(car.base_rate, hours, miles, hotelFee);
    return {
      id: car.id,
      name: car.name,
      book_url: car.book_url || null,
      base_rate: q.base,
      extra_hours: q.extraH,
      overage: q.overage,
      miles: q.mi,
      travel: q.travel,
      hotel_fee: q.hotel,
      subtotal: q.subtotal,
      tax: q.tax,
      total: q.total,
    };
  });
}

export function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

export function defaultUnavailableNote({ requestedName, evDate, otherNames }) {
  const car = requestedName || 'that car';
  const when = evDate || 'that date';
  if (otherNames && otherNames.length) {
    return `Unfortunately ${car} is already booked on ${when}. The good news — we do have ${otherNames.join(', ')} available that day if you'd like to see photos or get a quote for one of those instead!`;
  }
  return `Unfortunately ${car} is already booked on ${when}, and it looks like our other cars are booked that day as well. Let us know if your date has any flexibility and we'll check again!`;
}

export function defaultAlternateNote({ requestedName, evDate }) {
  const car = requestedName || 'that car';
  const when = evDate || 'that date';
  return `${car} is already booked on ${when}. Same trip — hours, locations, the whole plan — here are prices for the cars we still have open. Reply and tell us which one you want!`;
}

export function defaultSingleAlternateNote({ requestedName, evDate, chosenName }) {
  const car = requestedName || 'that car';
  const when = evDate || 'that date';
  const chosen = chosenName || 'this car';
  return `${car} is already booked on ${when}. Same trip — hours, locations, the whole plan — here's the price for the ${chosen}. Reply if you'd like to book it!`;
}

// Auto-all alternates never include Elvira. A chosen id only ships if it
// is already in that offer list — so Tim cannot sneak Elvira in here.
// (A direct quote with Elvira selected still uses type "quote".)
export function choosePricedAlternates(alts, chosenCarId) {
  const list = (alts || []).filter((a) => !isElviraCar(a));
  if (!chosenCarId) return list;
  return list.filter((a) => a.id === chosenCarId);
}

export function defaultDeclineAvailabilityMessage(customerName) {
  const first = String(customerName || '').trim().split(/\s+/)[0];
  const hello = first ? `Hi ${first},` : 'Hi,';
  return `${hello}\n\nI'm sorry, we can't accommodate your request due to a lack of availability. Thank you for thinking of us — we hope we can help another time.\n\nChance Classics`;
}

/** Status, reason, timestamp, and an immediate expiry of any quote Book Now link. */
export function declineAvailabilityPatch(nowIso) {
  return {
    status: 'declined',
    decline_reason: NO_AVAILABILITY_REASON,
    declined_at: nowIso,
    book_expires_at: nowIso,
  };
}

export function isOpenQuote(quote) {
  return !!(quote && quote.status !== 'booked' && quote.status !== 'declined');
}

export function partitionQuotes(quotes, now = Date.now()) {
  const list = quotes || [];
  const daysSince = (iso) => (iso ? (now - new Date(iso).getTime()) / 86400000 : null);
  const isExpired = (q) => {
    const age = daysSince(q.sent_at || q.created_at);
    return age != null && age >= QUOTE_VALID_DAYS;
  };
  return {
    needsQuote: list.filter((q) => q.status !== 'sent' && q.status !== 'booked' && q.status !== 'declined'),
    active: list.filter((q) => q.status === 'sent' && !isExpired(q)),
    old: list.filter((q) => q.status === 'booked' || q.status === 'declined' || (q.status === 'sent' && isExpired(q))),
  };
}

export function quoteAlternativesEmailMeta(alts, evDate) {
  const one = (alts || []).length === 1;
  const name = one ? (alts[0].name || 'A car') : null;
  return {
    singular: one,
    subject: one
      ? `${name} is still open${evDate ? ` — ${evDate}` : ''}`
      : `Cars still open${evDate ? ` — ${evDate}` : ''}`,
    heading: one ? 'This car is still open' : 'A few cars are still open',
    footer: one
      ? "This is an estimate and doesn't hold a date. Reply if you want this car, or tap Book above."
      : "This is an estimate and doesn't hold a date. Reply and tell us which car you want, or tap Book on one above.",
  };
}
