import { ReviewCards } from "@/components/ReviewCards";
import { homeReviews, reviewsForCar, reviewsListing, weddingReviews } from "@/lib/reviews";

export function Reviews({ car, wedding = false }: { car?: string; wedding?: boolean }) {
  const items = car ? reviewsForCar(car) : wedding ? weddingReviews() : homeReviews();
  if (!items.length) return null;
  return (
    <section className="reviews" aria-label="Reviews">
      <h2>Reviews</h2>
      {!car && !wedding && (
        <p>
          <a className="review-badge" href={reviewsListing.mapsUrl}>
            {reviewsListing.ratingLabel}
          </a>
        </p>
      )}
      <ReviewCards reviews={items} />
    </section>
  );
}
