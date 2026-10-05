import {
  bookingSource,
  dayOfContactColumns,
  dayOfContactNotes,
  endMinutes,
  fromMinutes,
  quoteCheckoutLines,
  quoteCheckoutMoney,
  quoteLinkOpen,
  rangesOverlap,
  toMinutes,
  type DayOfContact,
  type QuoteLine,
} from "@/lib/booking-rules";
import type { rentalDb } from "@/lib/rental-db";
import { busyRanges, insertBooking, releaseStaleHolds } from "@/lib/site-booking";

type Db = NonNullable<ReturnType<typeof rentalDb>>;

export type QuoteRow = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  service_name: string | null;
  car_id: string | null;
  event_type: string | null;
  event_date: string | null;
  event_time: string | null;
  event_location: string | null;
  details: string | null;
  dropoff_location?: string | null;
  status: string | null;
  booking_id?: string | null;
  book_token?: string | null;
  book_expires_at?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
  hours: number | null;
  miles: number | null;
  base_rate: number | null;
  overage: number | null;
  travel: number | null;
  hotel_fee: number | null;
  tax: number | null;
  total: number | null;
  line_items?: unknown;
  quote_notes: string | null;
};

export function parseEventTime(value: string | null | undefined) {
  const text = String(value || "").trim();
  const ampm = text.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (ampm) {
    let hours = Number(ampm[1]);
    const minutes = Number(ampm[2]);
    const pm = ampm[3].toLowerCase() === "pm";
    if (hours === 12) hours = pm ? 12 : 0;
    else if (pm) hours += 12;
    if (hours > 23 || minutes > 59) return null;
    return fromMinutes(hours * 60 + minutes);
  }
  const mins = toMinutes(text);
  if (mins == null) return null;
  return fromMinutes(mins);
}

export function dropoffFromQuote(quote: { dropoff_location?: string | null; details?: string | null }) {
  const column = String(quote.dropoff_location || "").trim();
  if (column) return column;
  const match = String(quote.details || "").match(/^Drop-off:\s*(.+)$/m);
  return match ? match[1].trim() : "";
}

export function publicQuoteView(quote: QuoteRow, carName: string) {
  const money = quoteCheckoutMoney(Number(quote.total) || 0);
  const lines: QuoteLine[] = quoteCheckoutLines({
    car_name: carName,
    base_rate: quote.base_rate,
    overage: quote.overage,
    extra_hours: Math.max(0, Number(quote.hours) - 2),
    travel: quote.travel,
    miles: quote.miles,
    hotel_fee: quote.hotel_fee,
    tax: quote.tax,
    line_items: quote.line_items,
  });
  return {
    carName,
    date: quote.event_date,
    time: parseEventTime(quote.event_time) || quote.event_time || "",
    hours: quote.hours,
    pickup: quote.event_location || "",
    dropoff: dropoffFromQuote(quote),
    name: quote.customer_name || "",
    email: quote.customer_email || "",
    phone: quote.customer_phone || "",
    occasion: quote.event_type || "",
    note: quote.quote_notes || "",
    lines,
    total: money.total,
    deposit: money.deposit,
    balance: money.balance,
    expires: quote.book_expires_at || null,
  };
}

export async function loadQuoteByToken(db: Db, token: string) {
  const { data, error } = await db.from("quote_requests").select("*").eq("book_token", token).maybeSingle();
  if (error) throw new Error(error.message);
  return (data || null) as QuoteRow | null;
}

export async function carNameFor(db: Db, carId: string | null, fallback: string | null) {
  if (!carId) return fallback || "Classic car";
  const { data, error } = await db.from("cars").select("id,name").eq("id", carId).maybeSingle();
  if (error || !data?.name) return fallback || "Classic car";
  return String(data.name);
}

export async function quoteTimeFree(db: Db, quote: QuoteRow) {
  if (!quote.car_id || !quote.event_date) return { ok: false as const, error: "This quote is missing a car or a date." };
  const start = parseEventTime(quote.event_time);
  const hours = Number(quote.hours);
  if (!start || !Number.isFinite(hours) || hours < 2) {
    return { ok: false as const, error: "This quote is missing a start time. Ask Chance Classics for a new link." };
  }
  const end = endMinutes(start, hours);
  if (end == null) return { ok: false as const, error: "That rental would run past midnight." };
  await releaseStaleHolds(db, quote.car_id);
  const busy = await busyRanges(db, quote.car_id, quote.event_date);
  const startMin = toMinutes(start)!;
  const taken = busy.some((item) => {
    const a = toMinutes(item.start);
    const b = toMinutes(item.end);
    return a != null && b != null && rangesOverlap(startMin, end, a, b);
  });
  if (taken) return { ok: false as const, error: "That time was just taken. Ask Chance Classics for a new quote." };
  return { ok: true as const, start, end: fromMinutes(end), hours };
}

export function quoteIsOpen(quote: QuoteRow | null, now = new Date()) {
  return quoteLinkOpen(quote, now);
}

export async function confirmPaidQuote(
  db: Db,
  quoteId: string,
  env: { stripeSecret?: string; vercelEnv?: string },
  dayOf: DayOfContact | null = null,
) {
  const loaded = await db.from("quote_requests").select("*").eq("id", quoteId).maybeSingle();
  if (loaded.error) throw new Error(loaded.error.message);
  const quote = loaded.data as QuoteRow | null;
  if (!quote) return { ok: false as const, status: 404, error: "Quote not found." };
  if (quote.booking_id) return { ok: true as const, status: 200, already: true };

  const open = quoteIsOpen(quote);
  if (!open.ok) return { ok: false as const, status: 200, expired: true };
  const slot = await quoteTimeFree(db, quote);
  if (!slot.ok) {
    const note = [quote.quote_notes, `Deposit was paid, but the car was no longer free. ${slot.error}`].filter(Boolean).join("\n");
    await db.from("quote_requests").update({ quote_notes: note }).eq("id", quote.id);
    return { ok: false as const, status: 200, unavailable: true };
  }

  const carName = await carNameFor(db, quote.car_id, quote.service_name);
  const money = quoteCheckoutMoney(Number(quote.total) || 0);
  const source = bookingSource(env);
  const notes = [
    source === "site-test" ? "TEST website booking from a quote link. Not a real garage job until you say so." : "Website booking from a quote link.",
    `Quote: ${quote.id}`,
    `Car: ${carName}`,
    quote.event_type ? `Occasion: ${quote.event_type}` : "",
    `Duration: ${slot.hours} hours`,
    `Quote total: $${money.total}`,
    `Mileage fee: $${Number(quote.travel) || 0}`,
    `Deposit paid: $${money.deposit}`,
    `Balance billed separately: $${money.balance}`,
    "Waiver accepted: Yes",
    "Vehicle reliability acknowledged: Yes",
    dayOf ? dayOfContactNotes(dayOf) : "",
    "Deposit paid. Booking confirmed.",
  ].filter(Boolean).join("\n");

  const row = {
    customer_name: quote.customer_name,
    customer_email: quote.customer_email,
    customer_phone: quote.customer_phone,
    event_type: quote.event_type,
    event_date: quote.event_date,
    start_time: slot.start,
    end_time: slot.end,
    pickup_location: quote.event_location,
    return_location: dropoffFromQuote(quote) || null,
    car_id: quote.car_id,
    status: "new",
    payment_status: "deposit",
    source,
    notes,
    mileage_miles: quote.miles,
    mileage_fee_usd: quote.travel,
    mileage_needs_review: false,
    ...(dayOf ? dayOfContactColumns(dayOf) : {}),
  };
  const inserted = await insertBooking(db, row);
  if (inserted.error || !inserted.data) {
    if (inserted.error?.code === "23P01") return { ok: false as const, status: 200, unavailable: true };
    throw new Error(inserted.error?.message || "The booking could not be saved.");
  }
  const bookingId = String(inserted.data.id);
  let linked = await db
    .from("quote_requests")
    .update({ status: "booked", booking_id: bookingId })
    .eq("id", quote.id)
    .is("booking_id", null)
    .select("id");
  if (linked.error && /booking_id/i.test(linked.error.message || "")) {
    linked = await db.from("quote_requests").update({ status: "booked" }).eq("id", quote.id).select("id");
  }
  if (linked.error) throw new Error(linked.error.message);
  if (!linked.data?.length) {
    await db.from("bookings").update({ status: "cancelled", notes: "Duplicate quote payment. This copy was not kept." }).eq("id", bookingId);
    return { ok: true as const, status: 200, already: true };
  }

  const template = await db.from("car_prep_templates").select("task,sort_order").eq("car_id", quote.car_id);
  if (!template.error && template.data?.length) {
    await db.from("booking_prep_tasks").insert(
      template.data.map((task) => ({
        booking_id: bookingId,
        task: task.task,
        sort_order: task.sort_order,
      })),
    );
  }
  return { ok: true as const, status: 200, bookingId };
}
