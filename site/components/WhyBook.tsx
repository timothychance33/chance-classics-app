import { whyBookLines } from "@/data/packages";

export function WhyBook() {
  const lines = whyBookLines();
  if (!lines.length) return null;
  return (
    <section className="why-book" aria-labelledby="why-book-heading">
      <h2 id="why-book-heading">Why book with Chance Classics</h2>
      <ul>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
