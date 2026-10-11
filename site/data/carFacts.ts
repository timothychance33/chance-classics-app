/**
 * Public facts for each car. An empty string or null must not render.
 * Tim confirmed colors, air conditioning, body styles, and the passenger
 * overrides below on 2026-10-11. He declined name origins and histories.
 * Those stay empty, and the Her story section does not render.
 *
 * Year and make stay with the published listings in site/data/services.json
 * except where Tim named a different model or body below.
 * Passenger counts he did not override stay with the client agreements.
 */

export type CarBody = "convertible" | "roadster" | "sedan" | "coupe" | "hardtop" | "limousine";

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
    // Tim, 2026-10-11: Briarcliff Blue, air conditioning, Fleetwood Series 75 sedan, 6 passengers.
    // Series 75, not the database Series 76. Agreement had said 4 passengers.
    car: "Bonnie",
    year: 1937,
    make: "Cadillac",
    model: "Fleetwood Series 75",
    color: "Briarcliff Blue",
    passengers: 6,
    body: "sedan",
    airConditioning: true,
    nameOrigin: "",
    history: "",
  },
  {
    // Tim, 2026-10-11: Touquet Beige, no air conditioning, convertible.
    // Agreement: 3 passengers. Year, make, and model from the published listing.
    car: "Phyllis",
    year: 1941,
    make: "Buick",
    model: "Super",
    color: "Touquet Beige",
    passengers: 3,
    body: "convertible",
    airConditioning: false,
    nameOrigin: "",
    history: "",
  },
  {
    // Tim, 2026-10-11: Black, no air conditioning, convertible, 3 passengers.
    // Listing tag line is Custom Deluxe.
    car: "Black Betty",
    year: 1950,
    make: "Ford",
    model: "Custom Deluxe",
    color: "Black",
    passengers: 3,
    body: "convertible",
    airConditioning: false,
    nameOrigin: "",
    history: "",
  },
  {
    // Tim, 2026-10-11: Black, no air conditioning, Executive Sedan, 7 passengers.
    // Agreement had said Patrician Limousine and 6 passengers.
    car: "Patsy",
    year: 1953,
    make: "Packard",
    model: "Executive Sedan",
    color: "Black",
    passengers: 7,
    body: "sedan",
    airConditioning: false,
    nameOrigin: "",
    history: "",
  },
  {
    // Tim, 2026-10-11: two-tone Polaris Blue over Ivory, no air conditioning, convertible.
    // Ignore rental.cars.color "White/Blur" and the quote menu "(White)".
    // Agreement: 3 passengers.
    car: "Elsa",
    year: 1954,
    make: "Packard",
    model: "Caribbean",
    color: "Two-tone Polaris Blue over Ivory",
    passengers: 3,
    body: "convertible",
    airConditioning: false,
    nameOrigin: "",
    history: "",
  },
  {
    // Tim, 2026-10-11: Onyx Black, air conditioning, coupe.
    // Agreement: 3 passengers. Year, make, and model from the published listing.
    car: "Veronica",
    year: 1957,
    make: "Chevrolet",
    model: "Bel Air",
    color: "Onyx Black",
    passengers: 3,
    body: "coupe",
    airConditioning: true,
    nameOrigin: "",
    history: "",
  },
  {
    // Tim, 2026-10-11: Honduras Maroon, no air conditioning, roadster.
    // Agreement: 1 passenger plus the driver.
    car: "Rosie",
    year: 1960,
    make: "Chevrolet",
    model: "Corvette",
    color: "Honduras Maroon",
    passengers: 1,
    body: "roadster",
    airConditioning: false,
    nameOrigin: "",
    history: "",
  },
  {
    // Tim, 2026-10-11: Laguna Blue, no air conditioning, convertible.
    // Replaces the earlier plain "Blue". Agreement: 3 passengers.
    car: "Brenda",
    year: 1961,
    make: "Buick",
    model: "Invicta",
    color: "Laguna Blue",
    passengers: 3,
    body: "convertible",
    airConditioning: false,
    nameOrigin: "",
    history: "",
  },
  {
    // Tim, 2026-10-11: Blade Silver Metallic, air conditioning, coupe.
    // Agreement: 3 passengers. Year, make, and model from the published listing.
    car: "Sylvia",
    year: 1970,
    make: "Chevrolet",
    model: "Chevelle SS454",
    color: "Blade Silver Metallic",
    passengers: 3,
    body: "coupe",
    airConditioning: true,
    nameOrigin: "",
    history: "",
  },
  {
    // Tim, 2026-10-11: Cotillion White, air conditioning, convertible.
    // Agreement: 3 passengers. Year, make, and model from the published listing.
    car: "Carmen",
    year: 1976,
    make: "Cadillac",
    model: "Eldorado",
    color: "Cotillion White",
    passengers: 3,
    body: "convertible",
    airConditioning: true,
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
  if (body === "roadster") return "Roadster";
  if (body === "sedan") return "Sedan";
  if (body === "coupe") return "Coupe";
  if (body === "hardtop") return "Hardtop";
  if (body === "limousine") return "Limousine";
  return "";
}
