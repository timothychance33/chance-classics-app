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
 * Ribbons, a Just Married sign, package hours, and package price are not
 * in those sources. The blog says decorations are allowed and the client
 * brings them. Backup-car and for-hire insurance stay off until Tim confirms.
 */

export type PackageInclusion = {
  id: string;
  label: string;
  /** False items do not render, even when the package card is on. */
  included: boolean;
};

export const weddingPackage = {
  /** Turn on only after Tim sets the price and confirms what is included. */
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
  /** Hidden, and ignored by quote and booking saves, until Tim turns this on. */
  enabled: false,
  title: "Second car for parents or grandparents",
  priceUsd: null as number | null,
  /** Appended to the existing details/notes text. No new database column. */
  notesLine: "Second car requested for parents or grandparents.",
};

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
  backupCar: { enabled: false, text: "" },
  forHireInsurance: { enabled: false, text: "" },
};

export function whyBookLines() {
  const extra = [whyBook.backupCar, whyBook.forHireInsurance]
    .filter((item) => item.enabled && item.text.trim())
    .map((item) => item.text.trim());
  return [...whyBook.points, ...extra];
}
