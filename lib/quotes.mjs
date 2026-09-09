// Shared quote math + same-day car availability.
// Used by unit tests. The browser quote builder keeps the same rules
// (calcQuote, carsOpenOnDate, carsForAlternateOffers, pricedAlternateQuotes)
// so a booked-car request can reuse hours/miles/hotel and price the cars
// that are free — except Elvira, who is never a fallback offer.

export const OVERAGE_RATE = 100;
export const INCLUDED_HOURS = 2;
export const FREE_MILES = 30;
export const PER_MILE = 3;
export const TAX_RATE = 0.10;
export const HOTEL_FEE = 200;
export const QUOTE_VALID_DAYS = 7;

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

export function findBookingClash(bookings, carId, evDate) {
  if (!evDate || !carId) return null;
  return (bookings || []).find((b) => isActiveOnDate(b, evDate, carId)) || null;
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

export function carsOpenOnDate(cars, bookings, evDate, excludeCarId) {
  return (cars || []).filter(
    (c) => c.id !== excludeCarId && !findBookingClash(bookings, c.id, evDate),
  );
}

export function carsForAlternateOffers(cars, bookings, evDate, excludeCarId) {
  return carsOpenOnDate(cars, bookings, evDate, excludeCarId).filter((c) => !isElviraCar(c));
}

export function pricedAlternateQuotes(cars, bookings, evDate, excludeCarId, hours, miles, hotelFee) {
  return carsForAlternateOffers(cars, bookings, evDate, excludeCarId).map((car) => {
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
