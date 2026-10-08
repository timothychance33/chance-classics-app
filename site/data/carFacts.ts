/**
 * Public facts for each car. An empty string or null must not render.
 * Do not fill a field from a photo, a model-year guess, or a conflicting source.
 *
 * Year, make, and model: site/data/services.json tag lines and the matching
 * client agreement title in site/data/agreements.json (they agree).
 * rental.cars was read on 2026-10-08. Where it disagrees, the field stays
 * with the published listing and the disagreement is noted here, not shown.
 * Passenger counts: the "maximum capacity" sentence in each agreement.
 * Colors: rental.cars.color when it is a plain color. Elsa is blank.
 * Body: "convertible" only when the published name says so, or when
 * site/lib/content.ts already treats Rosie as an open roadster.
 * Veronica and Sylvia are hardtops per the note in site/lib/content.ts.
 * Air conditioning, name origins, and histories are not in those sources.
 */

export type CarBody = "convertible" | "hardtop" | "limousine";

export type CarFacts = {
  car: string;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
  /** Passengers besides the chauffeur. */
  passengers: number | null;
  body: CarBody | null;
  airConditioning: boolean | null;
  nameOrigin: string;
  history: string;
};

export const carFacts: CarFacts[] = [
  {
    // Agreement: 1937 Cadillac Fleetwood Series 75, 4 passengers.
    // rental.cars.color Blue. rental.cars.model is "Series 76" — not shown.
    car: "Bonnie",
    year: 1937,
    make: "Cadillac",
    model: "Fleetwood Series 75",
    color: "Blue",
    passengers: 4,
    body: null,
    airConditioning: null,
    nameOrigin: "",
    history: "",
  },
  {
    // Agreement: 1941 Buick Super Convertible, 3 passengers. rental.cars.color Beige.
    car: "Phyllis",
    year: 1941,
    make: "Buick",
    model: "Super",
    color: "Beige",
    passengers: 3,
    body: "convertible",
    airConditioning: null,
    nameOrigin: "",
    history: "",
  },
  {
    // Listing tag line "Custom Deluxe"; agreement says "Custom". Color Black from rental.cars.
    // rental.cars.notes says "Verify year/make/model".
    car: "Black Betty",
    year: 1950,
    make: "Ford",
    model: "Custom Deluxe",
    color: "Black",
    passengers: 3,
    body: "convertible",
    airConditioning: null,
    nameOrigin: "",
    history: "",
  },
  {
    // Agreement: 1953 Packard Limousine, 6 passengers plus driver.
    // rental.cars.notes says "7 passengers + driver" — not shown. Color is null in rental.cars.
    car: "Patsy",
    year: 1953,
    make: "Packard",
    model: "Patrician Limousine",
    color: null,
    passengers: 6,
    body: "limousine",
    airConditioning: null,
    nameOrigin: "",
    history: "",
  },
  {
    // Agreement: 1954 Packard Caribbean Convertible, 3 passengers.
    // rental.cars.color is "White/Blur" and the quote menu says "(White)". Neither is shown.
    // rental.cars.notes says "Verify year/make/model".
    car: "Elsa",
    year: 1954,
    make: "Packard",
    model: "Caribbean",
    color: null,
    passengers: 3,
    body: "convertible",
    airConditioning: null,
    nameOrigin: "",
    history: "",
  },
  {
    // Listing and agreement: 1957 Chevrolet Bel Air, 3 passengers. rental.cars.color Black.
    // rental.cars.notes says "Verify year/make/model".
    car: "Veronica",
    year: 1957,
    make: "Chevrolet",
    model: "Bel Air",
    color: "Black",
    passengers: 3,
    body: "hardtop",
    airConditioning: null,
    nameOrigin: "",
    history: "",
  },
  {
    // Agreement: 1960 Chevrolet Corvette, 1 passenger plus driver.
    // site/lib/content.ts treats Rosie as an open roadster. rental.cars.color Maroon.
    // rental.cars.notes says "Verify year/make/model".
    car: "Rosie",
    year: 1960,
    make: "Chevrolet",
    model: "Corvette",
    color: "Maroon",
    passengers: 1,
    body: "convertible",
    airConditioning: null,
    nameOrigin: "",
    history: "",
  },
  {
    // Agreement: 1961 Buick Invicta Convertible, 3 passengers.
    // rental.cars.color Blue. J Williams's Google review calls Brenda "the blue beauty".
    car: "Brenda",
    year: 1961,
    make: "Buick",
    model: "Invicta",
    color: "Blue",
    passengers: 3,
    body: "convertible",
    airConditioning: null,
    nameOrigin: "",
    history: "",
  },
  {
    // Listing and agreement: 1970 Chevrolet Chevelle SS454, 3 passengers.
    // rental.cars.color Silver. The Sylvia occasion photo alt also says silver.
    // rental.cars.notes says "Verify year/make/model". Hardtop per site/lib/content.ts.
    car: "Sylvia",
    year: 1970,
    make: "Chevrolet",
    model: "Chevelle SS454",
    color: "Silver",
    passengers: 3,
    body: "hardtop",
    airConditioning: null,
    nameOrigin: "",
    history: "",
  },
  {
    // Agreement: 1976 Cadillac Eldorado Convertible, 3 passengers. rental.cars.color White.
    // rental.cars.notes says "Verify year/make/model".
    car: "Carmen",
    year: 1976,
    make: "Cadillac",
    model: "Eldorado",
    color: "White",
    passengers: 3,
    body: "convertible",
    airConditioning: null,
    nameOrigin: "",
    history: "",
  },
];

export function factsForCar(car: string) {
  return carFacts.find((item) => item.car === car) || null;
}

export function carIdentity(facts: CarFacts) {
  return [facts.year, facts.make, facts.model].filter((part) => part != null && String(part).trim()).join(" ");
}

export function bodyLabel(body: CarBody | null) {
  if (body === "convertible") return "Convertible";
  if (body === "hardtop") return "Hardtop";
  if (body === "limousine") return "Limousine";
  return "";
}
