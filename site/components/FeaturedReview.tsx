import { ReviewCards } from "@/components/ReviewCards";
import { featuredReview } from "@/lib/reviews";

export function FeaturedReview({ car }: { car: string }) {
  const review = featuredReview(car);
  if (!review) return null;
  return (
    <section className="reviews featured-review" aria-label={`Review mentioning ${car}`}>
      <h2>A review</h2>
      <ReviewCards reviews={[review]} />
    </section>
  );
}
