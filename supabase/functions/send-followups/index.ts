// ============================================================
// CHANCE CLASSICS — send-followups Edge Function
//
// Runs daily (triggered by pg_cron). Two jobs:
//   1. REVIEW email  → bookings whose event_date was YESTERDAY
//   2. PHOTO email   → bookings whose event_date was ~60 days ago
//
// NEW: optional query-string overrides let you manually backfill a
// specific date range (e.g. after an outage) WITHOUT changing the
// daily cron's normal behavior. The cron call has no params, so it
// always uses the standard rolling window. Example one-off backfill:
//   POST .../send-followups?review_from=2026-08-03&review_to=2026-08-03
//
// Deploy:
//   supabase functions deploy send-followups --no-verify-jwt=false
//
// Required secrets (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY   (you already have this set for other functions)
//   FROM_EMAIL       (same secret as send-notification; display name stays Chance Classics)
//
// ⚠️ SCHEMA ASSUMPTIONS — adjust the select() strings + field names
// below if your columns differ (see notes in 1-followups-setup.sql):
//   rental.bookings: id, customer_name, customer_email, event_date,
//                    status, car_id, review_email_sent_at, photo_email_sent_at
//   rental.cars:     id, name
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { DEFAULT_FROM_EMAIL, htmlToPlainText } from "../_shared/email-plain.mjs";

const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? DEFAULT_FROM_EMAIL;
const REPLY_TO = "chanceclassics@gmail.com";
const REVIEW_LINK = "https://g.page/r/CagTWW5ZROCWEAE/review";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { db: { schema: "rental" } },
);

// ---------- email templates ----------

function firstName(full: string | null): string {
  return (full ?? "").trim().split(/\s+/)[0] || "there";
}

function reviewEmail(name: string, carName: string | null) {
  const carLine = carName ? ` Hope ${carName} made it even more memorable!` : "";
  const carMention = carName
    ? ` If you feel like mentioning that you rode in ${carName} and what the occasion was, that helps other folks searching for the same thing.`
    : "";
  return {
    subject: "It was an honor to be part of your day! 🚗",
    html: `
      <div style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#222;max-width:560px;margin:0 auto;">
        <p>Hey ${name},</p>
        <p>It's Tim Chance with Chance Classics. It was an honor being part of your special day —${carLine}</p>
        <p>If you have 30 seconds, a Google review would mean the world to us. It's the #1 way other couples and families find us:</p>
        <p style="text-align:center;margin:28px 0;">
          <a href="${REVIEW_LINK}"
             style="background:#1a3c34;color:#fff;text-decoration:none;padding:14px 28px;border-radius:6px;font-family:Arial,sans-serif;font-size:16px;">
            Leave us a Google review
          </a>
        </p>
        <p>${carMention}</p>
        <p>Thanks so much!</p>
        <p>Tim Chance<br>Chance Classics<br>(318) 344-5001</p>
        <p style="font-size:12px;color:#888;">P.S. If you've already left us a review — thank you!</p>
      </div>`,
  };
}

function photoEmail(name: string, carName: string | null) {
  const car = carName ? ` with ${carName}` : " with the car";
  return {
    subject: "Got any great photos" + (carName ? ` with ${carName}?` : " with the car?"),
    html: `
      <div style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#222;max-width:560px;margin:0 auto;">
        <p>Hey ${name},</p>
        <p>Tim Chance with Chance Classics again — hope y'all are doing well!</p>
        <p>If you've gotten your photos back and there are any good ones${car}, we'd love a few to share on our website and social media. Real event photos are the best way for us to show future couples what their day could look like.</p>
        <p>You can simply reply to this email with your favorites, or text them to (318) 344-5001.</p>
        <p>Thanks again for letting us be part of your day!</p>
        <p>Tim Chance<br>Chance Classics</p>
        <p style="font-size:12px;color:#888;">P.S. If you've already sent us pictures — thank you so much!</p>
      </div>`,
  };
}

// ---------- helpers ----------

async function sendViaResend(to: string, subject: string, html: string) {
  const plain = htmlToPlainText(html) || subject;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
    },
    body: JSON.stringify({
      from: `Chance Classics <${FROM_EMAIL}>`,
      reply_to: REPLY_TO,
      to,
      subject,
      html,
      text: plain,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

type Booking = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  event_date: string;
  status: string | null;
  cars: { name: string | null } | null;
};

async function processBatch(
  bookings: Booking[],
  kind: "review" | "photo",
): Promise<{ sent: number; errors: string[] }> {
  let sent = 0;
  const errors: string[] = [];
  for (const b of bookings) {
    if (!b.customer_email) continue;
    try {
      const name = firstName(b.customer_name);
      const carName = b.cars?.name ?? null;
      const tpl = kind === "review" ? reviewEmail(name, carName) : photoEmail(name, carName);
      await sendViaResend(b.customer_email, tpl.subject, tpl.html);

      const col = kind === "review" ? "review_email_sent_at" : "photo_email_sent_at";
      const { error } = await supabase
        .from("bookings")
        .update({ [col]: new Date().toISOString() })
        .eq("id", b.id);
      if (error) throw error;
      sent++;
    } catch (e) {
      errors.push(`${kind} booking ${b.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { sent, errors };
}

// ---------- auth ----------
// Caller must send the shared secret (Supabase Vault: "followups_cron_secret")
// in the x-cron-secret header. The comparison happens inside Postgres via the
// SECURITY DEFINER RPC rental.verify_followups_cron_secret (service_role only),
// so the expected value never leaves the database. Fails closed on any error.
async function isAuthorized(req: Request): Promise<boolean> {
  const provided = req.headers.get("x-cron-secret");
  if (!provided) return false;
  const { data, error } = await supabase.rpc("verify_followups_cron_secret", { candidate: provided });
  if (error) {
    console.error("send-followups auth check failed:", error.message);
    return false;
  }
  return data === true;
}

// ---------- main ----------

Deno.serve(async (req) => {
  if (!(await isAuthorized(req))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results = { reviews_sent: 0, photos_sent: 0, errors: [] as string[] };

  try {
    const url = new URL(req.url);
    // Optional manual overrides for one-time backfills. If absent, falls
    // back to the standard rolling window used by the daily cron job.
    const reviewFrom = url.searchParams.get("review_from") ?? dateNDaysAgo(5);
    const reviewTo = url.searchParams.get("review_to") ?? dateNDaysAgo(4);
    const photoFrom = url.searchParams.get("photo_from") ?? dateNDaysAgo(65);
    const photoTo = url.searchParams.get("photo_to") ?? dateNDaysAgo(60);

    // JOB 1: review emails
    const { data: reviewDue, error: e1 } = await supabase
      .from("bookings")
      .select("id, customer_name, customer_email, event_date, status, cars(name)")
      .gte("event_date", reviewFrom)
      .lte("event_date", reviewTo)
      .is("review_email_sent_at", null)
      .neq("status", "cancelled");
    if (e1) throw e1;

    const r1 = await processBatch((reviewDue ?? []) as unknown as Booking[], "review");
    results.reviews_sent = r1.sent;
    results.errors.push(...r1.errors);

    // JOB 2: photo emails
    const { data: photoDue, error: e2 } = await supabase
      .from("bookings")
      .select("id, customer_name, customer_email, event_date, status, cars(name)")
      .gte("event_date", photoFrom)
      .lte("event_date", photoTo)
      .is("photo_email_sent_at", null)
      .neq("status", "cancelled");
    if (e2) throw e2;

    const r2 = await processBatch((photoDue ?? []) as unknown as Booking[], "photo");
    results.photos_sent = r2.sent;
    results.errors.push(...r2.errors);

    console.log("send-followups complete:", JSON.stringify({ ...results, reviewFrom, reviewTo, photoFrom, photoTo }));
    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("send-followups failed:", msg, JSON.stringify(results));
    return new Response(JSON.stringify({ ...results, fatal: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
