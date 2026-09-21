// ============================================================
// Chance Classics — Quote Request Capture (Supabase Edge Function)
// Receives the Wix "Price Quote" form submission, saves it to
// rental.quote_requests, then emails the owner via Resend.
//
// Webhook auth: WIX_SYNC_SECRET, sent as ?secret= or x-secret.
// There is no in-source fallback. Verify JWT must stay OFF — Wix
// does not send a user JWT. The shared secret is the auth check.
//
// Owner mail uses the same project secrets as send-notification:
//   RESEND_API_KEY, OWNER_EMAIL, FROM_EMAIL, APP_URL
// The customer is not emailed.
//
// Deploy only this function (do not deploy every function in this repo):
//   supabase functions deploy quote-capture --no-verify-jwt --project-ref ldhmwuhhejaabsvcyzdo
// Set WIX_SYNC_SECRET first, to the secret the Wix automation already sends.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  matchCar,
  ownerQuoteRequestHtml,
  ownerQuoteRequestSubject,
  quoteFromWixPayload,
  webhookAuthorized,
} from "../_shared/owner-quote-email.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("WIX_SYNC_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") ?? "chanceclassics@gmail.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@chanceclassics.com";
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.chanceclassics.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function errText(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Chance Classics <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Resend ${r.status}: ${t}`);
  }
  return await r.json();
}

async function emailOwner(quote: Record<string, unknown>) {
  const subject = ownerQuoteRequestSubject(quote);
  const html = ownerQuoteRequestHtml(quote, APP_URL);
  // Owner alert only. Do not pass customer_email as the recipient.
  await sendEmail(OWNER_EMAIL, subject, html);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const provided = req.headers.get("x-secret") || url.searchParams.get("secret") || "";
    if (!webhookAuthorized(SECRET, provided)) return json(401, { error: "unauthorized" });

    const body = await req.json().catch(() => ({}));
    const parsed = quoteFromWixPayload(body);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: "rental" } });

    let car_id: string | null = null;
    let car_name: string | null = null;
    if (parsed.service_name) {
      const { data: cars } = await sb.from("cars").select("id,name");
      const hit = matchCar(parsed.service_name, cars);
      if (hit) {
        car_id = hit.id ?? null;
        car_name = hit.name ?? null;
      }
    }

    const rec = {
      customer_name: parsed.customer_name,
      customer_email: parsed.customer_email,
      customer_phone: parsed.customer_phone,
      service_name: parsed.service_name,
      car_id,
      event_type: parsed.event_type,
      event_date: parsed.event_date,
      event_time: parsed.event_time,
      event_location: parsed.event_location,
      details: parsed.details,
      planner: parsed.planner,
      status: "new",
    };
    const { data, error } = await sb.from("quote_requests").insert(rec).select().single();
    if (error) throw error;

    let owner_notified = false;
    try {
      await emailOwner({
        customer_name: parsed.customer_name,
        customer_email: parsed.customer_email,
        customer_phone: parsed.customer_phone,
        service_name: parsed.service_name,
        car_name,
        event_type: parsed.event_type,
        event_date: parsed.event_date,
        event_time: parsed.event_time,
        event_date_raw: parsed.event_date_raw,
        event_location: parsed.event_location,
        details: parsed.details,
        planner: parsed.planner,
      });
      owner_notified = true;
    } catch (notifyErr) {
      console.error("quote-capture owner notify failed:", errText(notifyErr));
    }

    return json(200, { ok: true, id: data?.id, car_matched: !!car_id, owner_notified });
  } catch (e) {
    console.error("quote-capture error:", errText(e));
    return json(500, { error: errText(e) });
  }
});
