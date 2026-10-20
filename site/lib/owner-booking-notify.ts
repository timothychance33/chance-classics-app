import type { rentalDb } from "@/lib/rental-db";
import { WEDDING_COLUMN_NAMES } from "@/lib/booking-rules";
import { ownerBookingCreatedRows, shouldEmailOwnerAboutBooking } from "./owner-booking-email.mjs";

export {
  failedChargeNoticeIds,
  paymentNoticeIds,
  refundNoticeIds,
} from "./owner-booking-email.mjs";

type Db = NonNullable<ReturnType<typeof rentalDb>>;

const BOOKING_COLUMNS =
  "id,customer_name,customer_email,customer_phone,event_type,event_date,start_time,end_time,pickup_location,return_location,car_id,status,notes,total_usd,day_of_contact_name,day_of_contact_phone,day_of_contact_role";

const WEDDING_COLUMNS = WEDDING_COLUMN_NAMES.join(",");

function columnNamedInError(message: string) {
  return message.match(/'([a-z0-9_]+)' column/i)?.[1] || message.match(/column "([a-z0-9_]+)"/i)?.[1] || "";
}

type BookingNoticeRow = {
  id: string;
  car_id: string | null;
  status: string | null;
  notes: string | null;
  total_usd: number | null;
  owner_notified_at?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  event_type?: string | null;
  event_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  pickup_location?: string | null;
  return_location?: string | null;
  day_of_contact_name?: string | null;
  day_of_contact_phone?: string | null;
  day_of_contact_role?: string | null;
  wedding_partner_1_name?: string | null;
  wedding_partner_1_social?: string | null;
  wedding_partner_2_name?: string | null;
  wedding_partner_2_social?: string | null;
  wedding_photographer_name?: string | null;
  wedding_photographer_email?: string | null;
  wedding_photographer_instagram?: string | null;
};

async function selectBooking(db: Db, bookingId: string) {
  let includeWedding = true;
  let includeStamp = true;
  let lastError = "The booking could not be loaded.";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const columns = [BOOKING_COLUMNS, includeWedding ? WEDDING_COLUMNS : "", includeStamp ? "owner_notified_at" : ""]
      .filter(Boolean)
      .join(",");
    const loaded = await db.from("bookings").select(columns).eq("id", bookingId).maybeSingle();
    if (!loaded.error) return { row: loaded.data as BookingNoticeRow | null, tracksNotified: includeStamp };
    lastError = loaded.error.message || lastError;
    const named = columnNamedInError(lastError);
    if (named.startsWith("wedding_") && includeWedding) {
      includeWedding = false;
      continue;
    }
    if (named === "owner_notified_at" && includeStamp) {
      includeStamp = false;
      continue;
    }
    break;
  }
  throw new Error(lastError);
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

export function resendMessageIdFromNotify(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const result = (payload as { result?: unknown }).result;
  if (!result || typeof result !== "object" || !("id" in result)) return "";
  const id = (result as { id?: unknown }).id;
  return typeof id === "string" ? id.trim() : "";
}

async function postOwnerNotice(body: Record<string, unknown>) {
  const url = notifyUrl();
  const headers = notifyHeaders();
  if (!url || (!headers["x-notify-secret"] && !headers.Authorization)) {
    return { ok: false as const, error: "Notify is not configured." };
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { ok: false as const, error: text || `Notify failed (${response.status}).` };
  }
  const payload = await response.json().catch(() => null);
  return { ok: true as const, resendMessageId: resendMessageIdFromNotify(payload) };
}

export async function postOwnerBookingEmail(booking: Record<string, unknown>) {
  return postOwnerNotice({ type: "booking_created", booking });
}

/** Email the customer the same balance pay-link note the Monday reminder sends. */
export async function emailCustomerBalancePay(input: {
  to: string;
  customerName: string;
  eventDate: string;
  carName: string;
  amount: number;
  payUrl: string;
  eventType?: string;
  startTime?: string;
  endTime?: string;
  pickupLocation?: string;
  returnLocation?: string;
}) {
  const to = String(input.to || "").trim();
  if (!to) return { ok: false as const, error: "This booking has no customer email." };
  if (!/^https:\/\//i.test(String(input.payUrl || ""))) {
    return { ok: false as const, error: "The pay link is missing." };
  }
  return postOwnerNotice({
    type: "balance_pay",
    to,
    customer_name: input.customerName,
    event_date: input.eventDate,
    car_name: input.carName,
    amount: input.amount,
    pay_url: input.payUrl,
    event_type: input.eventType || "",
    start_time: input.startTime || "",
    end_time: input.endTime || "",
    pickup_location: input.pickupLocation || "",
    return_location: input.returnLocation || "",
  });
}

/** Email Tim the full site quote request. The customer is not a recipient. */
export async function emailOwnerAboutQuote(quote: Record<string, unknown>) {
  return postOwnerNotice({ type: "quote_request", quote });
}

function missingNotices(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01"
    || error.code === "PGRST205"
    || /owner_money_notices/i.test(error.message || "");
}

function roundDollars(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

async function claimMoneyNotices(db: Db, ids: string[], fields: { bookingId: string; kind: string; amount: number }) {
  const inserted = await db.from("owner_money_notices").insert(ids.map((noticeId) => ({
    notice_id: noticeId,
    booking_id: fields.bookingId,
    kind: fields.kind,
    amount_usd: fields.amount,
  })));
  if (!inserted.error) return { ok: true as const, claimed: true };
  if (inserted.error.code === "23505") return { ok: true as const, claimed: false };
  if (missingNotices(inserted.error)) {
    return {
      ok: false as const,
      missingTable: true as const,
      error: "Apply the owner_money_notices migration before these owner emails can be sent once.",
    };
  }
  return { ok: false as const, missingTable: false as const, error: inserted.error.message };
}

async function deliverMoneyEmail(db: Db, bookingId: string, input: {
  amount: number;
  reason: string;
  chargeReason?: string;
  detail?: string;
  amountPaid?: number | null;
  balance?: number | null;
}) {
  const loaded = await selectBooking(db, bookingId);
  const row = loaded.row;
  if (!row) return { ok: false as const, error: "Booking not found." };
  const figures = await db.from("bookings").select("total_usd,amount_paid_usd").eq("id", bookingId).maybeSingle();
  const paid = input.amountPaid != null
    ? roundDollars(input.amountPaid)
    : figures.error
      ? null
      : roundDollars(figures.data?.amount_paid_usd);
  const total = figures.error ? roundDollars(row.total_usd) : roundDollars(figures.data?.total_usd);
  const balance = input.balance != null
    ? roundDollars(input.balance)
    : total != null && paid != null
      ? roundDollars(total - paid)
      : null;
  const [name, planner] = await Promise.all([
    carName(db, row.car_id),
    plannerForBooking(db, bookingId),
  ]);
  const booking = {
    ...row,
    car_name: name,
    planner: planner || undefined,
    price: row.total_usd,
    amount_paid: paid,
    balance,
  };
  return postOwnerNotice({
    type: "booking_money",
    booking,
    money: {
      amount: input.amount,
      reason: input.reason,
      chargeReason: input.chargeReason || "",
      detail: input.detail || "",
      amountPaid: paid,
      balance,
    },
  });
}

/**
 * Email Tim once per Stripe event, payment, or refund.
 * The notice row is removed when send-notification rejects the mail, so a retry can send it.
 * Checkout webhooks should not send when the notice table is missing: Stripe will retry.
 * The garage charge route can send once without the table so Tim still hears about that charge.
 */
export async function emailOwnerAboutMoney(
  db: Db,
  bookingId: string,
  input: {
    amount: number;
    reason: string;
    chargeReason?: string;
    detail?: string;
    noticeIds: string[];
    amountPaid?: number | null;
    balance?: number | null;
  },
  options?: { sendIfUntracked?: boolean },
) {
  const ids = [...new Set(input.noticeIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return { ok: false as const, retry: false, error: "Missing Stripe id for the owner email." };
  const claim = await claimMoneyNotices(db, ids, {
    bookingId,
    kind: input.reason,
    amount: input.amount,
  });
  if (!claim.ok) {
    if (claim.missingTable && options?.sendIfUntracked) {
      const sent = await deliverMoneyEmail(db, bookingId, input);
      if (!sent.ok) return { ok: false as const, retry: false, error: sent.error };
      return { ok: true as const, skipped: false, untracked: true };
    }
    return { ok: false as const, retry: true, missingTable: claim.missingTable === true, error: claim.error };
  }
  if (!claim.claimed) return { ok: true as const, skipped: true };
  let sent: { ok: true } | { ok: false; error: string };
  try {
    sent = await deliverMoneyEmail(db, bookingId, input);
  } catch (error) {
    sent = { ok: false, error: error instanceof Error ? error.message : "The owner email did not send." };
  }
  if (!sent.ok) {
    const removed = await db.from("owner_money_notices").delete().in("notice_id", ids);
    if (removed.error) console.error("owner money notice release failed:", removed.error.message);
    return { ok: false as const, retry: !removed.error, error: sent.error };
  }
  const stamped = await db.from("owner_money_notices").update({ sent_at: new Date().toISOString() }).in("notice_id", ids);
  if (stamped.error) console.error("owner money notice stamp failed:", stamped.error.message);
  return { ok: true as const, skipped: false };
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
