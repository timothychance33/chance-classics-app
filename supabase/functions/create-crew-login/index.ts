// ============================================================
// Chance Classics — Create Crew Login (Supabase Edge Function)
// Called by the app when an admin saves a crew member. Creates a
// Supabase Auth login (default password ChanceClassics1) if one
// doesn't already exist for that email, and ensures a profile row.
//
// Auth (verify_jwt stays OFF at the gateway):
//   - Signed-in garage admin: Authorization: Bearer <session access token>
//   - Server jobs: header x-crew-admin-secret: <CREW_ADMIN_SECRET>
// The secret is not read from the query string. An empty secret does
// not authorize. Drivers and mechanics are denied.
// Gateway Verify JWT stays OFF because a secret-only caller has no user JWT.
//
// Deploy: supabase functions deploy create-crew-login --project-ref ldhmwuhhejaabsvcyzdo
//   Settings -> leave "Verify JWT" OFF.
//   Secret: CREW_ADMIN_SECRET
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Based on live version 6. The supabase-js import uses the npm: specifier
// so a repo deploy bundles the same way send-notification v23 does.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { allowCrewLogin, roleTokens, secretMatches } from "./access.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_SECRET = Deno.env.get("CREW_ADMIN_SECRET") ?? "";
const DEFAULT_PW = "ChanceClassics1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-crew-admin-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function bearerToken(req: Request): string {
  const header = req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : "";
}

async function authorize(req: Request): Promise<boolean> {
  if (secretMatches(ADMIN_SECRET, req.headers.get("x-crew-admin-secret") || "")) return true;

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

  return allowCrewLogin({ secretOk: false, roles: roleTokens(profile.role) }).ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (new URL(req.url).searchParams.has("secret")) {
      console.log("create-crew-login: ignored secret in the query string");
    }
    if (!(await authorize(req))) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.full_name ?? "").trim() || email;
    const role = String(body.role ?? "driver").trim() || "driver";
    if (!email) {
      return new Response(JSON.stringify({ error: "email required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: "rental" },
    });

    // 1) Does a login already exist for this email?
    let userId: string | null = null;
    let created = false;
    // listUsers is paginated; search a reasonable range.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
    if (existing) {
      userId = existing.id;
    } else {
      // 2) Create the login with the default password.
      const { data: made, error: cErr } = await admin.auth.admin.createUser({
        email,
        password: DEFAULT_PW,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (cErr) throw cErr;
      userId = made.user?.id ?? null;
      created = true;
    }
    if (!userId) throw new Error("could not resolve user id");

    // 3) Ensure a profile row. New logins must change pw; existing keep theirs.
    const { data: prof } = await admin.from("profiles").select("id,must_change_pw").eq("id", userId).maybeSingle();
    if (!prof) {
      await admin.from("profiles").insert({
        id: userId, full_name: fullName, role,
        must_change_pw: created,   // force change only for brand-new logins
      });
    } else {
      // keep their password status; just make sure the role is current
      await admin.from("profiles").update({ role, full_name: fullName }).eq("id", userId);
    }

    return new Response(JSON.stringify({ ok: true, created, linked: !created, user_id: userId }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("create-crew-login error:", e);
    return new Response(JSON.stringify({ error: String((e as { message?: string })?.message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
