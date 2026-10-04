import Link from "next/link";
import { faqs, pageMeta } from "@/lib/content";

export const metadata = pageMeta({
  title: "Classic Car Rental FAQ | Chance Classics",
  description: "Answers on classic car rentals for weddings and photos in Northwest Louisiana. Chauffeur, booking, and weather. Call 318-344-5001.",
  path: "/faq",
});

export default function FaqPage() {
  return (
    <article className="wrap page">
      <h1 className="center">Frequently Asked Questions</h1>
      <div className="faq">
        {faqs.map((item, i) => (
          <details key={item.q} open={i === 0}>
            <summary>{item.q}</summary>
            <p>
              {item.q.startsWith("How do I book") ? (
                <>
                  You can book a classic car rental directly through our online booking system at{" "}
                  <Link href="/book-online/">chanceclassics.com/book-online</Link>, or by calling{" "}
                  <a href="tel:+13183445001">(318) 344-5001</a>. We recommend booking as early as possible for peak wedding season dates.
                </>
              ) : (
                item.a
              )}
            </p>
          </details>
        ))}
      </div>
    </article>
  );
}
