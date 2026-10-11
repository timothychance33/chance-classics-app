import { QuoteCheckout } from "@/components/QuoteCheckout";
import { pageMeta } from "@/lib/content";

export const dynamic = "force-dynamic";

export const metadata = pageMeta({
  title: "Book your quote | Chance Classics",
  description: "Pay the deposit for a Chance Classics quote.",
  path: "/book/quote",
  noindex: true,
});

export default async function QuoteBookPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <QuoteCheckout token={token} />;
}
