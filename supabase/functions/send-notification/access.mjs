// Who may call send-notification. Plain JS so node tests and the edge
// function share one rule. The edge function still checks the session and,
// for a driver offer, that the recipient is on the driver roster.

export const DRIVER_NOTIFY_TYPES = ["claimed", "passed", "offer"];

export function roleTokens(role) {
  return String(role ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function secretMatches(expected, provided) {
  const a = String(expected ?? "");
  const b = String(provided ?? "");
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// secretOk: server job sent x-notify-secret.
// roles: tokens from rental.profiles.role for a signed-in user.
// Admin can send every type. A driver can send only the emails the garage
// app already sends from a driver session (claim, pass, and the next-driver offer).
export function allowNotify({ secretOk, roles, type }) {
  if (secretOk) return { ok: true, via: "secret" };
  const list = Array.isArray(roles) ? roles.map((r) => String(r).trim().toLowerCase()) : roleTokens(roles);
  if (list.includes("admin")) return { ok: true, via: "admin" };
  if (list.includes("driver") && DRIVER_NOTIFY_TYPES.includes(type)) return { ok: true, via: "driver" };
  return { ok: false, via: "denied" };
}
