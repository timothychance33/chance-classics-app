import { createClient } from "@supabase/supabase-js";

function secretMatches(expected: string, provided: string) {
  const a = String(expected || "");
  const b = String(provided || "");
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bearer(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : "";
}

function roleTokens(role: unknown) {
  return String(role || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

/** Owner session, or a server secret. The Stripe key never leaves this route. */
export async function authorizeCharge(request: Request) {
  const chargeSecret = process.env.CHARGE_SECRET || process.env.NOTIFY_SECRET || "";
  if (secretMatches(chargeSecret, request.headers.get("x-charge-secret") || "")) return true;
  const token = bearer(request);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (secretMatches(serviceKey, token)) return true;
  const url = process.env.SUPABASE_URL || "";
  if (!token || !url || !serviceKey) return false;
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "rental" },
  });
  const user = await db.auth.getUser(token);
  if (user.error || !user.data.user) return false;
  const profile = await db.from("profiles").select("role").eq("id", user.data.user.id).maybeSingle();
  if (profile.error || !profile.data) return false;
  return roleTokens(profile.data.role).includes("admin");
}

const CHARGE_ORIGINS = new Set([
  "https://app.chanceclassics.com",
  "https://www.chanceclassics.com",
  "https://chanceclassics.com",
]);

export function chargeCors(request: Request) {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-charge-secret");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");
  const origin = request.headers.get("origin") || "";
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  if (CHARGE_ORIGINS.has(origin) || local) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}
