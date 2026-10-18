// ============================================================
// Chance Classics — Claim Booking (Supabase Edge Function)
// A signed-in driver claims the offer that is currently theirs.
// Refuses the claim when they already have a non-cancelled booking
// whose window overlaps, including the 2-hour availability buffer.
//
// Auth (verify_jwt stays OFF at the gateway):
//   Authorization: Bearer <session access token>
//   The token's email must match an active driver on rental.staff.
//   There is no URL secret and no admin override. Owner assignment
//   stays a direct bookings update with assigned_by = 'owner'.
//
// Deploy: supabase functions deploy claim-booking --project-ref ldhmwuhhejaabsvcyzdo
//   Settings -> leave "Verify JWT" OFF.
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  DRIVER_BUSY_MESSAGE,
  busyOfferAdvances,
  claimDecision,
} from "../_shared/driver-availability.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function bearerToken(req: Request): string {
  const header = req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : "";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function busyMessage(error: { message?: string } | null) {
  const message = String(error?.message || "");
  return /already have a booking/i.test(message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (new URL(req.url).searchParams.has("secret")) {
      console.log("claim-booking: ignored secret in the query string");
    }
    if (req.method !== "POST") return json({ error: "POST required" }, 405);

    const token = bearerToken(req);
    if (!token || !SUPABASE_URL || !SERVICE_KEY) return json({ error: "unauthorized" }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "rental" },
    });
    const { data: userData, error: userError } = await sb.auth.getUser(token);
    if (userError || !userData?.user?.email) return json({ error: "unauthorized" }, 401);

    const email = userData.user.email.trim().toLowerCase();
    const body = await req.json().catch(() => ({}));
    const bookingId = String(body?.booking_id || body?.id || "").trim();
    if (!bookingId) return json({ error: "booking_id required" }, 400);

    const { data: staffRows, error: staffError } = await sb.from("staff").select("*");
    if (staffError) throw staffError;
    const me = (staffRows || []).find((row: { email?: string | null; role?: string | null; active?: boolean | null }) =>
      String(row.email || "").trim().toLowerCase() === email &&
      String(row.role || "").split(",").map((part) => part.trim()).includes("driver") &&
      row.active
    );
    if (!me) return json({ error: "No crew record linked to your login" }, 403);

    const { data: booking, error: bookingError } = await sb.from("bookings").select("*").eq("id", bookingId).maybeSingle();
    if (bookingError) throw bookingError;

    const { data: assigned, error: assignedError } = await sb.from("bookings")
      .select("id,driver_id,event_date,start_time,end_time,status")
      .eq("driver_id", me.id)
      .neq("status", "cancelled");
    if (assignedError) throw assignedError;

    const decision = claimDecision({ me, booking, bookings: assigned || [] });
    if (!decision.ok) return json({ error: decision.error }, decision.status);

    const { data: claimed, error: claimError } = await sb.from("bookings").update({
      driver_id: me.id,
      offer_rank: null,
      open_to_all: false,
      assigned_by: "claim",
    }).eq("id", bookingId).is("driver_id", null).select("id");
    if (claimError) {
      if (busyMessage(claimError)) return json({ error: DRIVER_BUSY_MESSAGE }, 409);
      throw claimError;
    }
    if (!claimed?.length) return json({ error: "This booking is already claimed" }, 409);

    const { data: assignedNow, error: nowError } = await sb.from("bookings")
      .select("id,driver_id,event_date,start_time,end_time,status")
      .not("driver_id", "is", null)
      .neq("status", "cancelled");
    if (nowError) throw nowError;
    const { data: openOffers, error: openError } = await sb.from("bookings")
      .select("id,driver_id,event_date,start_time,end_time,status,offer_rank,passed_by,open_to_all,needs_trailer,pay_tier")
      .is("driver_id", null)
      .not("offer_rank", "is", null)
      .neq("status", "cancelled");
    if (openError) throw openError;

    const advances = busyOfferAdvances(staffRows || [], me, openOffers || [], assignedNow || []);
    const advanced = [];
    const offeredAt = new Date().toISOString();
    for (const row of advances) {
      const { data: moved, error: moveError } = await sb.from("bookings").update({
        passed_by: row.passed_by,
        offer_rank: row.offer_rank,
        offered_at: row.offer_rank != null ? offeredAt : null,
        offer_warned: false,
      }).eq("id", row.id).is("driver_id", null).eq("offer_rank", me.priority).select("id,offer_rank,passed_by");
      if (moveError) {
        console.error("claim-booking advance failed", row.id, moveError.message);
        continue;
      }
      if (moved?.length) advanced.push(moved[0]);
    }

    return json({ ok: true, advanced });
  } catch (e) {
    console.error("claim-booking error:", e);
    const message = String((e as { message?: string })?.message ?? e);
    if (/already have a booking/i.test(message)) return json({ error: DRIVER_BUSY_MESSAGE }, 409);
    return json({ error: message }, 500);
  }
});
