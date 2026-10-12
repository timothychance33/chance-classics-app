import type { rentalDb } from "@/lib/rental-db";
import { ownerBookingCreatedRows, shouldEmailOwnerAboutBooking } from "./owner-booking-email.mjs";

type Db = NonNullable<ReturnType<typeof rentalDb>>;

const BOOKING_COLUMNS = [
  "id",
  "customer_name",
  "customer_email",
  "customer_phone",
  "event_type",
  "event_date",
  "start_time",
  "end_time",
  "pickup_location",
  "return_location",
  "car_id",
  "status",
  "notes",
  "total_usd",
  "day_of_contact_name",
  "day_of_contact_phone",
  "day_of_contact_role",
].join(",");

function missingColumn(message: string, column: string) {
  return new RegExp(column, "i").test(message || "");
}

async function selectBooking(db: Db, bookingId: string) {
  const withStamp = await db.from("bookings").select(`${BOOKING_COLUMNS},owner_notified_at`).eq("id", bookingId).maybeSingle();
  if (!withStamp.error) return { row: withStamp.data, tracksNotified: true };
  if (!missingColumn(withStamp.error.message || "", "owner_notified_at")) {
    throw new Error(withStamp.error.message || "The booking could not be loaded.");
  }
  const plain = await db.from("bookings").select(BOOKING_COLUMNS).eq("id", bookingId).maybeSingle();
  if (plain.error) throw new Error(plain.error.message || "The booking could not be loaded.");
  return { row: plain.data, tracksNotified: false };
}

async function carName(db: Db, carId: unknown) {
  if (!carId) return "";
  const { data, error } = await db.from("cars").select("name").eq("id", String(carId)).maybeSingle();
  if (error || !data?.name) return "";
  return String(data.name);
}

async function plannerForBooking(db: Db, bookingId: string) {
  const loaded = await db.from("quote_requests").select("planner").eq("booking_id", bookingId).maybeSingle();
  if (loaded.error || !loaded.data?.planner) return "";
  return String(loaded.data.planner);
}

function notifyUrl() {
  const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  return base ? `${base}/functions/v1/send-notification` : "";
}

function notifyHeaders() {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.NOTIFY_SECRET || "";
  if (secret) {
    headers["x-notify-secret"] = secret;
    return headers;
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (serviceKey) headers.Authorization = `Bearer ${serviceKey}`;
  return headers;
}

export async function postOwnerBookingEmail(booking: Record<string, unknown>) {
  const url = notifyUrl();
  const headers = notifyHeaders();
  if (!url || (!headers["x-notify-secret"] && !headers.Authorization)) {
    return { ok: false as const, error: "Notify is not configured." };
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "booking_created", booking }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { ok: false as const, error: text || `Notify failed (${response.status}).` };
  }
  return { ok: true as const };
}

/**
 * Email Tim once when a booking is real (not a checkout hold, not cancelled).
 * Stripe retries are safe: owner_notified_at is set only after send-notification accepts the mail.
 */
export async function emailOwnerAboutBooking(db: Db, bookingId: string) {
  const loaded = await selectBooking(db, bookingId);
  const row = loaded.row;
  if (!row) return { ok: false as const, retry: true, error: "Booking not found." };
  if (!shouldEmailOwnerAboutBooking(row)) return { ok: true as const, skipped: true };
  const [name, planner] = await Promise.all([
    carName(db, row.car_id),
    plannerForBooking(db, bookingId),
  ]);
  const booking = {
    ...row,
    car_name: name,
    planner: planner || undefined,
    price: row.total_usd,
  };
  const sent = await postOwnerBookingEmail(booking);
  if (!sent.ok) return { ok: false as const, retry: true, error: sent.error };
  if (loaded.tracksNotified) {
    const stamped = await db.from("bookings").update({ owner_notified_at: new Date().toISOString() }).eq("id", bookingId);
    if (stamped.error) console.error("owner booking notify stamp failed:", stamped.error.message);
  }
  return { ok: true as const, skipped: false, rows: ownerBookingCreatedRows(booking).length };
}

export async function quoteLinkedBookingId(db: Db, quoteId: string) {
  const loaded = await db.from("quote_requests").select("booking_id").eq("id", quoteId).maybeSingle();
  if (loaded.error || !loaded.data?.booking_id) return "";
  return String(loaded.data.booking_id);
}
