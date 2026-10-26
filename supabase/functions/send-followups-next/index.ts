// ============================================================
// CHANCE CLASSICS — send-followups-next Edge Function (TEST MODE BUILD)
//
// Next-generation follow-up emails (plain text). The daily cron calls this
// function with ?mode=live. `send-followups` is the older HTML sender.
//
// Modes (query string ?mode=...):
//   preview  → render all templates for a sample, return text, send nothing
//   test     → send each template to TEST_TO only, subjects prefixed [TEST];
//              never emails a customer and never writes to the database
//   dry_run  → (default) list which bookings WOULD get which email today
//              (ids/dates only), send nothing, write nothing
//   live     → real sends to customers; refused unless LIVE_ENABLED = true
//
// Optional params: booking_id (sample data source for preview/test),
//                  as_of=YYYY-MM-DD (dry_run/live "today", America/Chicago)
//
// Auth: x-cron-secret header, checked by rental.verify_followups_cron_secret
// (Vault secret "followups_cron_secret"). verify_jwt is on at the gateway.
// From: FROM_EMAIL (same secret as send-notification). Display name stays
// "Tim Chance | Chance Classics". Body is already plain text.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { DEFAULT_FROM_EMAIL } from "../_shared/email-plain.mjs";

// ---------- go-live switches (all OFF while in test) ----------
const LIVE_ENABLED = true; // mode=live is refused until Tim approves go-live
const REMINDERS_ENABLED = true; // day-10 / day-60 reminders in live mode
// Tim's rule: status 'new' bookings qualify ONLY when a driver is assigned
// (a deposit/payment alone does not count).
const INCLUDE_NEW_WITH_DRIVER = true;
// Only send a reminder if its original email was sent on/after this date
// (so people who got the OLD wording don't get a "Re:" of a different subject).
const REMINDER_CUTOVER: string | null = "2026-10-01"; // go-live (Tim approved 10/1 1:17 PM CT)

// Statuses from the app (index.html STATUSES/EARNING_STATUSES). 'new' handled above; cancelled never.
const ELIGIBLE_STATUSES = ["confirmed", "prepping", "ready", "out", "completed"];

const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? DEFAULT_FROM_EMAIL;
const FROM = `"Tim Chance | Chance Classics" <${FROM_EMAIL}>`;
const REPLY_TO = "chanceclassics@gmail.com";
const TEST_TO = "chanceclassics@gmail.com";
const REVIEW_LINK = "https://g.page/r/CagTWW5ZROCWEAE/review";
const TZ = "America/Chicago";

type Kind = "review" | "review_reminder" | "photo" | "photo_reminder";

// Send window = event_date between (today - maxDay) and (today - minDay).
// The extra days are catch-up for missed runs; *_sent_at columns prevent repeats.
const SCHEDULE: Record<Kind, { minDay: number; maxDay: number; sentCol: string }> = {
  review: { minDay: 3, maxDay: 9, sentCol: "review_email_sent_at" },
  review_reminder: { minDay: 10, maxDay: 16, sentCol: "review_reminder_sent_at" },
  photo: { minDay: 45, maxDay: 65, sentCol: "photo_email_sent_at" },
  photo_reminder: { minDay: 60, maxDay: 74, sentCol: "photo_reminder_sent_at" },
};
const REVIEW_REMINDER_MIN_GAP_DAYS = 5; // after the review email was sent
const PHOTO_REMINDER_MIN_GAP_DAYS = 10; // after the photo email was sent

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { db: { schema: "rental" } },
);

// ---------- personalization ----------

export function firstName(full: string | null | undefined): string {
  const clean = (s: string) => s.replace(/^[^\p{L}]+/u, "").replace(/[^\p{L}]+$/u, "");
  const words = (full ?? "").trim().split(/\s+/).map(clean).filter(Boolean);
  // Skip a leading honorific ("Dr. Jane Smith" -> Jane).
  if (words.length > 1 && /^(mr|mrs|ms|miss|dr|mx)$/i.test(words[0])) words.shift();
  const w = words[0] ?? "";
  if (!w) return "there";
  // Respect deliberate mixed case (McKenzie, DeShawn); fix all-lower / ALL-CAPS.
  if (w !== w.toLowerCase() && w !== w.toUpperCase()) return w;
  return w.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());
}

export function occasion(eventType: string | null | undefined): string {
  const t = (eventType ?? "").trim().replace(/\s+/g, " ");
  // Wix imports store the service name ("Rental: 1941 Buick Convertible"), not an occasion.
  if (!t || /^rental\b/i.test(t)) return "big day";
  return t.toLowerCase();
}

export function carName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  return n || "the car";
}

// ---------- templates (approved copy, plain text) ----------

type Vars = { first: string; car: string; occasion: string };

export function render(kind: Kind, v: Vars): { subject: string; text: string } {
  switch (kind) {
    case "review":
      return {
        subject: "Thanks from Chance Classics",
        text: [
          `Hey ${v.first},`,
          "",
          `Tim with Chance Classics here. It was an honor to drive y'all in ${v.car} for your ${v.occasion}, and I hope everything went perfectly.`,
          "",
          "Would you mind leaving us a quick Google review? It's the main way other folks find us, and it only takes a minute:",
          REVIEW_LINK,
          "",
          "Thanks again,",
          "Tim Chance",
          "Chance Classics | (318) 344-5001",
        ].join("\n"),
      };
    case "review_reminder":
      return {
        subject: "Re: Thanks from Chance Classics",
        text: [
          `Hey ${v.first}, just bumping this in case it got buried. If you haven't already, a Google review would really help us out: ${REVIEW_LINK}`,
          "",
          "Either way, thanks for riding with us!",
          "Tim",
        ].join("\n"),
      };
    case "photo":
      return {
        subject: `Any pictures with ${v.car}?`,
        text: [
          `Hey ${v.first},`,
          "",
          `Tim with Chance Classics again. If you've gotten your pictures back and there are any good ones with ${v.car}, would you mind sending a few my way? Real pictures from real events are the best thing we can show future customers.`,
          "",
          "Just reply here or text them to (318) 344-5001. If you'd like your photographer tagged when we share them, send me their name and I'll make sure they get credit.",
          "",
          "Thanks!",
          "Tim",
        ].join("\n"),
      };
    case "photo_reminder":
      return {
        subject: `Re: Any pictures with ${v.car}?`,
        text: [
          `Hey ${v.first}, just checking back on this. If you haven't already, even one or two phone pictures with ${v.car} would be great. Thanks!`,
          "Tim",
        ].join("\n"),
      };
  }
}

// ---------- helpers ----------

type Booking = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  event_type: string | null;
  event_date: string;
  status: string;
  payment_status: string | null;
  driver_id: string | null;
  review_email_sent_at: string | null;
  photo_email_sent_at: string | null;
  review_reminder_sent_at: string | null;
  photo_reminder_sent_at: string | null;
  reviewed_at: string | null;
  photos_received_at: string | null;
  replied_at: string | null;
  cars: { name: string | null } | null;
};

const BOOKING_COLS =
  "id, customer_name, customer_email, event_type, event_date, status, payment_status, driver_id, " +
  "review_email_sent_at, photo_email_sent_at, review_reminder_sent_at, photo_reminder_sent_at, " +
  "reviewed_at, photos_received_at, replied_at, cars(name)";

function varsFor(b: Pick<Booking, "customer_name" | "event_type" | "cars">): Vars {
  return { first: firstName(b.customer_name), car: carName(b.cars?.name), occasion: occasion(b.event_type) };
}

function chicagoToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
}

function minusDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function isEligibleStatus(b: Booking): boolean {
  if (ELIGIBLE_STATUSES.includes(b.status)) return true;
  if (INCLUDE_NEW_WITH_DRIVER && b.status === "new") return !!b.driver_id;
  return false;
}

function daysSince(ts: string, today: string): number {
  return (Date.parse(today + "T12:00:00Z") - Date.parse(ts)) / 86_400_000;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendViaResend(to: string, subject: string, text: string, idempotencyKey?: string): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to, subject, text }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body}`);
  try {
    return JSON.parse(body).id ?? "";
  } catch {
    return "";
  }
}

async function dueFor(kind: Kind, today: string): Promise<Booking[]> {
  const s = SCHEDULE[kind];
  const statuses = INCLUDE_NEW_WITH_DRIVER ? [...ELIGIBLE_STATUSES, "new"] : ELIGIBLE_STATUSES;
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_COLS)
    .gte("event_date", minusDays(today, s.maxDay))
    .lte("event_date", minusDays(today, s.minDay))
    .in("status", statuses)
    .is(s.sentCol, null)
    .order("event_date");
  if (error) throw error;
  return ((data ?? []) as unknown as Booking[]).filter((b) => {
    if (!isEligibleStatus(b)) return false;
    if (!(b.customer_email ?? "").trim()) return false;
    switch (kind) {
      case "review":
        return !b.reviewed_at;
      case "photo":
        return !b.photos_received_at;
      case "review_reminder":
        return !!b.review_email_sent_at &&
          daysSince(b.review_email_sent_at, today) >= REVIEW_REMINDER_MIN_GAP_DAYS &&
          (!REMINDER_CUTOVER || b.review_email_sent_at >= REMINDER_CUTOVER) &&
          !b.reviewed_at && !b.replied_at;
      case "photo_reminder":
        return !!b.photo_email_sent_at &&
          daysSince(b.photo_email_sent_at, today) >= PHOTO_REMINDER_MIN_GAP_DAYS &&
          (!REMINDER_CUTOVER || b.photo_email_sent_at >= REMINDER_CUTOVER) &&
          !b.photos_received_at && !b.replied_at;
    }
  });
}

// ---------- auth ----------

async function isAuthorized(req: Request): Promise<boolean> {
  const provided = req.headers.get("x-cron-secret");
  if (!provided) return false;
  const { data, error } = await supabase.rpc("verify_followups_cron_secret", { candidate: provided });
  if (error) {
    console.error("send-followups-next auth check failed:", error.message);
    return false;
  }
  return data === true;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });
}

// ---------- modes ----------

const ALL_KINDS: Kind[] = ["review", "review_reminder", "photo", "photo_reminder"];

async function sampleBooking(bookingId: string | null) {
  if (!bookingId) {
    return { source: "built-in sample", customer_name: "ameena sample", event_type: "Wedding ", cars: { name: "Phyllis" } };
  }
  // Only name / event type / car are read. The customer's email is never selected.
  const { data, error } = await supabase
    .from("bookings")
    .select("customer_name, event_type, cars(name)")
    .eq("id", bookingId)
    .single();
  if (error) throw error;
  return { source: `booking ${bookingId}`, ...(data as unknown as Pick<Booking, "customer_name" | "event_type" | "cars">) };
}

function testRenders(sample: Pick<Booking, "customer_name" | "event_type" | "cars">) {
  const v = varsFor(sample);
  const noCar = varsFor({ ...sample, cars: null });
  return [
    ...ALL_KINDS.map((k) => ({ kind: k, variant: "with car", ...render(k, v) })),
    { kind: "photo" as Kind, variant: "no-car fallback", ...render("photo", noCar) },
  ];
}

async function runLive(today: string) {
  const out = { today, sent: [] as { kind: Kind; booking_id: string }[], errors: [] as string[] };
  const kinds = ALL_KINDS.filter((k) => REMINDERS_ENABLED || !k.endsWith("_reminder"));
  for (const kind of kinds) {
    for (const b of await dueFor(kind, today)) {
      try {
        const tpl = render(kind, varsFor(b));
        await sendViaResend(b.customer_email!.trim(), tpl.subject, tpl.text, `${kind}-${b.id}`);
        const { error } = await supabase
          .from("bookings")
          .update({ [SCHEDULE[kind].sentCol]: new Date().toISOString() })
          .eq("id", b.id);
        if (error) throw error;
        out.sent.push({ kind, booking_id: b.id });
        await sleep(600);
      } catch (e) {
        out.errors.push(`${kind} booking ${b.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return out;
}

// ---------- main ----------

Deno.serve(async (req) => {
  if (!(await isAuthorized(req))) return json({ error: "unauthorized" }, 401);

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "dry_run";
    const asOf = url.searchParams.get("as_of");
    const today = asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : chicagoToday();

    if (mode === "preview" || mode === "test") {
      const sample = await sampleBooking(url.searchParams.get("booking_id"));
      const renders = testRenders(sample);
      if (mode === "preview") return json({ mode, sample_source: sample.source, from: FROM, reply_to: REPLY_TO, emails: renders });

      const results = [] as { subject: string; variant: string; resend_id?: string; error?: string }[];
      for (const r of renders) {
        const subject = `[TEST] ${r.subject}`;
        try {
          const id = await sendViaResend(TEST_TO, subject, r.text);
          results.push({ subject, variant: r.variant, resend_id: id });
        } catch (e) {
          results.push({ subject, variant: r.variant, error: e instanceof Error ? e.message : String(e) });
        }
        await sleep(600);
      }
      console.log("send-followups-next test:", JSON.stringify(results));
      return json({ mode, to: TEST_TO, sample_source: sample.source, sent_at: new Date().toISOString(), results });
    }

    if (mode === "dry_run") {
      const due: Record<string, unknown[]> = {};
      for (const k of ALL_KINDS) {
        due[k] = (await dueFor(k, today)).map((b) => {
          const v = varsFor(b);
          return { booking_id: b.id, event_date: b.event_date, status: b.status, first: v.first, car: v.car, occasion: v.occasion, subject: render(k, v).subject };
        });
      }
      return json({ mode, today, live_enabled: LIVE_ENABLED, reminders_enabled: REMINDERS_ENABLED, include_new_with_driver: INCLUDE_NEW_WITH_DRIVER, reminder_cutover: REMINDER_CUTOVER, due });
    }

    if (mode === "live") {
      if (!LIVE_ENABLED) return json({ error: "live mode disabled (test build)" }, 403);
      const out = await runLive(today);
      console.log("send-followups-next live:", JSON.stringify(out));
      return json(out);
    }

    return json({ error: `unknown mode ${mode}` }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("send-followups-next failed:", msg);
    return json({ fatal: msg }, 500);
  }
});
