/** Booking rules taken from the captured listings and client agreements. */

export const TIME_ZONE = "America/Chicago";
export const MIN_LEAD_DAYS = 7;
export const CANCEL_HOURS = 72;
export const BASE_HOURS = 2;
export const EXTRA_HOUR_USD = 100;
export const DEPOSIT_USD = 250;
export const HOLD_MINUTES = 30;
export const MILE_RADIUS = 30;
export const EXTRA_MILE_USD = 3;

/** One-way Benton to pickup. The drop-off address is collected for the driver and is not part of the fee. */
export const MILEAGE_TRIP = "one-way" as const;
export const MILE_RATE_USD = EXTRA_MILE_USD;
export const MILE_THRESHOLD = MILE_RADIUS;
export const SHOP_ADDRESS = "118 5th St E, Benton, LA 71006";
export const MILEAGE_REVIEW_TEXT = "We'll confirm mileage.";
export const MILEAGE_RULE_TEXT =
  "Pickups more than 30 miles from Benton are charged $3 per mile for the full distance (trailer transport).";
export const MILEAGE_ACK = MILEAGE_RULE_TEXT;

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

/** Shop hours are not listed in the capture. Slots are every 30 minutes, 8:00 AM–8:00 PM Central, and must finish the same day. */
export const DAY_START_MIN = 8 * 60;
export const LAST_START_MIN = 20 * 60;
export const SLOT_STEP_MIN = 30;

export const WAIVER_TEXT =
  "I HAVE READ THE CHANCE CLASSICS, LLC CONTRACT and CONDITIONS AGREEMENT AND ACCEPT IT";

/** Captured agreement clause (n). The live Wix form's shorter label was not stored; the sync only kept "classic vehicles" as a match. */
export const RELIABILITY_TEXT =
  "The COMPANY shall not be held responsible for late arrival caused by (but not limited to) acts of nature, acts of war, acts of terrorism, traffic delays, vehicle breakdown, incorrect pickup and drop-off information, inclement weather and any situation beyond the COMPANY’s control. In such event, the COMPANY’s liability, expressed or implied, is limited to the amount the CLIENT paid for the rental vehicle. If the booked vintage vehicle should breakdown, the COMPANY will make every effort to provide a replacement vintage vehicle for your event, at the COMPANY’s discretion.";

export const OCCASIONS = [
  "Wedding",
  "Homecoming",
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

export function toMinutes(value: string) {
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function fromMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function quoteTotal(basePrice: number, hours: number, mileageFee = 0) {
  const extraHours = Math.max(0, hours - BASE_HOURS);
  const listing = basePrice + extraHours * EXTRA_HOUR_USD;
  const fee = Math.max(0, mileageFee);
  const total = listing + fee;
  return {
    hours,
    extraHours,
    listing,
    mileageFee: fee,
    total,
    deposit: DEPOSIT_USD,
    balance: total - DEPOSIT_USD,
  };
}

export function endMinutes(start: string, hours: number) {
  const startMin = toMinutes(start);
  if (startMin == null) return null;
  const end = startMin + hours * 60;
  if (end > 24 * 60) return null;
  return end;
}

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export type Busy = { start: string; end: string };

export function openStartTimes(hours: number, busy: Busy[]) {
  const slots: string[] = [];
  for (let start = DAY_START_MIN; start <= LAST_START_MIN; start += SLOT_STEP_MIN) {
    const end = start + hours * 60;
    if (end > 24 * 60) continue;
    const taken = busy.some((item) => {
      const bStart = toMinutes(item.start);
      const bEnd = toMinutes(item.end);
      if (bStart == null || bEnd == null || bEnd <= bStart) return false;
      return rangesOverlap(start, end, bStart, bEnd);
    });
    if (!taken) slots.push(fromMinutes(start));
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
  if (quote.booking_id || quote.status === "booked") return { ok: false as const, message: QUOTE_LINK_EXPIRED };
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
  tax?: number | null;
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
  if (Number(quote.hotel_fee) > 0) add("Overnight hotel accommodation", Number(quote.hotel_fee));
  if (Array.isArray(quote.line_items)) {
    for (const item of quote.line_items) {
      if (!item || typeof item !== "object") continue;
      const label = String((item as { label?: unknown }).label || "").trim();
      const amount = Number((item as { amount?: unknown }).amount) || 0;
      if (label) lines.push({ label, amount });
    }
  }
  if (Number(quote.tax)) add("Tax", Number(quote.tax));
  return lines;
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
  if (end == null) return { ok: false as const, error: "That rental would run past midnight. Choose an earlier start." };
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
      start: fromMinutes(startMin),
      end: fromMinutes(end),
    },
  };
}
