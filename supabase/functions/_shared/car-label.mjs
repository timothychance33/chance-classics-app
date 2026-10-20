// Public car label. Same year / make / model as carIdentity() in site/data/carFacts.ts.
// Phyllis is always "1941 Buick Super", even when rental.cars.model still says "Super 56C".
// Tests compare this map to site/data/carFacts.ts so the two cannot drift.

export const CANONICAL_CAR_LABELS = {
  Bonnie: "1937 Cadillac Fleetwood Series 75",
  Phyllis: "1941 Buick Super",
  "Black Betty": "1950 Ford Custom Deluxe",
  Patsy: "1953 Packard Patrician Limousine",
  Elsa: "1954 Packard Caribbean",
  Veronica: "1957 Chevrolet Bel Air",
  Rosie: "1960 Chevrolet Corvette",
  Brenda: "1961 Buick Invicta",
  Sylvia: "1970 Chevrolet Chevelle SS454",
  Carmen: "1976 Cadillac Eldorado",
};

export function canonicalCarLabel(name) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return "";
  const hit = Object.entries(CANONICAL_CAR_LABELS).find(([car]) => car.toLowerCase() === key);
  return hit ? hit[1] : "";
}

function fallbackLabel(car) {
  return [car?.year, car?.make, car?.model]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Phyllis — 1941 Buick Super". Nickname plus the site label. */
export function carLabelFor(car) {
  const name = String(car?.name || "").trim();
  const label = canonicalCarLabel(name) || fallbackLabel(car);
  if (name && label) return `${name} — ${label}`;
  return name || label;
}
