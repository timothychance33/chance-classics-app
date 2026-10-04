import data from "@/data/reviews.json";

export type Review = { name: string; stars: number; text: string };

const listing = data as {
  maps_url: string;
  overall_rating: number;
  review_count: number;
  reviews: Review[];
};

/** Home leads with these names. Anyone else with text follows in file order. */
const HOME_LEAD = ["Ayden McDermott", "Megan Acosta", "J Williams", "Susan", "Rodrick Carter"];

/** A review is shown on a car page only when its own words name that car. Sylvia is the Chevelle. */
const CAR_WORDS: Record<string, string[]> = {
  Carmen: ["Carmen"],
  Brenda: ["Brenda"],
  Phyllis: ["Phyllis"],
  Sylvia: ["Chevelle", "Sylvia"],
};

export const reviewsListing = {
  mapsUrl: listing.maps_url,
  ratingLabel: `${Number(listing.overall_rating).toFixed(1)} on Google, ${listing.review_count} reviews`,
};

export function reviewsWithText() {
  return listing.reviews.filter((review) => review.name && review.text.trim());
}

export function homeReviews() {
  const items = reviewsWithText();
  const lead = HOME_LEAD.map((name) => items.find((review) => review.name === name)).filter((review): review is Review => Boolean(review));
  const rest = items.filter((review) => !HOME_LEAD.includes(review.name));
  return [...lead, ...rest];
}

export function reviewsForCar(car: string) {
  const words = CAR_WORDS[car] || [car];
  return reviewsWithText().filter((review) => words.some((word) => review.text.includes(word)));
}

export function weddingReviews() {
  return homeReviews().filter((review) => /wedding/i.test(review.text)).slice(0, 2);
}
