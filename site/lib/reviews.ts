import data from "@/data/reviews.json";

export type Review = { name: string; stars: number; text: string };

const listing = data as {
  maps_url: string;
  overall_rating: number;
  review_count: number;
  reviews: Review[];
};

/** Home shows only these three reviews, in this order. */
const HOME_NAMES = ["Ayden McDermott", "Megan Acosta", "J Williams"];

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
  return HOME_NAMES.map((name) => items.find((review) => review.name === name)).filter((review): review is Review => Boolean(review));
}

export function reviewsForCar(car: string) {
  const words = CAR_WORDS[car] || [car];
  return reviewsWithText().filter((review) => words.some((word) => review.text.includes(word)));
}

export function weddingReviews() {
  return homeReviews().filter((review) => /wedding/i.test(review.text)).slice(0, 2);
}
