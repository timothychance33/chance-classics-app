import Link from "next/link";
import { WhyBook } from "@/components/WhyBook";
import { visibleFaqs } from "@/data/faqs";
import { pageMeta } from "@/lib/content";

const faqs = visibleFaqs();

export const metadata = pageMeta({
  title: "Classic Car Rental FAQ | Chance Classics",
  description: "Answers on classic car rentals for weddings and photos in Northwest Louisiana. Chauffeur, booking, mileage, and deposit. Call 318-344-5001.",
  path: "/faq",
});

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

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
                  Book online at <Link href="/book-online/">chanceclassics.com/book-online</Link>, or call{" "}
                  <a href="tel:+13183445001">(318) 344-5001</a>.
                </>
              ) : item.q.startsWith("What areas") ? (
                <>
                  {item.a} <Link href="/service-area/">Service area and mileage</Link>.
                </>
              ) : (
                item.a
              )}
            </p>
          </details>
        ))}
      </div>
      <WhyBook />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </article>
  );
}
