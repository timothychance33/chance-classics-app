import reviews from "@/data/reviews.json";

type Review = { name?: string; quote?: string; stars?: number; source?: string };

export function Reviews() {
  const items = (reviews as Review[]).filter((item) => item.quote && item.name);
  if (!items.length) return null;
  return (
    <section className="wrap reviews" aria-label="Reviews">
      <h2>Reviews</h2>
      <ul>
        {items.map((item) => (
          <li key={`${item.name}-${item.quote}`}>
            <blockquote>{item.quote}</blockquote>
            <p>
              {item.name}
              {item.source ? ` · ${item.source}` : ""}
              {item.stars ? ` · ${item.stars} stars` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
