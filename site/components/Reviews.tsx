import { ReviewCards } from "@/components/ReviewCards";
import { additionalReviewsForCar, homeReviews, reviewsListing, weddingReviews } from "@/lib/reviews";

export function Reviews({ car, wedding = false }: { car?: string; wedding?: boolean }) {
  const items = car ? additionalReviewsForCar(car) : wedding ? weddingReviews() : homeReviews();
  const showBadge = !wedding;
  if (!items.length && !showBadge) return null;
  return (
    <section className="reviews" aria-label="Reviews">
      <h2>Reviews</h2>
      {showBadge && (
        <p>
          <a className="review-badge" href={reviewsListing.mapsUrl}>
            {reviewsListing.ratingLabel}
          </a>
        </p>
      )}
      {items.length > 0 && <ReviewCards reviews={items} />}
      {showBadge && !car && (
        <p className="review-all">
          <a href={reviewsListing.mapsUrl}>Read all reviews on Google</a>
        </p>
      )}
    </section>
  );
}
