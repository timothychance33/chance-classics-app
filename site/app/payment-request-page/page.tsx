import Link from "next/link";
import { pageMeta } from "@/lib/content";

export const metadata = pageMeta({
  title: "Payment Request Page | Chance Classics, Classic Car Rental",
  description: "Payment links are sent with a booking. This page is the placeholder for a missing pay link.",
  path: "/payment-request-page",
  noindex: true,
});

export default function PaymentPage() {
  return (
    <article className="wrap page system">
      <p><Link href="/">CHANCE CLASSIC CAR RENTAL</Link></p>
      <h1>CHECKOUT</h1>
      <p>Pay link not found</p>
      <p>Refresh your page to try again. If there is still an issue, please contact us.</p>
    </article>
  );
}
