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

export type ChargeAuth =
  | { ok: true }
  | { ok: false; status: number; error: string };

const OWNER_AUTH_ERROR = "Sign in as the owner to charge a card or send a pay link.";

function failureText(error: unknown) {
  if (error instanceof Error) {
    const message = error.message ? `${error.name}: ${error.message}` : error.name;
    return message.slice(0, 300);
  }
  return "The charge request failed.";
}

/** Three dot-separated segments. A device session or opaque secret is not this. */
function isAccessJwt(token: string) {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

/**
 * Owner session, or a server secret. The Stripe key never leaves this route.
 * The garage sends the Supabase Auth access token from getSession(), which is
 * a JWT. auth.getUser rejects a bad JWT as an error; a non-Auth throw (or a
 * token that is not a JWT at all) used to escape this function and become a
 * non-JSON 500 without CORS headers.
 */
export async function authorizeCharge(request: Request): Promise<ChargeAuth> {
  try {
    const chargeSecret = process.env.CHARGE_SECRET || process.env.NOTIFY_SECRET || "";
    if (secretMatches(chargeSecret, request.headers.get("x-charge-secret") || "")) return { ok: true };
    const token = bearer(request);
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (secretMatches(serviceKey, token)) return { ok: true };
    const url = process.env.SUPABASE_URL || "";
    if (!token || !url || !serviceKey) {
      console.error("authorizeCharge: missing token or Supabase env", {
        hasToken: Boolean(token),
        hasUrl: Boolean(url),
        hasServiceKey: Boolean(serviceKey),
      });
      return { ok: false, status: 401, error: OWNER_AUTH_ERROR };
    }
    if (!isAccessJwt(token)) {
      console.error("authorizeCharge: bearer is not a Supabase access token", { tokenLength: token.length });
      return { ok: false, status: 401, error: "The session token is not a Supabase access token." };
    }
    const db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "rental" },
    });
    const user = await db.auth.getUser(token);
    if (user.error || !user.data.user) {
      console.error("authorizeCharge: getUser rejected", user.error?.message || "no user");
      return { ok: false, status: 401, error: OWNER_AUTH_ERROR };
    }
    const profile = await db.from("profiles").select("role").eq("id", user.data.user.id).maybeSingle();
    if (profile.error || !profile.data) {
      console.error("authorizeCharge: profile lookup failed", profile.error?.message || "no profile");
      return { ok: false, status: 401, error: OWNER_AUTH_ERROR };
    }
    if (!roleTokens(profile.data.role).includes("admin")) {
      console.error("authorizeCharge: signed-in user is not an admin");
      return { ok: false, status: 401, error: OWNER_AUTH_ERROR };
    }
    return { ok: true };
  } catch (error) {
    console.error("authorizeCharge failed", error);
    return { ok: false, status: 500, error: failureText(error) };
  }
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
