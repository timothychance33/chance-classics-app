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
  "Prom",
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

export function quoteTotal(basePrice: number, hours: number) {
  const extraHours = Math.max(0, hours - BASE_HOURS);
  const total = basePrice + extraHours * EXTRA_HOUR_USD;
  return {
    hours,
    extraHours,
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
