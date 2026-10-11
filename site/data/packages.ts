/**
 * Wedding package and trust lines. Cards and extra promises stay hidden
 * while enabled is false or the text/price is empty.
 *
 * Chauffeur, the $100 extra hour, the $250 deposit, and published starting
 * prices are the service listings in site/data/services.json.
 * The 2-hour gap is BOOKING_BUFFER_HOURS in site/lib/booking-rules.ts
 * (same rule as lib/quotes.mjs).
 * Family names are the About page. Eric maintains the fleet (About).
 * The shop name is the 2ndchancespeedshop.com address on scheduled-tasks.
 * Tim, 2026-10-11: weddings stay on hourly pricing, so the package card
 * stays off. Ribbons and a Just Married sign stay off. A second car is
 * the same hourly rate as the main car, stored as a note. If the booked
 * car is unavailable, a comparable backup is offered. Insurance stays off.
 * Tim has Hagerty liability and collision only, not for-hire coverage.
 */

export type PackageInclusion = {
  id: string;
  label: string;
  /** False items do not render, even when the package card is on. */
  included: boolean;
};

export const weddingPackage = {
  /** Off. Tim is keeping hourly pricing because weddings vary. */
  enabled: false,
  title: "Weddings",
  priceUsd: null as number | null,
  /** Hours the car is on site for this package. Empty hides the line. */
  hoursOnSite: null as number | null,
  /** Getaway or photo-time sentence. Empty hides the line. */
  framing: "",
  inclusions: [
    {
      id: "chauffeur",
      label: "A chauffeur is included. You don’t drive.",
      included: true,
    },
    { id: "ribbons", label: "Ribbons or a bow", included: false },
    { id: "just-married", label: "A “Just Married” sign", included: false },
  ] satisfies PackageInclusion[],
};

export const secondCarAddon = {
  /** Tim, 2026-10-11. Same hourly rate as the car being booked. No separate price. */
  enabled: true,
  title: "Second car for parents or grandparents",
  priceUsd: null as number | null,
  priceLabel: "same hourly rate as your main car",
  /** Appended to the existing details/notes text. No new database column. */
  notesLine: "Second car requested for parents or grandparents, at the same hourly rate as the main car.",
};

export function secondCarPriceText() {
  const label = secondCarAddon.priceLabel.trim();
  if (label) return label;
  if (secondCarAddon.priceUsd == null) return "Ask for a quote";
  return `$${secondCarAddon.priceUsd}`;
}

export function withSecondCarNote(details: string, requested: boolean) {
  if (!requested || !secondCarAddon.enabled) return details;
  const line = secondCarAddon.notesLine;
  if (!line || details.includes(line)) return details;
  return [details.trim(), line].filter(Boolean).join("\n");
}

export const whyBook = {
  points: [
    "A chauffeur is included. You never drive.",
    "The cars are maintained in our own shop, 2nd Chance Speed Shop.",
    "We keep a 2-hour buffer before and after each booking, so your car is not coming straight from another event.",
    "Family owned and operated by Tim Chance, Carl Chance, and Eric Edwards.",
    "Starting prices are published, and you can book online.",
  ],
  backupCar: {
    enabled: true,
    text: "If the car you booked isn't available, we'll provide a comparable backup.",
  },
  forHireInsurance: { enabled: false, text: "" },
};

export function whyBookLines() {
  const extra = [whyBook.backupCar, whyBook.forHireInsurance]
    .filter((item) => item.enabled && item.text.trim())
    .map((item) => item.text.trim());
  return [...whyBook.points, ...extra];
}
