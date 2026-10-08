import { QuoteForm } from "@/components/QuoteForm";
import { pageMeta } from "@/lib/content";

export const metadata = pageMeta({
  title: "Request a Quote | Chance Classics, Classic Car Rental",
  description: "Request a price quote for a Chance Classics car. Weddings, photo sessions, parades, and other events around Benton, Louisiana.",
  path: "/quoterequest",
});

export default function QuotePage() {
  return (
    <article className="wrap page">
      <QuoteForm />
    </article>
  );
}
