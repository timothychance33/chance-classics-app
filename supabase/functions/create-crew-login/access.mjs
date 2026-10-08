// Who may call create-crew-login. Plain JS so node tests and the edge
// function share one rule. The edge function still checks the session.

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

// secretOk: server job sent x-crew-admin-secret.
// roles: tokens from rental.profiles.role for a signed-in user.
// Only an admin may create or link a crew login.
export function allowCrewLogin({ secretOk, roles }) {
  if (secretOk) return { ok: true, via: "secret" };
  const list = Array.isArray(roles) ? roles.map((r) => String(r).trim().toLowerCase()) : roleTokens(roles);
  if (list.includes("admin")) return { ok: true, via: "admin" };
  return { ok: false, via: "denied" };
}
