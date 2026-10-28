// Overnight driver hotel.
// Charge HOTEL_NIGHT_USD per night only when BOTH are true:
//   1. One-way miles from the Benton shop are over HOTEL_MILES_OVER.
//   2. The driver gets back to the shop at HOTEL_RETURN_CUTOFF_MINUTES or later.
// Return time is the event end plus the one-way drive back (the same Google
// drive time the mileage lookup already measures, shop to pickup).
// One night is the usual result. Another night is added only when that return
// is still out at a later 2:00 AM, which is a multi-day trip.

export const HOTEL_MILES_OVER = 60;
export const HOTEL_RETURN_CUTOFF_MINUTES = 2 * 60;
export const HOTEL_NIGHT_USD = 200;
export const HOTEL_LINE_LABEL = "Overnight driver hotel";

const MINUTES_PER_DAY = 1440;

export function hotelCutoffLabel() {
  return formatClock(HOTEL_RETURN_CUTOFF_MINUTES);
}

/** Clock time to minutes after midnight. Accepts "13:00", "13:00:00", and "1:00 PM". */
export function clockMinutes(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  const ampm = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])$/);
  if (ampm) {
    let hours = Number(ampm[1]);
    const minutes = Number(ampm[2]);
    const pm = ampm[3].toLowerCase() === "pm";
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
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

function formatClock(minutes) {
  const clock = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  let hours = Math.floor(clock / 60);
  const mins = String(clock % 60).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${mins} ${period}`;
}

/** Same whole-mile rounding as the Benton mileage quote. */
export function wholeHotelMiles(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n - 1e-6);
}

function eventStartAbsolute(input) {
  const day = dayNumber(input?.eventDate);
  const start = clockMinutes(input?.startTime);
  if (day == null || start == null) return null;
  return day * MINUTES_PER_DAY + start;
}

/** Event end in absolute minutes. Hours win when they are set; otherwise the end clock. */
function eventEndAbsolute(input, startAbs) {
  if (startAbs == null) return null;
  const hours = Number(input?.hours);
  if (Number.isFinite(hours) && hours > 0) return startAbs + Math.round(hours * 60);
  const end = clockMinutes(input?.endTime);
  const start = clockMinutes(input?.startTime);
  if (end == null || start == null) return null;
  let endAbs = Math.floor(startAbs / MINUTES_PER_DAY) * MINUTES_PER_DAY + end;
  if (end <= start) endAbs += MINUTES_PER_DAY;
  return endAbs;
}

/** How many 2:00 AM marks the driver is still away for. Exact 2:00 AM counts. */
export function hotelNightsBetween(startAbs, returnAbs) {
  if (startAbs == null || returnAbs == null || returnAbs < startAbs) return 0;
  const startDay = Math.floor(startAbs / MINUTES_PER_DAY);
  const lastDay = Math.floor(returnAbs / MINUTES_PER_DAY) + 1;
  let nights = 0;
  for (let day = startDay; day <= lastDay; day += 1) {
    const cutoff = day * MINUTES_PER_DAY + HOTEL_RETURN_CUTOFF_MINUTES;
    if (cutoff > startAbs && cutoff <= returnAbs) nights += 1;
  }
  return nights;
}

function returnLabel(startAbs, returnAbs) {
  const clock = formatClock(returnAbs);
  const delta = Math.floor(returnAbs / MINUTES_PER_DAY) - Math.floor(startAbs / MINUTES_PER_DAY);
  if (delta <= 0) return clock;
  if (delta === 1) return `${clock} the next day`;
  return `${clock}, ${delta} days later`;
}

function emptyResult(extra) {
  return {
    miles: null,
    driveMinutes: null,
    distanceQualifies: false,
    known: false,
    applies: false,
    nights: 0,
    fee: 0,
    returnLabel: "",
    reason: "",
    lineLabel: HOTEL_LINE_LABEL,
    ...extra,
  };
}

/**
 * Decide the overnight driver hotel.
 * input.miles is the one-way shop-to-pickup distance (same figure as the mileage fee).
 * input.driveMinutes is that same drive, in minutes. Missing drive time cannot apply the rule.
 * input.eventDate + startTime + hours (or endTime) place the event end.
 */
export function overnightDriverHotel(input) {
  const rawMiles = input?.miles;
  const milesMissing = rawMiles == null || rawMiles === "" || !Number.isFinite(Number(rawMiles));
  const miles = milesMissing ? null : wholeHotelMiles(rawMiles);
  const driveRaw = input?.driveMinutes;
  const driveMissing = driveRaw == null || driveRaw === "" || !Number.isFinite(Number(driveRaw)) || Number(driveRaw) < 0;
  const driveMinutes = driveMissing ? null : Math.round(Number(driveRaw));
  const startAbs = eventStartAbsolute(input || {});
  const endAbs = eventEndAbsolute(input || {}, startAbs);
  const known = !milesMissing && !driveMissing && endAbs != null;
  const distanceQualifies = miles != null && miles > HOTEL_MILES_OVER;
  const returnAbs = known ? endAbs + driveMinutes : null;
  const nights = known && distanceQualifies ? hotelNightsBetween(startAbs, returnAbs) : 0;
  const fee = nights * HOTEL_NIGHT_USD;
  const back = returnAbs != null && startAbs != null ? returnLabel(startAbs, returnAbs) : "";
  const result = emptyResult({
    miles,
    driveMinutes,
    distanceQualifies,
    known,
    applies: nights > 0,
    nights,
    fee,
    returnLabel: back,
  });
  result.reason = hotelReason(result);
  result.lineLabel = hotelLineLabel(result);
  return result;
}

function hotelReason(result) {
  if (result.miles == null) {
    return "Look up miles and drive time from the shop to see whether an overnight driver hotel applies.";
  }
  const distance = `${result.miles} ${result.miles === 1 ? "mile" : "miles"} from Benton`;
  if (!result.distanceQualifies) {
    return `${distance}. ${HOTEL_MILES_OVER} miles or less does not add an overnight driver hotel.`;
  }
  if (!result.known || !result.returnLabel) {
    return `${distance}. Look up drive time. The hotel applies when the driver gets back to the shop at ${hotelCutoffLabel()} or later.`;
  }
  const back = `Estimated return to the shop: ${result.returnLabel}.`;
  if (result.applies) {
    const night = result.nights === 1 ? "1 night" : `${result.nights} nights`;
    return `${distance}. ${back} Overnight driver hotel applies (${night}, $${result.fee}).`;
  }
  return `${distance}. ${back} That is before ${hotelCutoffLabel()}, so there is no overnight driver hotel.`;
}

/** Customer-facing line. The return time is included only when the rule itself applied. */
export function hotelLineLabel(result) {
  const nights = Number(result?.nights) || 0;
  const nightBit = nights > 1 ? ` (${nights} nights)` : "";
  if (nights > 0 && result?.miles != null && result?.returnLabel) {
    return `${HOTEL_LINE_LABEL}${nightBit} — ${result.miles} mi from Benton, driver back about ${result.returnLabel}`;
  }
  return `${HOTEL_LINE_LABEL}${nightBit}`;
}

/** Checkbox on: the computed nights, or one night when someone adds it by hand. */
export function hotelFeeWhenIncluded(rule, included) {
  if (!included) return { nights: 0, fee: 0, lineLabel: HOTEL_LINE_LABEL, returnLabel: "" };
  if (rule && rule.nights > 0) {
    return {
      nights: rule.nights,
      fee: rule.fee,
      lineLabel: rule.lineLabel || hotelLineLabel(rule),
      returnLabel: rule.returnLabel || "",
    };
  }
  return { nights: 1, fee: HOTEL_NIGHT_USD, lineLabel: HOTEL_LINE_LABEL, returnLabel: "" };
}

export function hotelNotesLine(result) {
  if (!result || !(Number(result.fee) > 0)) return "";
  const amount = `$${Number(result.fee).toFixed(2)}`;
  if (result.miles != null && result.returnLabel) {
    const nights = result.nights > 1 ? `, ${result.nights} nights` : "";
    return `Overnight driver hotel: ${amount} (${result.miles} miles from Benton, driver back about ${result.returnLabel}${nights}).`;
  }
  return `Overnight driver hotel: ${amount}.`;
}
