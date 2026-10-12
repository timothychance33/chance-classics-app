// Who may look up quote mileage. Plain JS so node tests and the edge
// function share one rule. The edge function still checks the session.

export function roleTokens(role) {
  return String(role ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

// roles: tokens from rental.profiles.role for a signed-in user.
// Only an admin (the garage owner) may look up a pickup distance.
export function allowQuoteMileage({ roles }) {
  const list = Array.isArray(roles) ? roles.map((r) => String(r).trim().toLowerCase()) : roleTokens(roles);
  if (list.includes("admin")) return { ok: true, via: "admin" };
  return { ok: false, via: "denied" };
}
