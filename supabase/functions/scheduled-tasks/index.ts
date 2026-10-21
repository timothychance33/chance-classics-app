// ============================================================
// Chance Classics — Scheduled Tasks (Supabase Edge Function)
// Run hourly by pg_cron (job already live). Does:
//   1) 12-hour warning + 48h auto-advance on unanswered offers
//   2) Weekly driver digest: Monday morning America/Chicago
//   3) Quote auto-reminder before expiry
//   4) Balance reminder: Monday before the event (America/Chicago).
//      Wed–Sun: Monday of that week. Mon or Tue: the previous Monday.
//      The email says the balance is due the day before the event.
//      Skips a $0 balance and any booking already stamped balance_reminder_sent_at.
//   5) Day-before client email: 10:00 AM America/Chicago the day before the event.
//      Confirmed (and later) bookings, plus status new when the deposit or full
//      payment is already recorded. The hourly job sends it on the 10:00 run.
//      A later run the same day retries only bookings that are still unstamped.
//      day_before_email_sent_at stops a second send.
//
// Weekly digest also accepts a Vercel cron POST { weekly_only: true }.
// Idempotent per driver + week via rental.driver_weekly_digest_sends.
//
// Deploy: supabase functions deploy scheduled-tasks
//   Settings -> Verify JWT OFF (same as today).
//   Reuses: RESEND_API_KEY, FROM_EMAIL, OWNER_EMAIL, APP_URL
//   Balance pay links also need STRIPE_SECRET_KEY (same secret as the website).
//   Optional SITE_URL (defaults to https://chanceclassics.com).
//   Plus the automatic SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { balanceReminderMonday, reminderEventWindow } from "../_shared/saved-card.mjs";
import { CUSTOMER_REPLY_TO, DEFAULT_FROM_EMAIL, htmlToPlainText } from "../_shared/email-plain.mjs";
import { balancePayHtml, balancePaySubject, balancePayText } from "../_shared/balance-pay-email.mjs";
import { driverBusyWith, offerRankFor } from "../_shared/driver-availability.mjs";
import {
  DAY_BEFORE_STATUSES,
  PAID_NEW_PAYMENTS,
  bookingTaxExempt,
  dayBeforeSkipReason,
  dayBeforeWindow,
  isPaidNewBooking,
  renderDayBeforeEmail,
} from "../_shared/day-before-email.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? DEFAULT_FROM_EMAIL;
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") ?? "chanceclassics@gmail.com";
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.chanceclassics.com";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://chanceclassics.com";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const CHICAGO_TZ = "America/Chicago";

const ADVANCE_HOURS = 48;

type Booking = Record<string, unknown> & {
  id: string;
  driver_id?: string | null;
  event_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  customer_name?: string | null;
  event_type?: string | null;
  pickup_location?: string | null;
  return_location?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  day_of_contact_name?: string | null;
  day_of_contact_phone?: string | null;
  day_of_contact_role?: string | null;
  notes?: string | null;
  needs_trailer?: boolean | null;
  status?: string | null;
  pay_tier?: number | null;
  car_id?: string | null;
  offer_rank?: number | null;
  offered_at?: string | null;
  offer_warned?: boolean | null;
  passed_by?: string[] | null;
};

type Staff = {
  id: string;
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
  active?: boolean | null;
  priority?: number | null;
  pay_rate?: number | null;
  pulls_trailer?: boolean | null;
  phone?: string | null;
};

function staffName(d: Staff | undefined) {
  return (d?.name || d?.full_name || "").trim() || "there";
}

function driverFacingNotes(notes: unknown) {
  if (!notes) return "";
  return String(notes)
    .split("\n")
    .filter((line) => !/^\s*Price:\s*\$/i.test(line))
    .join("\n")
    .trim();
}

function normTime(t: unknown) {
  if (t == null || t === "") return "";
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(t).trim();
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function fmtTime(t: unknown) {
  const n = normTime(t);
  if (!n) return "";
  const [h, m] = n.split(":");
  let hh = +h;
  const ap = hh >= 12 ? "PM" : "AM";
  hh = hh % 12 || 12;
  return `${hh}:${m}${ap}`;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtEventDate(isoDate: unknown) {
  if (!isoDate) return "";
  const [y, mo, d] = String(isoDate).slice(0, 10).split("-").map(Number);
  if (!y || !mo || !d) return String(isoDate);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return `${DOW[dt.getUTCDay()]} ${MON[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
}

function chicagoParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TZ,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    weekday: parts.weekday as string,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

function addDays(isoDate: string, days: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function chicagoWeekWindow(now = new Date()) {
  const chicago = chicagoParts(now);
  const weekdayIndex = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  }[chicago.weekday] as number;
  const diffToMon = weekdayIndex === 0 ? -6 : 1 - weekdayIndex;
  const weekStart = addDays(chicago.date, diffToMon);
  const weekEnd = addDays(weekStart, 6);
  return { chicago, weekStart, weekEnd };
}

function shouldSendWeeklyDigest(now = new Date(), force = false) {
  const { chicago, weekStart, weekEnd } = chicagoWeekWindow(now);
  if (force) return { ok: true, chicago, weekStart, weekEnd };
  if (chicago.weekday !== "Monday") {
    return { ok: false, chicago, weekStart, weekEnd, reason: `not Monday in ${CHICAGO_TZ} (it is ${chicago.weekday})` };
  }
  if (chicago.hour < 7 || chicago.hour > 10) {
    return { ok: false, chicago, weekStart, weekEnd, reason: `outside Monday morning window in ${CHICAGO_TZ} (hour ${chicago.hour})` };
  }
  return { ok: true, chicago, weekStart, weekEnd };
}

function esc(s: unknown) {
  return (s ?? "").toString().replace(/[&<>"]/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[c] as string));
}

async function sendEmail(to: string, subject: string, html: string, text?: string) {
  const plain = String(text || "").trim() || htmlToPlainText(html) || subject;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Chance Classics <${FROM_EMAIL}>`,
      to,
      reply_to: CUSTOMER_REPLY_TO,
      subject,
      html,
      text: plain,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("Resend error", r.status, t);
    throw new Error(`Resend ${r.status}: ${t}`);
  }
}

function fmtDate(d: string | null | undefined) { return d ?? "TBD"; }

async function balancePayLink(input: {
  bookingId: string;
  email: string;
  customerId: string;
  amount: number;
  eventDate: string;
  taxExempt?: boolean;
}) {
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${SITE_URL}/booking/confirmed/?paid=balance`);
  params.set("cancel_url", `${SITE_URL}/payment-request-page/`);
  params.set("client_reference_id", input.bookingId);
  params.set("metadata[booking_id]", input.bookingId);
  params.set("metadata[purpose]", "charge");
  params.set("metadata[reason]", "balance");
  params.set("payment_intent_data[metadata][booking_id]", input.bookingId);
  params.set("payment_intent_data[metadata][purpose]", "charge");
  params.set("payment_intent_data[metadata][reason]", "balance");
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(Math.round(input.amount * 100)));
  params.set("line_items[0][price_data][product_data][name]", "Chance Classics rental balance");
  params.set("line_items[0][price_data][product_data][description]",
    input.taxExempt
      ? `Balance for ${input.eventDate}. Tax exempt. The balance is due the day before the event.`
      : `Balance for ${input.eventDate}. The booking total includes 10.25% sales tax. The balance is due the day before the event.`);
  if (input.customerId.startsWith("cus_")) params.set("customer", input.customerId);
  else params.set("customer_email", input.email);

  const send = async (body: URLSearchParams) => {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const text = await r.text();
    let parsed: { url?: string; error?: { message?: string } } = {};
    try { parsed = JSON.parse(text); } catch { parsed = { error: { message: text.slice(0, 300) } }; }
    if (!r.ok || !parsed.url) throw new Error(parsed.error?.message || "Stripe did not return a pay link.");
    return parsed.url;
  };
  try {
    return await send(params);
  } catch (error) {
    if (!params.get("customer")) throw error;
    params.delete("customer");
    params.set("customer_email", input.email);
    return send(params);
  }
}

function dayOfContactEmailHtml(b: Booking) {
  const name = String(b.day_of_contact_name || "").trim();
  const phone = String(b.day_of_contact_phone || "").trim();
  const role = String(b.day_of_contact_role || "").trim();
  if (!name && !phone && !role) return "";
  const href = phone.replace(/[^\d+]/g, "");
  const phoneHtml = phone ? (href ? `<a href="tel:${esc(href)}">${esc(phone)}</a>` : esc(phone)) : "";
  const who = [name ? esc(name) : "", role ? esc(role) : ""].filter(Boolean).join(" · ");
  return `<p style="margin:8px 0 0;font-size:14px"><b>Day-of contact</b> — call during the event, not the booker<br>${who}${phoneHtml ? `<br>${phoneHtml}` : ""}</p>`;
}

function bookingCardHtml(b: Booking, carName: string | null, pay: number | null) {
  const time = [fmtTime(b.start_time), fmtTime(b.end_time)].filter(Boolean).join(" – ");
  const notes = driverFacingNotes(b.notes);
  const rows: [string, string][] = [
    ["When", [fmtEventDate(b.event_date) || fmtDate(b.event_date), time].filter(Boolean).join(" · ")],
    ["Event", [b.event_type, b.customer_name].filter(Boolean).join(" — ")],
    ["Car", carName || ""],
    ["Pickup", b.pickup_location || ""],
    ["Drop-off", b.return_location || ""],
    ["Phone", b.customer_phone || ""],
    ["Email", b.customer_email || ""],
    ["Notes", notes],
  ];
  const body = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;color:#6b6052;font-size:13px;vertical-align:top">${esc(k)}</td><td style="padding:3px 0;font-size:14px;white-space:pre-line">${esc(v)}</td></tr>`)
    .join("");
  return `<div style="border:1px solid #c5d4e3;border-radius:10px;padding:12px 14px;margin:12px 0;background:#fff">
    <table style="border-collapse:collapse;width:100%">${body}</table>
    ${dayOfContactEmailHtml(b)}
    ${b.needs_trailer ? `<p style="margin:8px 0 0;font-size:13px;font-weight:700">🚛 Car must be trailered</p>` : ""}
    ${pay != null ? `<p style="margin:8px 0 0;font-size:16px;font-weight:700;color:#3c6b4f">You earn $${pay}</p>` : ""}
  </div>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let weeklyOnly = url.searchParams.get("weekly_only") === "1";
  let force = url.searchParams.get("force") === "1";
  let dryRun = url.searchParams.get("dry_run") === "1";
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body && typeof body === "object") {
        if (body.weekly_only === true) weeklyOnly = true;
        if (body.force === true) force = true;
        if (body.dry_run === true) dryRun = true;
      }
    } catch {
      // empty / non-JSON body from pg_net is fine
    }
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: "rental" } });
  const now = new Date();
  const summary: Record<string, unknown> = { advanced: 0, reminders: 0, errors: [] as string[] };

  const { data: staff } = await sb.from("staff").select("*");
  const drivers = ((staff ?? []) as Staff[]).filter((s) => (s.role || "").includes("driver") && s.active);
  const { data: assignedRows, error: assignedErr } = await sb.from("bookings")
    .select("id,driver_id,event_date,start_time,end_time,status")
    .not("driver_id", "is", null)
    .neq("status", "cancelled");
  if (assignedErr) (summary.errors as string[]).push(`driver availability: ${assignedErr.message}`);
  const assigned = (assignedRows ?? []) as Booking[];
  const nextRankAfter = (current: number, passed: string[], b: Booking) =>
    offerRankFor(drivers, b, assigned, passed, current);
  const driverByPriority = (rank: number) => drivers.find((d) => d.priority === rank);
  const carName = async (carId: string | null | undefined) => {
    if (!carId) return null;
    const { data } = await sb.from("cars").select("name").eq("id", carId).maybeSingle();
    return data?.name ?? null;
  };

  if (!weeklyOnly) {
    // ================= 0a) SKIP DRIVERS WHO ALREADY HAVE THAT WINDOW =================
    // An offer already pointed at someone is moved as soon as they are busy.
    // Do not wait out the 48h timer, and do not email them a reminder.
    summary.skipped_busy = 0;
    const { data: openOffers, error: openErr } = await sb.from("bookings")
      .select("*")
      .is("driver_id", null)
      .not("offer_rank", "is", null)
      .neq("status", "cancelled");
    if (openErr) (summary.errors as string[]).push(`open offers: ${openErr.message}`);
    for (const b of (openOffers ?? []) as Booking[]) {
      const current = driverByPriority(b.offer_rank as number);
      if (!current || !driverBusyWith(current.id, b, assigned)) continue;
      const passed = [...(b.passed_by ?? [])];
      if (!passed.includes(current.id)) passed.push(current.id);
      const nxt = nextRankAfter(b.offer_rank as number, passed, b);
      const moved = await sb.from("bookings").update({
        passed_by: passed,
        offer_rank: nxt,
        offered_at: nxt != null ? now.toISOString() : null,
        offer_warned: false,
      }).eq("id", b.id).is("driver_id", null).eq("offer_rank", b.offer_rank).select("id");
      if (moved.error || !moved.data?.length) {
        if (moved.error) (summary.errors as string[]).push(`${b.id}: skip busy failed (${moved.error.message})`);
        continue;
      }
      summary.skipped_busy = Number(summary.skipped_busy) + 1;
      const cn = await carName(b.car_id);
      const details = `${b.customer_name ?? "Booking"} — ${fmtDate(b.event_date)}${cn ? " · " + cn : ""}`;
      if (nxt != null) {
        const nd = driverByPriority(nxt);
        if (nd?.email) {
          const pay = b.pay_tier && nd.pay_rate ? b.pay_tier * Number(nd.pay_rate) : null;
          await sendEmail(nd.email, `Rental available to claim — ${fmtDate(b.event_date)}`, `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
            <h2 style="color:#6e1d1a">A rental is available for you</h2>
            <p>Hi ${staffName(nd)}, a booking has moved to you. The previous driver already has a booking at that time.</p>
            ${pay != null ? `<p style="font-size:18px;font-weight:700;color:#3c6b4f">You'd earn $${pay}</p>` : ""}
            <p><b>${details}</b></p>
            <p><a href="${APP_URL}" style="background:#6e1d1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Open the app to Claim or Pass</a></p>
          </div>`);
        }
      }
      await sendEmail(OWNER_EMAIL, `Offer skipped a busy driver — ${fmtDate(b.event_date)}`, `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#6e1d1a">An offer skipped a driver who is already booked</h2>
        <p>${staffName(current)} already has a booking at that time, so the offer did not go to them.</p>
        <p><b>${details}</b></p>
        <p>${nxt != null ? `Now offered to ${staffName(driverByPriority(nxt))}.` : "No free drivers left — it's back to you to assign."}</p>
        <p><a href="${APP_URL}">Open the app</a></p>
      </div>`);
    }

    // ================= 0) 12-HOUR WARNING =================
    const warnAfter = new Date(now.getTime() - (ADVANCE_HOURS - 12) * 3600 * 1000).toISOString();
    const { data: warnList } = await sb.from("bookings")
      .select("*")
      .is("driver_id", null)
      .not("offer_rank", "is", null)
      .eq("offer_warned", false)
      .lt("offered_at", warnAfter);

    for (const b of (warnList ?? []) as Booking[]) {
      const d = driverByPriority(b.offer_rank as number);
      if (d?.email && !driverBusyWith(d.id, b, assigned)) {
        const cn = await carName(b.car_id);
        const pay = b.pay_tier && d.pay_rate ? b.pay_tier * Number(d.pay_rate) : null;
        const elapsedH = (now.getTime() - new Date(String(b.offered_at)).getTime()) / 3600000;
        const leftH = Math.max(1, Math.round(ADVANCE_HOURS - elapsedH));
        await sendEmail(d.email, `Reminder: ${leftH}h left to claim — ${fmtDate(b.event_date)}`, `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#b8862c">${leftH} hours left to respond</h2>
          <p>Hi ${staffName(d)}, you still have an open rental offer. Please claim or pass within about ${leftH} hours, or it will automatically move to the next driver.</p>
          ${pay != null ? `<p style="font-size:18px;font-weight:700;color:#3c6b4f">You'd earn $${pay}</p>` : ""}
          <p><b>${b.customer_name ?? "Booking"} — ${fmtDate(b.event_date)}${cn ? " · " + cn : ""}</b></p>
          <p><a href="${APP_URL}" style="background:#6e1d1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Claim or Pass now</a></p>
        </div>`);
      }
      await sb.from("bookings").update({ offer_warned: true }).eq("id", b.id);
      summary.warned = (Number(summary.warned) || 0) + 1;
    }

    // ================= 1) AUTO-ADVANCE =================
    const cutoff = new Date(now.getTime() - ADVANCE_HOURS * 3600 * 1000).toISOString();
    const { data: stale } = await sb.from("bookings")
      .select("*")
      .is("driver_id", null)
      .not("offer_rank", "is", null)
      .lt("offered_at", cutoff);

    for (const b of (stale ?? []) as Booking[]) {
      const current = driverByPriority(b.offer_rank as number);
      const passed = [...(b.passed_by ?? []), ...(current ? [current.id] : [])];
      const nxt = nextRankAfter(b.offer_rank as number, passed, b);
      await sb.from("bookings").update({
        passed_by: passed,
        offer_rank: nxt,
        offered_at: nxt != null ? now.toISOString() : null,
        offer_warned: false,
      }).eq("id", b.id);
      summary.advanced = Number(summary.advanced) + 1;

      const cn = await carName(b.car_id);
      const details = `${b.customer_name ?? "Booking"} — ${fmtDate(b.event_date)}${cn ? " · " + cn : ""}`;

      if (nxt != null) {
        const nd = driverByPriority(nxt);
        if (nd?.email) {
          const pay = b.pay_tier && nd.pay_rate ? b.pay_tier * Number(nd.pay_rate) : null;
          await sendEmail(nd.email, `Rental available to claim — ${fmtDate(b.event_date)}`, `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
            <h2 style="color:#6e1d1a">A rental is available for you</h2>
            <p>Hi ${staffName(nd)}, a booking has moved to you (the previous driver didn't respond in time).</p>
            ${pay != null ? `<p style="font-size:18px;font-weight:700;color:#3c6b4f">You'd earn $${pay}</p>` : ""}
            <p><b>${details}</b></p>
            <p><a href="${APP_URL}" style="background:#6e1d1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Open the app to Claim or Pass</a></p>
          </div>`);
        }
      }
      await sendEmail(OWNER_EMAIL, `Offer auto-advanced — ${fmtDate(b.event_date)}`, `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#6e1d1a">An offer timed out and advanced</h2>
        <p>${staffName(current) === "there" ? "A driver" : staffName(current)} didn't respond within ${ADVANCE_HOURS}h, so:</p>
        <p><b>${details}</b></p>
        <p>${nxt != null ? `Now offered to ${staffName(driverByPriority(nxt))}.` : "No drivers left — it's back to you to assign."}</p>
        <p><a href="${APP_URL}">Open the app</a></p>
      </div>`);
    }
  }

  // ================= 2) WEEKLY REMINDER (Monday morning Chicago) =================
  const gate = shouldSendWeeklyDigest(now, force);
  summary.weekly = {
    attempted: gate.ok,
    week_start: gate.weekStart,
    week_end: gate.weekEnd,
    chicago_date: gate.chicago.date,
    chicago_weekday: gate.chicago.weekday,
    chicago_hour: gate.chicago.hour,
    reason: "reason" in gate ? gate.reason : undefined,
    dry_run: dryRun,
    skipped_no_email: 0,
    skipped_already_sent: 0,
    skipped_empty: 0,
  };

  if (gate.ok) {
    const monStr = gate.weekStart;
    const sunStr = gate.weekEnd;
    const weekLabel = `${fmtEventDate(monStr)} – ${fmtEventDate(sunStr)}`;

    for (const d of drivers) {
      const email = (d.email || "").trim();
      if (!email) {
        (summary.weekly as Record<string, number>).skipped_no_email++;
        console.log(`weekly digest skip: ${staffName(d)} has no email`);
        continue;
      }

      const { data: theirs } = await sb.from("bookings")
        .select("*")
        .eq("driver_id", d.id)
        .gte("event_date", monStr)
        .lte("event_date", sunStr)
        .neq("status", "cancelled");
      if (!theirs || !theirs.length) {
        (summary.weekly as Record<string, number>).skipped_empty++;
        continue;
      }

      if (dryRun) {
        summary.reminders = Number(summary.reminders) + 1;
        continue;
      }

      const claim = await sb.from("driver_weekly_digest_sends").insert({
        staff_id: d.id,
        week_start: monStr,
      });
      if (claim.error) {
        if (claim.error.code === "23505") {
          (summary.weekly as Record<string, number>).skipped_already_sent++;
          continue;
        }
        if (claim.error.code === "42P01") {
          console.warn("rental.driver_weekly_digest_sends is missing — apply the migration to stop retry double-sends");
        } else {
          (summary.errors as string[]).push(`${email}: claim failed (${claim.error.message})`);
          continue;
        }
      }

      (theirs as Booking[]).sort((a, b) => {
        const dd = (a.event_date ?? "").localeCompare(b.event_date ?? "");
        if (dd) return dd;
        return normTime(a.start_time).localeCompare(normTime(b.start_time));
      });

      let cards = "";
      for (const b of theirs as Booking[]) {
        const cn = await carName(b.car_id);
        const pay = b.pay_tier && d.pay_rate ? b.pay_tier * Number(d.pay_rate) : null;
        cards += bookingCardHtml(b, cn, pay);
      }

      try {
        await sendEmail(email, "Your Chance Classics bookings this week", `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f">
          <h2 style="color:#6e1d1a">Your bookings this week</h2>
          <p>Hi ${esc(staffName(d))}, here's what's on your Chance Classics schedule for ${esc(weekLabel)}.</p>
          ${cards}
          <p><a href="${APP_URL}" style="background:#6e1d1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Open the app</a></p>
          <p style="color:#6b6052;font-size:13px">If something looks off, reply to this email or ping Tim.</p>
        </div>`);
        summary.reminders = Number(summary.reminders) + 1;
      } catch (e) {
        await sb.from("driver_weekly_digest_sends").delete().eq("staff_id", d.id).eq("week_start", monStr);
        (summary.errors as string[]).push(`${email}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  if (!weeklyOnly) {
    // ================= 3) QUOTE AUTO-REMINDER (before expiry) =================
    const QUOTE_VALID_DAYS = 7;
    const REMIND_BEFORE_EXPIRY_DAYS = 2;
    const quoteRemindCutoff = new Date(now.getTime() - (QUOTE_VALID_DAYS - REMIND_BEFORE_EXPIRY_DAYS) * 86400000).toISOString();
    const quoteExpireCutoff = new Date(now.getTime() - QUOTE_VALID_DAYS * 86400000).toISOString();

    const { data: dueQuotes, error: quoteQueryErr } = await sb
      .from("quote_requests")
      .select("*")
      .eq("status", "sent")
      .is("reminder_sent_at", null)
      .not("customer_email", "is", null)
      .lte("sent_at", quoteRemindCutoff)
      .gt("sent_at", quoteExpireCutoff);
    if (quoteQueryErr) {
      (summary.errors as string[]).push(`quote_reminder query failed: ${quoteQueryErr.message}`);
    }

    summary.quote_reminders = 0;
    for (const q of dueQuotes ?? []) {
      const cn = await carName(q.car_id);
      let bookUrl = "https://chanceclassics.com/book-online?referral=quote_email";
      if (q.car_id) {
        const { data: carRow } = await sb.from("cars").select("book_url").eq("id", q.car_id).maybeSingle();
        if (carRow?.book_url) bookUrl = carRow.book_url;
      }
      const money = (n: unknown) => `$${Number(n || 0).toFixed(2)}`;
      await sendEmail(
        q.customer_email,
        `Your quote expires soon${q.event_date ? ` — ${q.event_date}` : ""}`,
        `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f">
        <h2 style="color:#6e1d1a">Your quote is about to expire</h2>
        <p>Hi ${q.customer_name ?? "there"}, just a friendly reminder about the quote we sent for${cn ? ` the ${cn}` : " your event"}${q.event_date ? ` on ${q.event_date}` : ""}.</p>
        ${cn || q.event_location ? `<p><b>${cn ?? ""}</b>${q.event_location ? ` · ${q.event_location}` : ""}</p>` : ""}
        ${q.total ? `<p style="font-size:18px;font-weight:800">Total: ${money(q.total)}</p>` : ""}
        <p>This quote is valid for a little while longer — if you're still interested, we'd love to lock in your date before it expires.</p>
        <p><a href="${bookUrl}" style="background:#6e1d1a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Book now</a></p>
        <p style="color:#6b6052;font-size:13px;margin-top:18px">Questions, or need it adjusted? Just reply to this email.</p>
      </div>`,
      );
      await sb.from("quote_requests").update({ reminder_sent_at: now.toISOString() }).eq("id", q.id);
      summary.quote_reminders = Number(summary.quote_reminders) + 1;
    }
  }

  // ================= 4) BALANCE REMINDER (Monday before the event, Chicago) =================
  // Customer copy is balancePayHtml, the same note a garage pay link emails.
  // Hourly pg_cron sends these after 7am. The Monday driver-digest call can send too.
  // balance_reminder_sent_at stops a second email.
  summary.balance_reminders = { sent: 0, skipped: 0, errors: [] as string[] };
  {
    const chicagoNow = chicagoParts(now);
    const balanceSummary = summary.balance_reminders as { sent: number; skipped: number; errors: string[]; reason?: string };
    if (chicagoNow.weekday !== "Monday") {
      balanceSummary.reason = `not Monday in ${CHICAGO_TZ} (it is ${chicagoNow.weekday})`;
    } else if (chicagoNow.hour < 7) {
      balanceSummary.reason = `before 7am in ${CHICAGO_TZ} (hour ${chicagoNow.hour})`;
    } else if (!STRIPE_SECRET_KEY) {
      balanceSummary.reason = "STRIPE_SECRET_KEY is not set on scheduled-tasks";
      balanceSummary.errors.push(balanceSummary.reason);
    } else if (!RESEND_API_KEY) {
      balanceSummary.reason = "RESEND_API_KEY is not set";
      balanceSummary.errors.push(balanceSummary.reason);
    } else {
      const eventWindow = reminderEventWindow(chicagoNow.date);
      const balanceColumns = "id,customer_name,customer_email,event_date,event_type,start_time,end_time,pickup_location,return_location,status,notes,total_usd,amount_paid_usd,balance_due_usd,balance_reminder_sent_at,stripe_customer_id,car_id,tax_exempt";
      const balanceQuery = (columns: string) => sb.from("bookings")
        .select(columns)
        .is("balance_reminder_sent_at", null)
        .not("customer_email", "is", null)
        .gte("event_date", eventWindow.from)
        .lte("event_date", eventWindow.to)
        .neq("status", "cancelled")
        .neq("status", "hold");
      let due = await balanceQuery(balanceColumns);
      if (due.error && /tax_exempt/i.test(due.error.message || "")) {
        due = await balanceQuery(balanceColumns.replace(",tax_exempt", ""));
      }
      if (due.error) {
        const missing = /balance_reminder_sent_at|stripe_customer_id/i.test(due.error.message || "");
        balanceSummary.errors.push(missing
          ? "Apply the saved-card migration before balance reminders can send."
          : `balance reminder query failed: ${due.error.message}`);
      } else {
        for (const b of due.data ?? []) {
          const email = String(b.customer_email || "").trim();
          const eventDate = String(b.event_date || "").slice(0, 10);
          if (!email || balanceReminderMonday(eventDate) !== chicagoNow.date) {
            balanceSummary.skipped += 1;
            continue;
          }
          const balance = b.balance_due_usd != null && b.balance_due_usd !== ""
            ? Math.round(Number(b.balance_due_usd) * 100) / 100
            : (b.total_usd == null
              ? null
              : Math.round((Number(b.total_usd) - Number(b.amount_paid_usd || 0)) * 100) / 100);
          if (balance == null || !Number.isFinite(balance) || balance <= 0) {
            balanceSummary.skipped += 1;
            continue;
          }
          if (balance < 0.5) {
            balanceSummary.skipped += 1;
            continue;
          }
          if (dryRun) {
            balanceSummary.sent += 1;
            continue;
          }
          const claimed = await sb.from("bookings")
            .update({ balance_reminder_sent_at: now.toISOString() })
            .eq("id", b.id)
            .is("balance_reminder_sent_at", null)
            .select("id");
          if (claimed.error || !claimed.data?.length) {
            balanceSummary.skipped += 1;
            continue;
          }
          try {
            const payUrl = await balancePayLink({
              bookingId: String(b.id),
              email,
              customerId: b.stripe_customer_id ? String(b.stripe_customer_id) : "",
              amount: balance,
              eventDate,
              taxExempt: bookingTaxExempt(b),
            });
            const cn = await carName(b.car_id);
            const payMail = {
              firstName: b.customer_name,
              eventDate,
              car: cn,
              amount: balance,
              payUrl,
              eventType: b.event_type,
              startTime: b.start_time,
              endTime: b.end_time,
              pickup: b.pickup_location,
              dropoff: b.return_location,
              mondayReminder: true,
              taxExempt: bookingTaxExempt(b),
            };
            await sendEmail(
              email,
              balancePaySubject(eventDate),
              balancePayHtml(payMail),
              balancePayText(payMail),
            );
            balanceSummary.sent += 1;
          } catch (e) {
            await sb.from("bookings").update({ balance_reminder_sent_at: null }).eq("id", b.id);
            balanceSummary.errors.push(`${email}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
    }
  }

  // ================= 5) DAY-BEFORE CLIENT EMAIL (10:00 AM Chicago, event is tomorrow) =================
  // Same sender as the other scheduled mail. Balance still due uses balancePayLink,
  // the same checkout the Monday reminder and a garage pay link create.
  // day_before_email_sent_at stops a second email. A failed send clears the stamp.
  summary.day_before = { sent: 0, skipped: 0, errors: [] as string[] };
  {
    const chicagoNow = chicagoParts(now);
    const daySummary = summary.day_before as { sent: number; skipped: number; errors: string[]; reason?: string };
    const window = dayBeforeWindow(chicagoNow);
    if (!window.ok) {
      daySummary.reason = window.reason;
    } else if (!RESEND_API_KEY) {
      daySummary.reason = "RESEND_API_KEY is not set";
      daySummary.errors.push(daySummary.reason);
    } else {
      const dayBeforeColumns = "id,customer_name,customer_email,event_type,event_date,start_time,end_time,pickup_location,return_location,status,notes,source,total_usd,amount_paid_usd,balance_due_usd,payment_status,stripe_customer_id,car_id,driver_id,replied_at,reviewed_at,photos_received_at,day_before_email_sent_at,tax_exempt";
      const dayBeforeQuery = (columns: string) => Promise.all([
        sb.from("bookings")
          .select(columns)
          .eq("event_date", window.eventDate)
          .in("status", DAY_BEFORE_STATUSES)
          .is("day_before_email_sent_at", null),
        sb.from("bookings")
          .select(columns)
          .eq("event_date", window.eventDate)
          .eq("status", "new")
          .in("payment_status", PAID_NEW_PAYMENTS)
          .is("day_before_email_sent_at", null),
      ]);
      let [due, paidNew] = await dayBeforeQuery(dayBeforeColumns);
      if ((due.error && /tax_exempt/i.test(due.error.message || ""))
        || (paidNew.error && /tax_exempt/i.test(paidNew.error.message || ""))) {
        [due, paidNew] = await dayBeforeQuery(dayBeforeColumns.replace(",tax_exempt", ""));
      }
      const queryError = due.error || paidNew.error;
      if (queryError) {
        const missing = /day_before_email_sent_at/i.test(queryError.message || "");
        daySummary.errors.push(missing
          ? "Apply the day-before email migration before these emails can send."
          : `day-before query failed: ${queryError.message}`);
      } else {
        const seen = new Set<string>();
        const rows = [...(due.data ?? []), ...(paidNew.data ?? [])].filter((row) => {
          const id = String(row.id);
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        const ids = rows.map((row) => row.id);
        const carIds = [...new Set(rows.map((row) => row.car_id).filter(Boolean))];
        const cars = new Map<string, { id: string; name?: string | null; year?: number | null; make?: string | null; model?: string | null }>();
        if (carIds.length) {
          const loaded = await sb.from("cars").select("id,name,year,make,model").in("id", carIds);
          if (loaded.error) daySummary.errors.push(`day-before cars: ${loaded.error.message}`);
          for (const car of loaded.data ?? []) cars.set(car.id, car);
        }
        const quotes = new Map<string, Record<string, unknown>>();
        if (ids.length) {
          const loaded = await sb.from("quote_requests")
            .select("booking_id,hours,event_type,event_location,dropoff_location,details")
            .in("booking_id", ids);
          if (loaded.error) daySummary.errors.push(`day-before quotes: ${loaded.error.message}`);
          for (const quote of loaded.data ?? []) {
            if (quote.booking_id) quotes.set(quote.booking_id, quote);
          }
        }
        const staffById = new Map(((staff ?? []) as Staff[]).map((person) => [person.id, person]));
        for (const row of rows) {
          const reason = dayBeforeSkipReason(row);
          if (reason) {
            daySummary.skipped += 1;
            continue;
          }
          const email = String(row.customer_email || "").trim();
          const preview = renderDayBeforeEmail({
            booking: row,
            car: row.car_id ? cars.get(row.car_id) : null,
            quote: quotes.get(row.id) || null,
            driver: null,
          });
          if (preview.needsPayLink && !STRIPE_SECRET_KEY) {
            daySummary.errors.push(`${row.id}: STRIPE_SECRET_KEY is not set on scheduled-tasks`);
            continue;
          }
          if (dryRun) {
            daySummary.sent += 1;
            continue;
          }
          let claim = sb.from("bookings")
            .update({ day_before_email_sent_at: now.toISOString() })
            .eq("id", row.id)
            .is("day_before_email_sent_at", null);
          claim = isPaidNewBooking(row)
            ? claim.eq("status", "new").in("payment_status", PAID_NEW_PAYMENTS)
            : claim.in("status", DAY_BEFORE_STATUSES);
          const claimed = await claim.select("id");
          if (claimed.error || !claimed.data?.length) {
            daySummary.skipped += 1;
            continue;
          }
          try {
            const person = row.driver_id ? staffById.get(row.driver_id) : undefined;
            const driverName = (person?.name || person?.full_name || "").trim();
            const driver = driverName ? { name: driverName, phone: person?.phone || "" } : null;
            let payUrl = "";
            if (preview.needsPayLink) {
              payUrl = await balancePayLink({
                bookingId: String(row.id),
                email,
                customerId: row.stripe_customer_id ? String(row.stripe_customer_id) : "",
                amount: Number(preview.balance),
                eventDate: String(row.event_date || "").slice(0, 10),
                taxExempt: bookingTaxExempt(row),
              });
            }
            const mail = renderDayBeforeEmail({
              booking: row,
              car: row.car_id ? cars.get(row.car_id) : null,
              quote: quotes.get(row.id) || null,
              driver,
              payUrl,
            });
            if (mail.needsPayLink && !mail.payUrl) throw new Error("Stripe did not return a pay link.");
            await sendEmail(email, mail.subject, mail.html, mail.text);
            daySummary.sent += 1;
          } catch (e) {
            await sb.from("bookings").update({ day_before_email_sent_at: null }).eq("id", row.id);
            daySummary.errors.push(`${row.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, ...summary }), {
    headers: { "Content-Type": "application/json" },
  });
});
