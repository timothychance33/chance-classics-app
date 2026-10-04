import Link from "next/link";
import { pageMeta } from "@/lib/content";

export const metadata = pageMeta({
  title: "Terms and Conditions | Chance Classics, Classic Car Rental",
  description: "Client agreements for each Chance Classics car. Review and accept the terms before any rental.",
  path: "/termsandconditions",
});

const labels: Record<string, string> = {
  patsy: "Patsy (1953 Packard Limo)",
  brenda: "Brenda (1961 Buick Invicta)",
  phyllis: "Phyllis (1941 Buick Super)",
  rosie: "Rosie (1960 Corvette)",
  "black-betty": "Black Betty (1950 Ford Custom)",
  veronica: "Veronica (1957 Chevy)",
  sylvia: "Sylvia (1970 Chevelle)",
  elsa: "Elsa (1954 Packard Caribbean)",
  carmen: "Carmen (1976 Cadillac Eldorado)",
  bonnie: "Bonnie (1937 Cadillac Fleetwood 75)",
};

const order = ["patsy", "brenda", "phyllis", "rosie", "black-betty", "veronica", "sylvia", "elsa", "carmen", "daisy", "bonnie"];

export default function TermsPage() {
  return (
    <article className="wrap page center">
      <h1>Terms and Conditions</h1>
      <p className="lede center">
        The Client Agreement: Terms and Conditions for each car must be carefully reviewed and an indication of such must be made before any and all rentals
      </p>
      <ul className="terms-list">
        {order.map((slug) =>
          slug === "daisy" ? (
            <li key={slug}>
              <Link href="/portfolio-collections/my-portfolio/daisy/">Daisy (1954 Packard Convertible)</Link>
            </li>
          ) : (
            <li key={slug}>
              <Link href={`/terms/${slug}/`}>{labels[slug]}</Link>
            </li>
          ),
        )}
      </ul>
      <p className="note">
        Daisy has no rental service and no client agreement. Her name stays on this list and opens her gallery, which has no Book button.
      </p>
      </article>
  );
}
