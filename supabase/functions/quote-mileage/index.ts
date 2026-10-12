// ============================================================
// Chance Classics — Quote mileage lookup (Supabase Edge Function)
// The garage quote builder sends the pickup address. This returns
// one-way driving miles from 118 5th St E, Benton, LA and the fee:
// 30 miles or less is $0; farther than that is trailered at $3 per
// mile for the full distance, from mile one. Same Google Routes
// Distance Matrix call as the website (site/lib/mileage.ts).
//
// Auth (verify_jwt stays OFF at the gateway):
//   - Signed-in garage admin: Authorization: Bearer <session access token>
// Drivers, mechanics, and anonymous callers are denied. There is no
// shared secret: this call spends the Maps key.
//
// Deploy: supabase functions deploy quote-mileage --project-ref ldhmwuhhejaabsvcyzdo
//   Settings -> leave "Verify JWT" OFF.
//   Secret: GOOGLE_MAPS_API_KEY (the same key the website uses)
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { allowQuoteMileage, roleTokens } from "./access.mjs";
import { quoteDrivingMileage } from "../_shared/mileage.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function bearerToken(req: Request): string {
  const header = req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : "";
}

async function authorize(req: Request): Promise<boolean> {
  const token = bearerToken(req);
  if (!token || !SUPABASE_URL || !SERVICE_KEY) return false;

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "rental" },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return false;

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || !profile) return false;

  return allowQuoteMileage({ roles: roleTokens(profile.role) }).ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (new URL(req.url).searchParams.has("secret")) {
      console.log("quote-mileage: ignored secret in the query string");
    }
    if (req.method !== "POST") return json(405, { error: "method not allowed" });
    if (!(await authorize(req))) return json(401, { error: "unauthorized" });

    const body = await req.json().catch(() => ({}));
    const pickup = String(body.pickup ?? body.address ?? "").slice(0, 300);
    const pickupPlaceId = String(body.pickupPlaceId ?? "").slice(0, 300);
    const quote = await quoteDrivingMileage(
      { pickup, pickupPlaceId },
      { apiKey: Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "" },
    );
    return json(200, quote);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("quote-mileage error:", message);
    return json(500, { error: "mileage lookup failed" });
  }
});
