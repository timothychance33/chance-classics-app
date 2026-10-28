import { hotelLineLabel } from "@/lib/overnight-hotel";

/** Booking rules taken from the captured listings and client agreements. */

export const TIME_ZONE = "America/Chicago";
export const MIN_LEAD_DAYS = 7;
export const CANCEL_HOURS = 72;
export const BASE_HOURS = 2;
export const EXTRA_HOUR_USD = 100;
export const DEPOSIT_USD = 250;
export const SALES_TAX_RATE = 0.1025;

export function roundMoney(amount: number) {
  return Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
}

/** Sales tax on the rental subtotal, rounded to cents. */
export function salesTax(subtotal: number) {
  const cents = Math.round(Math.max(0, Number(subtotal) || 0) * 100);
  return Math.round(cents * SALES_TAX_RATE) / 100;
}
export const HOLD_MINUTES = 30;
export const MILE_RADIUS = 30;
export const EXTRA_MILE_USD = 3;

/** One-way Benton to pickup. The drop-off address is collected for the driver and is not part of the fee. */
export const MILEAGE_TRIP = "one-way" as const;
export const MILE_RATE_USD = EXTRA_MILE_USD;
export const MILE_THRESHOLD = MILE_RADIUS;

/**
 * Same 2-hour gap as BOOKING_BUFFER_HOURS in lib/quotes.mjs.
 * Applied before and after each booking, including when the gap crosses midnight.
 */
export const BOOKING_BUFFER_HOURS = 2;
const MINUTES_PER_DAY = 1440;
export const SHOP_ADDRESS = "118 5th St E, Benton, LA 71006";
export const MILEAGE_REVIEW_TEXT = "We'll confirm mileage.";
/** Public examples. 30 miles or less is free. Over 30, the fee is the full distance times $3. */
export const MILEAGE_EXAMPLES = [
  "25 miles is $0.",
  `45 miles is 45 × $${EXTRA_MILE_USD} = $${45 * EXTRA_MILE_USD}.`,
  `100 miles is 100 × $${EXTRA_MILE_USD} = $${100 * EXTRA_MILE_USD}.`,
] as const;
export const MILEAGE_RULE_TEXT =
  "Pickups more than 30 miles from Benton are charged $3 per mile for the full distance (trailer transport).";
export const MILEAGE_ACK =
  "I understand that pickups more than 30 miles from Benton are charged $3 per mile for the full distance (trailer transport).";
export const MILEAGE_ACK_ERROR = "Please check this box to continue.";

export type MileageCharge = { miles: number; fee: number };

function wholeMiles(value: number) {
  return Math.ceil(value - 1e-6);
}

/** Round the Benton-to-pickup drive up. 30 miles or less is free. Over 30, the fee is $3 times that full distance. */
export function mileageCharge(pickupMiles: number): MileageCharge {
  const miles = wholeMiles(pickupMiles);
  const fee = miles > MILE_THRESHOLD ? miles * MILE_RATE_USD : 0;
  return { miles, fee };
}

/** Slots are every 15 minutes (:00, :15, :30, :45), 8:00 AM–11:45 PM Central. A rental may end after midnight. */
export const DAY_START_MIN = 8 * 60;
export const LAST_START_MIN = 23 * 60 + 45;
export const SLOT_STEP_MIN = 15;
export const START_WINDOW_NOTE =
  "Start times are every 15 minutes, from 8:00 AM to 11:45 PM.";

export const WAIVER_TEXT =
  "I HAVE READ THE CHANCE CLASSICS, LLC CONTRACT and CONDITIONS AGREEMENT AND ACCEPT IT";

/** Shown before deposit checkout and on the Stripe pay button. The card is saved for later charges. */
export const CARD_SAVE_TEXT =
  "This card is saved for the balance, extra hours, mileage overages, and damage, per the rental terms.";

/** Captured agreement clause (n). The live Wix form's shorter label was not stored; the sync only kept "classic vehicles" as a match. */
export const RELIABILITY_TEXT =
  "The COMPANY shall not be held responsible for late arrival caused by (but not limited to) acts of nature, acts of war, acts of terrorism, traffic delays, vehicle breakdown, incorrect pickup and drop-off information, inclement weather and any situation beyond the COMPANY’s control. In such event, the COMPANY’s liability, expressed or implied, is limited to the amount the CLIENT paid for the rental vehicle. If the booked vintage vehicle should breakdown, the COMPANY will make every effort to provide a replacement vintage vehicle for your event, at the COMPANY’s discretion.";

export const OCCASIONS = [
  "Wedding",
  "Photo shoot",
  "Parade",
  "Other special occasion",
] as const;

export type Occasion = (typeof OCCASIONS)[number];

export function chicagoDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function earliestBookableDate(now = new Date()) {
  return addDays(chicagoDate(now), MIN_LEAD_DAYS);
}

/** Clock time to minutes after midnight. Accepts "13:00", "13:00:00", and "1:00 PM". */
export function clockMinutes(value: string | null | undefined) {
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

export function toMinutes(value: string) {
  return clockMinutes(value);
}

export function dayNumber(iso: string | null | undefined) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

export type Interval = { start: number; end: number };

/** Booking window plus BOOKING_BUFFER_HOURS on both sides. An end at or before the start runs past midnight. */
export function blockedInterval(
  booking: {
    event_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    status?: string | null;
  },
  bufferHours = BOOKING_BUFFER_HOURS,
): Interval | null {
  if (!booking || booking.status === "cancelled" || !booking.event_date) return null;
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

export function requestedInterval(evDate: string, startTime: string, hours: number): Interval | null {
  const day = dayNumber(evDate);
  const startMin = clockMinutes(startTime);
  const duration = Number(hours);
  if (day == null || startMin == null || !Number.isFinite(duration) || duration <= 0) return null;
  const start = day * MINUTES_PER_DAY + startMin;
  return { start, end: start + duration * 60 };
}

export function intervalsOverlap(a: Interval | null, b: Interval | null) {
  return !!(a && b && a.start < b.end && b.start < a.end);
}

export function fromMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function formatClock(value: string) {
  const minutes = clockMinutes(value);
  if (minutes == null) return String(value || "");
  const hours24 = Math.floor(minutes / 60);
  const mins = String(minutes % 60).padStart(2, "0");
  const period = hours24 >= 12 ? "PM" : "AM";
  const hour12 = hours24 % 12 || 12;
  return `${hour12}:${mins} ${period}`;
}

export function quoteTotal(basePrice: number, hours: number, mileageFee = 0, hotelFee = 0) {
  const extraHours = Math.max(0, hours - BASE_HOURS);
  const listing = basePrice + extraHours * EXTRA_HOUR_USD;
  const fee = Math.max(0, mileageFee);
  const hotel = Math.max(0, roundMoney(hotelFee));
  const subtotal = roundMoney(listing + fee + hotel);
  const tax = salesTax(subtotal);
  const total = roundMoney(subtotal + tax);
  return {
    hours,
    extraHours,
    listing,
    mileageFee: fee,
    hotelFee: hotel,
    subtotal,
    tax,
    total,
    deposit: DEPOSIT_USD,
    balance: roundMoney(total - DEPOSIT_USD),
  };
}

/**
 * Clock minutes of the rental end. A finish at midnight or later wraps into the
 * next day (11:00 PM + 2 hours is 1:00 AM). More than 24 hours cannot be stored
 * as one clock time with the end-at-or-before-start convention.
 */
export function endMinutes(start: string, hours: number) {
  const startMin = toMinutes(start);
  const duration = Number(hours);
  if (startMin == null || !Number.isFinite(duration) || duration <= 0 || duration > 24) return null;
  return (startMin + Math.round(duration * 60)) % (24 * 60);
}

/** True when the rental is still going at or after midnight. */
export function endsNextDay(start: string, hours: number) {
  const startMin = toMinutes(start);
  const duration = Number(hours);
  if (startMin == null || !Number.isFinite(duration) || duration <= 0 || duration > 24) return false;
  return startMin + Math.round(duration * 60) >= 24 * 60;
}

/** "1:00 AM the next day" or "4:00 PM". Empty when the hours cannot be placed. */
export function rentalEndLabel(start: string, hours: number) {
  const end = endMinutes(start, hours);
  if (end == null) return "";
  const clock = formatClock(fromMinutes(end));
  return endsNextDay(start, hours) ? `${clock} the next day` : clock;
}

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export type Busy = { start: string; end: string; date?: string };

/** True when the requested window overlaps a booking expanded by the buffer, including a buffer that crosses midnight. */
export function slotTaken(date: string, start: string, hours: number, busy: Busy[]) {
  const wanted = requestedInterval(date, start, hours);
  if (!wanted) return true;
  return busy.some((item) => {
    const itemDate = item.date || date;
    if (!item.end) return itemDate === date;
    const blocked = blockedInterval({
      event_date: itemDate,
      start_time: item.start,
      end_time: item.end,
      status: "active",
    });
    if (!blocked) return itemDate === date;
    return intervalsOverlap(wanted, blocked);
  });
}

export function openStartTimes(hours: number, busy: Busy[], onDate = "2000-01-01") {
  const slots: string[] = [];
  for (let start = DAY_START_MIN; start <= LAST_START_MIN; start += SLOT_STEP_MIN) {
    const label = fromMinutes(start);
    if (!slotTaken(onDate, label, hours, busy)) slots.push(label);
  }
  return slots;
}

export function holdIsFresh(createdAt: string, now = new Date()) {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return true;
  return now.getTime() - created < HOLD_MINUTES * 60 * 1000;
}

export function bookingSource(env: { stripeSecret?: string; vercelEnv?: string }) {
  const key = env.stripeSecret || "";
  if (!key || key.startsWith("sk_test") || env.vercelEnv !== "production") return "site-test";
  return "site";
}

export function stripeReady(env: { secret?: string; webhook?: string; publishable?: string }) {
  return Boolean(env.secret && env.webhook && env.publishable);
}

export const QUOTE_LINK_DAYS = 7;
export const QUOTE_LINK_EXPIRED = "This quote has expired or was already booked.";

export type QuoteLine = { label: string; amount: number };

export function quoteCheckoutMoney(total: number) {
  const amount = Math.max(0, Number(total) || 0);
  const deposit = Math.min(DEPOSIT_USD, amount);
  return { total: amount, deposit, balance: Math.max(0, amount - deposit) };
}

/** A link is open until its expiry and until it is booked once. Missing expiry uses 7 days from send or create. */
export function quoteLinkOpen(
  quote: {
    status?: string | null;
    booking_id?: string | null;
    book_expires_at?: string | null;
    sent_at?: string | null;
    created_at?: string | null;
  } | null,
  now = new Date(),
) {
  if (!quote) return { ok: false as const, message: QUOTE_LINK_EXPIRED };
  if (quote.booking_id || quote.status === "booked" || quote.status === "declined") {
    return { ok: false as const, message: QUOTE_LINK_EXPIRED };
  }
  const explicit = quote.book_expires_at ? new Date(quote.book_expires_at) : null;
  const anchor = quote.sent_at || quote.created_at;
  const fallback = anchor ? new Date(new Date(anchor).getTime() + QUOTE_LINK_DAYS * 86400000) : null;
  const exp = explicit && !Number.isNaN(explicit.getTime()) ? explicit : fallback;
  if (!exp || Number.isNaN(exp.getTime()) || exp.getTime() <= now.getTime()) {
    return { ok: false as const, message: QUOTE_LINK_EXPIRED };
  }
  return { ok: true as const };
}

export function quoteCheckoutLines(quote: {
  car_name?: string | null;
  base_rate?: number | null;
  overage?: number | null;
  extra_hours?: number | null;
  travel?: number | null;
  miles?: number | null;
  hotel_fee?: number | null;
  hotel_nights?: number | null;
  hotel_return_at?: string | null;
  hotel_override?: boolean | null;
  tax?: number | null;
  taxExempt?: boolean | null;
  line_items?: unknown;
}): QuoteLine[] {
  const lines: QuoteLine[] = [];
  const add = (label: string, amount: number) => {
    if (amount) lines.push({ label, amount });
  };
  add(`${quote.car_name || "Classic car"} — base (up to 2 hours)`, Number(quote.base_rate) || 0);
  if (Number(quote.overage) > 0) add(`Additional hours (${quote.extra_hours || ""})`.trim(), Number(quote.overage));
  lines.push({
    label: Number(quote.miles) ? `Mileage fee (${quote.miles} mi from Benton)` : "Mileage fee",
    amount: Number(quote.travel) || 0,
  });
  if (Number(quote.hotel_fee) > 0) {
    const nights = Number(quote.hotel_nights) || 1;
    const showWhy = !quote.hotel_override && quote.hotel_return_at && quote.miles != null;
    add(
      showWhy
        ? hotelLineLabel({ nights, miles: Number(quote.miles), returnLabel: String(quote.hotel_return_at) })
        : hotelLineLabel({ nights }),
      Number(quote.hotel_fee),
    );
  }
  if (Array.isArray(quote.line_items)) {
    for (const item of quote.line_items) {
      if (!item || typeof item !== "object") continue;
      const label = String((item as { label?: unknown }).label || "").trim();
      const amount = Number((item as { amount?: unknown }).amount) || 0;
      if (label) lines.push({ label, amount });
    }
  }
  if (quote.taxExempt) lines.push({ label: "Tax exempt", amount: 0 });
  else if (Number(quote.tax)) add("Sales tax (10.25%)", Number(quote.tax));
  return lines;
}

/** A saved quote with the switch on, or a positive subtotal whose tax was stored as $0. */
export function quoteIsTaxExempt(quote: {
  tax_exempt?: boolean | null;
  tax?: number | null;
  subtotal?: number | null;
} | null | undefined) {
  if (!quote) return false;
  if (typeof quote.tax_exempt === "boolean") return quote.tax_exempt;
  return (Number(quote.subtotal) || 0) > 0 && (Number(quote.tax) || 0) === 0;
}

/** A photo shoot that is not also a ride. Weddings and parades still keep a drop-off field. */
export function isPhotoShootOnly(eventType: string) {
  const text = eventType.trim();
  if (!text) return false;
  if (/\b(wedding|parade|prom|homecoming|reception|ceremony|getaway|shuttle|processional)\b/i.test(text)) return false;
  return /\b(photo[\s-]?shoots?|photo[\s-]?sessions?|photoshoots?|picture session|pictures only)\b/i.test(text);
}

/** Hide the quote drop-off for a photo shoot, or when the car stays at the event address. */
export function quoteDropoffHidden(input: { eventType: string; sameLocation: boolean }) {
  return input.sameLocation || isPhotoShootOnly(input.eventType);
}

/** Empty is allowed. A typed address still has to be a real location. */
export function quoteDropoffError(dropoff: string) {
  const text = dropoff.trim();
  if (!text) return "";
  if (text.length < 3 || text.length > 300) return "Enter a drop-off location.";
  return "";
}

/** Same fields quote-capture writes, plus the drop-off address in the details the garage already shows. */
export function quoteRequestRecord(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  service: string;
  eventType: string;
  when: string;
  pickup: string;
  dropoff: string;
  details: string;
  planner: string;
  heard: string;
}) {
  const name = [input.firstName, input.lastName].map((part) => part.trim()).filter(Boolean).join(" ");
  const when = input.when.trim();
  const date = when.slice(0, 10);
  const time = when.length >= 16 ? when.slice(11, 16) : "";
  const details = [
    input.dropoff.trim() ? `Drop-off: ${input.dropoff.trim()}` : "",
    input.heard.trim() ? `Heard about us: ${input.heard.trim()}` : "",
    input.details.trim(),
  ].filter(Boolean).join("\n");
  return {
    customer_name: name,
    customer_email: input.email.trim(),
    customer_phone: input.phone.trim() || null,
    service_name: input.service.trim() || null,
    event_type: input.eventType.trim() || null,
    event_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    event_time: time || null,
    event_location: input.pickup.trim() || null,
    details: details || null,
    planner: input.planner.trim() || null,
    status: "new" as const,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DayOfContact = {
  name: string;
  phone: string;
  role: string;
};

/** Who the driver calls during the event. Separate from the person who booked. */
export function validateDayOfContact(input: { name?: string; phone?: string; role?: string }) {
  const name = String(input.name || "").trim();
  const phone = String(input.phone || "").trim();
  const role = String(input.role || "").trim();
  if (name.length < 2 || name.length > 120) {
    return { ok: false as const, error: "Enter the day-of contact’s name." };
  }
  if (phone.length < 7 || phone.length > 40) {
    return { ok: false as const, error: "Enter a phone number for the day-of contact." };
  }
  if (role.length < 2 || role.length > 80) {
    return { ok: false as const, error: "Enter the day-of contact’s role, such as planner or maid of honor." };
  }
  return { ok: true as const, value: { name, phone, role } satisfies DayOfContact };
}

export function dayOfContactNotes(contact: DayOfContact) {
  return [
    "Day-of contact (call this person during the event; this is not the booker):",
    `Name: ${contact.name}`,
    `Phone: ${contact.phone}`,
    `Role: ${contact.role}`,
  ].join("\n");
}

export function dayOfContactColumns(contact: DayOfContact) {
  return {
    day_of_contact_name: contact.name,
    day_of_contact_phone: contact.phone,
    day_of_contact_role: contact.role,
  };
}

export const WEDDING_COLUMN_NAMES = [
  "wedding_partner_1_name",
  "wedding_partner_1_social",
  "wedding_partner_2_name",
  "wedding_partner_2_social",
  "wedding_photographer_name",
  "wedding_photographer_email",
  "wedding_photographer_instagram",
] as const;

export type WeddingCelebrationInput = {
  partner1Name?: unknown;
  partner1Social?: unknown;
  partner2Name?: unknown;
  partner2Social?: unknown;
  photographerName?: unknown;
  photographerEmail?: unknown;
  photographerInstagram?: unknown;
};

const WEDDING_FIELDS: Array<{
  key: keyof WeddingCelebrationInput;
  max: number;
  breakMessage: string;
  longMessage: string;
}> = [
  {
    key: "partner1Name",
    max: 120,
    breakMessage: "Enter the bride or partner 1 name on one line.",
    longMessage: "Bride or partner 1 name is too long.",
  },
  {
    key: "partner1Social",
    max: 80,
    breakMessage: "Enter the bride or partner 1 social handle on one line.",
    longMessage: "Bride or partner 1 social handle is too long.",
  },
  {
    key: "partner2Name",
    max: 120,
    breakMessage: "Enter the groom or partner 2 name on one line.",
    longMessage: "Groom or partner 2 name is too long.",
  },
  {
    key: "partner2Social",
    max: 80,
    breakMessage: "Enter the groom or partner 2 social handle on one line.",
    longMessage: "Groom or partner 2 social handle is too long.",
  },
  {
    key: "photographerName",
    max: 120,
    breakMessage: "Enter the photographer name on one line.",
    longMessage: "Photographer name is too long.",
  },
  {
    key: "photographerInstagram",
    max: 80,
    breakMessage: "Enter the photographer Instagram on one line.",
    longMessage: "That Instagram handle is too long.",
  },
];

function optionalLine(raw: unknown, max: number) {
  const text = String(raw ?? "");
  if (/[\r\n]/.test(text)) return { ok: false as const, reason: "break" as const };
  const value = text.replace(/[^\S\r\n]+/g, " ").trim();
  if (value.length > max) return { ok: false as const, reason: "long" as const };
  return { ok: true as const, value };
}

/** Optional wedding answers. Empty is valid. Nothing here is required. */
export function weddingCelebrationErrors(occasion: string, input: WeddingCelebrationInput) {
  const errors: Record<string, string> = {};
  if (occasion !== "Wedding") return errors;
  for (const field of WEDDING_FIELDS) {
    const parsed = optionalLine(input[field.key], field.max);
    if (!parsed.ok) errors[field.key] = parsed.reason === "break" ? field.breakMessage : field.longMessage;
  }
  const email = optionalLine(input.photographerEmail, 160);
  if (!email.ok || (email.ok && email.value && !EMAIL.test(email.value))) {
    errors.photographerEmail = email.ok
      ? "Enter a valid photographer email, or leave it blank."
      : email.reason === "break"
        ? "Enter the photographer email on one line."
        : "Enter a valid photographer email, or leave it blank.";
  }
  return errors;
}

function weddingValue(raw: unknown, max: number) {
  const parsed = optionalLine(raw, max);
  return parsed.ok && parsed.value ? parsed.value : null;
}

/** Persist only when the occasion is Wedding. Other occasions store nulls. */
export function weddingCelebrationColumns(occasion: string, input: WeddingCelebrationInput) {
  const empty = {
    wedding_partner_1_name: null,
    wedding_partner_1_social: null,
    wedding_partner_2_name: null,
    wedding_partner_2_social: null,
    wedding_photographer_name: null,
    wedding_photographer_email: null,
    wedding_photographer_instagram: null,
  };
  if (occasion !== "Wedding" || Object.keys(weddingCelebrationErrors(occasion, input)).length) return empty;
  return {
    wedding_partner_1_name: weddingValue(input.partner1Name, 120),
    wedding_partner_1_social: weddingValue(input.partner1Social, 80),
    wedding_partner_2_name: weddingValue(input.partner2Name, 120),
    wedding_partner_2_social: weddingValue(input.partner2Social, 80),
    wedding_photographer_name: weddingValue(input.photographerName, 120),
    wedding_photographer_email: weddingValue(input.photographerEmail, 160),
    wedding_photographer_instagram: weddingValue(input.photographerInstagram, 80),
  };
}

export type BookingInput = {
  car: string;
  date: string;
  start: string;
  hours: number;
  name: string;
  email: string;
  phone: string;
  occasion: string;
  pickup: string;
  dropoff: string;
  dayOfName: string;
  dayOfPhone: string;
  dayOfRole: string;
  waiver: boolean;
  reliability: boolean;
};

export function validateBooking(input: BookingInput, now = new Date()) {
  const hours = Number(input.hours);
  if (!input.car) return { ok: false as const, error: "Choose a car." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || "")) return { ok: false as const, error: "Choose a date." };
  if (input.date < earliestBookableDate(now)) {
    return { ok: false as const, error: "Reservations must be made at least 7 days in advance." };
  }
  if (!Number.isInteger(hours) || hours < BASE_HOURS || hours > 8) {
    return { ok: false as const, error: "Choose a whole number of hours, at least 2." };
  }
  const startMin = toMinutes(input.start || "");
  if (startMin == null || startMin < DAY_START_MIN || startMin > LAST_START_MIN || (startMin - DAY_START_MIN) % SLOT_STEP_MIN !== 0) {
    return { ok: false as const, error: "Choose an open start time." };
  }
  const end = endMinutes(input.start, hours);
  if (end == null) return { ok: false as const, error: "Choose an open start time." };
  const name = input.name.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();
  const pickup = input.pickup.trim();
  const dropoff = input.dropoff.trim();
  if (name.length < 2 || name.length > 120) return { ok: false as const, error: "Enter your name." };
  if (!EMAIL.test(email) || email.length > 160) return { ok: false as const, error: "Enter a valid email." };
  if (phone.length < 7 || phone.length > 40) return { ok: false as const, error: "Enter a phone number." };
  if (!OCCASIONS.includes(input.occasion as Occasion)) return { ok: false as const, error: "Choose an occasion." };
  if (pickup.length < 3 || pickup.length > 300) return { ok: false as const, error: "Enter a pickup location." };
  if (dropoff.length < 3 || dropoff.length > 300) return { ok: false as const, error: "Enter a drop-off location." };
  if (!input.waiver) return { ok: false as const, error: "Accept the rental terms to continue." };
  if (!input.reliability) return { ok: false as const, error: "Accept the classic-car reliability notice to continue." };
  const dayOf = validateDayOfContact({
    name: input.dayOfName,
    phone: input.dayOfPhone,
    role: input.dayOfRole,
  });
  if (!dayOf.ok) return dayOf;
  return {
    ok: true as const,
    value: {
      ...input,
      hours,
      name,
      email,
      phone,
      pickup,
      dropoff,
      dayOfName: dayOf.value.name,
      dayOfPhone: dayOf.value.phone,
      dayOfRole: dayOf.value.role,
      start: fromMinutes(startMin),
      end: fromMinutes(end),
    },
  };
}
