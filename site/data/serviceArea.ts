/**
 * Towns and venues named in rental.bookings pickup_location or return_location
 * (read-only, 2026-10-08). Private street addresses are not listed.
 * approved stays false until Tim says the name can go on the public page.
 * The page shows Benton, Shreveport, Bossier, and Northwest Louisiana either way.
 */

export type ServedPlace = {
  name: string;
  kind: "town" | "venue";
  /** Short note of the booking text this came from. No customer names. */
  source: string;
  approved: boolean;
};

export const servedPlaces: ServedPlace[] = [
  { name: "Benton, LA", kind: "town", source: "Shop base, and pickups in Benton", approved: false },
  { name: "Shreveport, LA", kind: "town", source: "Pickup and return addresses in Shreveport", approved: false },
  { name: "Bossier City, LA", kind: "town", source: "Return addresses in Bossier City", approved: false },
  { name: "Haughton, LA", kind: "town", source: "Haughton High School parade pickup", approved: false },
  { name: "Calhoun, LA", kind: "town", source: "Molto Bella Weddings and Events, Calhoun", approved: false },
  { name: "Lake Charles, LA", kind: "town", source: "Lake Charles venue pickups", approved: false },
  { name: "Monroe, LA", kind: "town", source: "Bayou Desaird Country Club and Hotel Monroe", approved: false },
  { name: "Mamou, LA", kind: "town", source: "Mamou High School homecoming parade", approved: false },
  { name: "Natchitoches, LA", kind: "town", source: "A Highway 3110 pickup in Natchitoches. Street not listed; it may be a home.", approved: false },
  { name: "Jena, LA", kind: "town", source: "A Browntown Road pickup in Jena. Street not listed; it may be a home.", approved: false },
  { name: "Texarkana", kind: "town", source: "Northridge CC, Texarkana", approved: false },
  { name: "Joaquin, TX", kind: "town", source: "Joaquin High School", approved: false },
  { name: "Flint, TX", kind: "town", source: "The Meadeaux, Flint TX", approved: false },
  { name: "Tyler, TX", kind: "town", source: "Hilton Garden Inn, Tyler", approved: false },
  { name: "Sainte Terre", kind: "venue", source: "Also written Stone Barn, The Stables at Saint Terre, 190 Nickel Lane, Benton", approved: false },
  { name: "Remington Hotel", kind: "venue", source: "Also written Remington Suites and Remington", approved: false },
  { name: "East Ridge Country Club", kind: "venue", source: "Also written East Ridge CC", approved: false },
  { name: "Scottish Rite", kind: "venue", source: "Also 601 Spring Street, Shreveport", approved: false },
  { name: "Live Casino", kind: "venue", source: "Return location on Scottish Rite weddings", approved: false },
  { name: "Hilton Downtown Shreveport", kind: "venue", source: "Return location", approved: false },
  { name: "Shreveport Convention Center", kind: "venue", source: "Return location", approved: false },
  { name: "The Strand Theater", kind: "venue", source: "619 Louisiana Ave, Shreveport", approved: false },
  { name: "The Barn at Coyote Creek", kind: "venue", source: "9460 McCain Rd, Shreveport", approved: false },
  { name: "God's Country RV Resort", kind: "venue", source: "Written Gods Country Rv Resort, Highway 1 North, Shreveport", approved: false },
  { name: "God's Country Mountain View Campground", kind: "venue", source: "7050 Soda Lake Dr, Shreveport", approved: false },
  { name: "Dixie Gin", kind: "venue", source: "Pickup location", approved: false },
  { name: "Venue De La Chute", kind: "venue", source: "Pickup location", approved: false },
  { name: "Molto Bella Weddings and Events", kind: "venue", source: "1097 Highway 151 South, Calhoun. Also written Molta Bella Venue", approved: false },
  { name: "Bayou Desaird Country Club", kind: "venue", source: "3501 Forsythe Ave, Monroe, as written on the booking", approved: false },
  { name: "Hotel Monroe", kind: "venue", source: "Return location", approved: false },
  { name: "Hitchin Post", kind: "venue", source: "Kingston Rd, Benton", approved: false },
  { name: "Margaritaville Casino", kind: "venue", source: "Return location", approved: false },
  { name: "Horshoe Casino", kind: "venue", source: "Return location, as written on the booking", approved: false },
  { name: "Historic Calcasieu Marine National Bank Building", kind: "venue", source: "844 Ryan Street, Lake Charles", approved: false },
  { name: "L'Auberge Lake Charles", kind: "venue", source: "Named as a possible return with Golden Nugget", approved: false },
  { name: "Golden Nugget Lake Charles", kind: "venue", source: "Named as a possible return with L'Auberge", approved: false },
  { name: "The Meadeaux", kind: "venue", source: "Flint, TX", approved: false },
  { name: "Hilton Garden Inn Tyler", kind: "venue", source: "220 E Grande Blvd, Tyler, TX", approved: false },
  { name: "Northridge Country Club", kind: "venue", source: "Written Northridge CC, Texarkana", approved: false },
  { name: "Benton High School", kind: "venue", source: "Homecoming parade", approved: false },
  { name: "Haughton High School", kind: "venue", source: "Homecoming parade, 210 E McKinley, Haughton", approved: false },
  { name: "Airline High School", kind: "venue", source: "Parade pickup", approved: false },
  { name: "Mamou High School", kind: "venue", source: "Homecoming parade, 1008 7th Street, Mamou", approved: false },
  { name: "Joaquin High School", kind: "venue", source: "Parade pickup, Joaquin, TX", approved: false },
  { name: "Calvary Baptist Academy", kind: "venue", source: "Pickup location", approved: false },
  { name: "Evangel Christian Academy", kind: "venue", source: "Parade and campus pickups in Shreveport", approved: false },
  { name: "Shreveport Community Church", kind: "venue", source: "Named with the Evangel elementary pickup, 5720 Buncombe Rd", approved: false },
];

export function approvedPlaces() {
  return servedPlaces.filter((place) => place.approved && place.name.trim());
}
