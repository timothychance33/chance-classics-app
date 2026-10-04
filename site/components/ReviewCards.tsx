"use client";

import { useEffect, useRef, useState } from "react";
import type { Review } from "@/lib/reviews";

export function ReviewCards({ reviews }: { reviews: Review[] }) {
  return (
    <ul className="review-grid">
      {reviews.map((review) => (
        <li key={review.name}>
          <ReviewCard review={review} />
        </li>
      ))}
    </ul>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const quote = useRef<HTMLQuoteElement>(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const node = quote.current;
    if (!node || open) return;
    setClamped(node.scrollHeight > node.clientHeight + 1);
  }, [open, review.text]);

  return (
    <article className="review-card">
      <p className="review-stars" aria-label={`${review.stars} stars`}>
        {"★".repeat(review.stars)}
      </p>
      <blockquote ref={quote} className={open ? "review-text open" : "review-text"}>
        {review.text}
      </blockquote>
      {clamped && !open && (
        <button type="button" className="review-more" onClick={() => setOpen(true)}>
          Read more
        </button>
      )}
      <p className="review-name">{review.name}</p>
    </article>
  );
}
