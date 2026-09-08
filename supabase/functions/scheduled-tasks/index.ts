// ============================================================
// Chance Classics — Scheduled Tasks (Supabase Edge Function)
// Run hourly by pg_cron (job already live). Does:
//   1) 12-hour warning + 48h auto-advance on unanswered offers
//   2) Weekly driver digest: Monday morning America/Chicago
//   3) Quote auto-reminder before expiry
//
// Weekly digest also accepts a Vercel cron POST { weekly_only: true }.
// Idempotent per driver + week via rental.driver_weekly_digest_sends.
//
// Deploy: supabase functions deploy scheduled-tasks
//   Settings -> Verify JWT OFF (same as today).
//   Reuses: RESEND_API_KEY, FROM_EMAIL, OWNER_EMAIL, APP_URL
//   Plus the automatic SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "chanceclassics@2ndchancespeedshop.com";
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") ?? "chanceclassics@gmail.com";
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.chanceclassics.com";
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

async function sendEmail(to: string, subject: string, html: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `Chance Classics <${FROM_EMAIL}>`, to, subject, html }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("Resend error", r.status, t);
    throw new Error(`Resend ${r.status}: ${t}`);
  }
}

function fmtDate(d: string | null | undefined) { return d ?? "TBD"; }

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
  const eligible = (b: Booking) => drivers.filter((d) => !b.needs_trailer || d.pulls_trailer !== false);
  const nextRankAfter = (current: number, passed: string[], b: Booking) => {
    const ranks = eligible(b)
      .filter((d) => d.priority != null && !passed.includes(d.id) && (d.priority as number) > current)
      .map((d) => d.priority as number);
    return ranks.length ? Math.min(...ranks) : null;
  };
  const driverByPriority = (rank: number) => drivers.find((d) => d.priority === rank);
  const carName = async (carId: string | null | undefined) => {
    if (!carId) return null;
    const { data } = await sb.from("cars").select("name").eq("id", carId).maybeSingle();
    return data?.name ?? null;
  };

  if (!weeklyOnly) {
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
      if (d?.email) {
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
      let bookUrl = "https://www.chanceclassics.com/book-online?referral=quote_email";
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

  return new Response(JSON.stringify({ ok: true, ...summary }), {
    headers: { "Content-Type": "application/json" },
  });
});
