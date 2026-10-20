/**
 * City pages for towns the service area already reaches.
 * Distances are approximate drives from the Benton shop, not a mileage quote.
 * The quote measures the real pickup. No venues are named here.
 */

export type CityPage = {
  slug: string;
  name: string;
  /** State abbreviation, for the title. */
  region: string;
  title: string;
  description: string;
  paragraphs: string[];
  /** Car nicknames to link, in display order. */
  cars: string[];
};

export const cities: CityPage[] = [
  {
    slug: "shreveport",
    name: "Shreveport",
    region: "LA",
    title: "Classic Car Rental in Shreveport",
    description:
      "Chauffeured classic cars for Shreveport weddings, photo shoots, and parades. Chance Classics is based in Benton, about 14 miles north.",
    paragraphs: [
      "Chance Classics is based in Benton, about 14 miles north of Shreveport. The drive south on Louisiana Highway 3, Benton Road, is about 20 minutes to downtown. Shreveport is the largest city on a normal booking from the shop.",
      "Couples book a car for the ceremony exit, a short ride, and photos. A photo-only booking is available when you want the car in the pictures and not as transportation. Parades and other open-car events use the convertibles.",
      "Central Shreveport is inside the 30-mile line, so many pickups there have no mileage charge. The west and south edges of the city are farther. The quote uses the actual pickup address. Past 30 miles, the car is trailered at $3 per mile for the full distance.",
    ],
    cars: ["Patsy", "Carmen"],
  },
  {
    slug: "bossier-city",
    name: "Bossier City",
    region: "LA",
    title: "Classic Car Rental in Bossier City",
    description:
      "Chauffeured classic cars for Bossier City weddings, photos, and parades. The Benton shop is about 10 miles north, in Bossier Parish.",
    paragraphs: [
      "The shop is in Benton, in Bossier Parish, about 10 miles north of central Bossier City. That drive down Benton Road is about 15 minutes. It is the shortest trip of the cities on these pages.",
      "Weddings, photo sessions, and parades in Bossier City use the same chauffeur and the same fleet as a Benton booking. You do not drive the car. A parade needs an open car. Phyllis, the 1941 Buick Super, and Brenda, the 1961 Buick Invicta, are two of those convertibles.",
      "A typical Bossier City pickup is inside the 30-mile zone, so there is no mileage charge. The quote still checks the address you give us, because the fee follows the measured miles, not the city name.",
    ],
    cars: ["Phyllis", "Brenda"],
  },
  {
    slug: "minden",
    name: "Minden",
    region: "LA",
    title: "Classic Car Rental in Minden",
    description:
      "Chauffeured classic cars from Benton for Minden weddings, photo shoots, and parades. The drive is about 36 miles east on I-20.",
    paragraphs: [
      "Minden is east of Benton. The usual drive is about 36 miles and about 45 minutes: south to I-20, then east. It is a longer trip than Shreveport or Bossier City, and the same cars make it.",
      "Most Minden pickups are past the 30-mile line. The mileage charge is $3 per mile for the whole distance, from mile one, because the car is trailered. Send the pickup address with the quote and that fee is priced before you book.",
      "The booking can be a wedding exit, a photo session, or a parade. Parade cars are the convertibles. Bonnie, the 1937 Cadillac Fleetwood Series 75, is a closed sedan that seats 6 passengers besides the chauffeur when you need more room than a convertible.",
    ],
    cars: ["Bonnie", "Elsa"],
  },
  {
    slug: "ruston",
    name: "Ruston",
    region: "LA",
    title: "Classic Car Rental in Ruston",
    description:
      "Chauffeured classic cars from Benton for Ruston weddings, photo shoots, and parades. The drive is about 70 miles east on I-20.",
    paragraphs: [
      "Ruston is farther east on I-20, about 70 miles from the Benton shop and a little over an hour by the interstate. The car and the chauffeur come from Benton. You do not drive.",
      "The trip is well past 30 miles, so plan on the trailer mileage charge of $3 per mile for the full distance. A longer day can also add hours at $100 each after the first two. Both show up on the quote once we have the address and the time.",
      "You can book the cars for a Ruston wedding, photo shoot, or parade, the same three ways as closer to home. Photo-only time is available. Reservations have to be at least 7 days ahead, and a specific car can already be taken on a fall Saturday.",
    ],
    cars: ["Sylvia", "Veronica"],
  },
  {
    slug: "longview",
    name: "Longview",
    region: "TX",
    title: "Classic Car Rental in Longview",
    description:
      "Chauffeured classic cars from Benton for Longview, Texas. The drive is about 70 miles west on I-20, and mileage applies.",
    paragraphs: [
      "Longview is west of Benton, across the state line in Texas. The drive is through the Shreveport area and west on I-20, about 70 miles and a little over an hour. The service area already includes Longview as one of the farther points the cars go.",
      "Mileage applies. Past 30 miles from Benton the car is trailered at $3 per mile for the full distance, from mile one. The chauffeur is included. You book it the same way as a local rental: a quote, or online if you already know the car.",
      "A wedding or a photo shoot can be the reason to bring a car that far. A parade works too if you want an open car and a driver. Tell us the route when you request a quote so the hours cover the lineup and the ride. Rosie, the 1960 Chevrolet Corvette, seats one passenger besides the chauffeur. For more people, Patsy and Bonnie each seat 6.",
    ],
    cars: ["Rosie", "Black Betty", "Patsy"],
  },
];

export function cityBySlug(slug: string) {
  return cities.find((city) => city.slug === slug);
}
