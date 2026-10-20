import {
  HOLD_MINUTES,
  addDays,
  holdIsFresh,
  openStartTimes,
  type Busy,
} from "@/lib/booking-rules";
import type { rentalDb } from "@/lib/rental-db";

type Db = NonNullable<ReturnType<typeof rentalDb>>;

type Row = {
  id: string;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  source: string | null;
  created_at: string | null;
};

export async function carIdForName(db: Db, name: string) {
  const { data, error } = await db.from("cars").select("id,name").ilike("name", name);
  if (error) throw new Error(error.message);
  const hit = (data || []).find((car) => String(car.name).trim().toLowerCase() === name.trim().toLowerCase());
  return hit?.id ? String(hit.id) : null;
}

export async function releaseStaleHolds(db: Db, carId: string) {
  const cutoff = new Date(Date.now() - HOLD_MINUTES * 60 * 1000).toISOString();
  const { error } = await db
    .from("bookings")
    .update({ status: "cancelled", notes: "Website hold expired before the deposit was paid." })
    .eq("car_id", carId)
    .eq("status", "hold")
    .in("source", ["site-test", "site"])
    .lt("created_at", cutoff);
  if (error) throw new Error(error.message);
}

export async function busyRanges(db: Db, carId: string, date: string, now = new Date()): Promise<Busy[]> {
  const dates = [addDays(date, -1), date, addDays(date, 1)];
  const { data, error } = await db
    .from("bookings")
    .select("id,event_date,start_time,end_time,status,source,created_at")
    .eq("car_id", carId)
    .in("event_date", dates)
    .neq("status", "cancelled");
  if (error) throw new Error(error.message);
  return ((data || []) as Row[])
    .filter((row) => {
      if (row.status === "hold" && row.created_at && !holdIsFresh(row.created_at, now)) return false;
      if (row.start_time && row.end_time) return true;
      return String(row.event_date || "") === date;
    })
    .map((row) => ({
      start: String(row.start_time || ""),
      end: String(row.end_time || ""),
      date: String(row.event_date || date),
    }));
}

export async function openTimesForCar(db: Db, carId: string, date: string, hours: number) {
  await releaseStaleHolds(db, carId);
  const busy = await busyRanges(db, carId, date);
  return openStartTimes(hours, busy, date);
}

function optionalBookingColumn(name: string) {
  return /^(mileage_|day_of_contact_|wedding_)/.test(name)
    || name === "stripe_deposit_session_id"
    || name === "stripe_balance_session_id"
    || name === "stripe_customer_id"
    || name === "stripe_payment_method_id"
    || name === "total_usd"
    || name === "amount_paid_usd";
}

function columnNamedInError(message: string) {
  return message.match(/'([a-z0-9_]+)' column/i)?.[1] || message.match(/column "([a-z0-9_]+)"/i)?.[1] || "";
}

/** Mileage, day-of, wedding, money, and deposit-session columns are additive. Drop a missing one and retry so a booking still saves. */
export async function insertBooking(db: Db, row: Record<string, unknown>) {
  let payload = { ...row };
  let inserted = await db.from("bookings").insert(payload).select("id").single();
  for (let attempt = 0; attempt < 16 && inserted.error; attempt += 1) {
    const named = columnNamedInError(inserted.error.message || "");
    if (!named || !optionalBookingColumn(named) || !(named in payload)) break;
    const next = { ...payload };
    delete next[named];
    payload = next;
    inserted = await db.from("bookings").insert(payload).select("id").single();
  }
  return inserted;
}

/** Same additive retry as insertBooking, for the deposit webhook update. */
export async function updateBooking(db: Db, id: string, row: Record<string, unknown>) {
  let payload = { ...row };
  let updated = await db.from("bookings").update(payload).eq("id", id).select("id,car_id,status").single();
  for (let attempt = 0; attempt < 16 && updated.error; attempt += 1) {
    const named = columnNamedInError(updated.error.message || "");
    if (!named || !optionalBookingColumn(named) || !(named in payload)) break;
    const next = { ...payload };
    delete next[named];
    payload = next;
    updated = await db.from("bookings").update(payload).eq("id", id).select("id,car_id,status").single();
  }
  return updated;
}
