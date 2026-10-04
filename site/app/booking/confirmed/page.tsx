import Link from "next/link";
import { pageMeta } from "@/lib/content";

export const metadata = pageMeta({
  title: "Booking received | Chance Classics",
  description: "The deposit checkout is finished. The booking is confirmed after Stripe reports the payment.",
  path: "/booking/confirmed",
});

export default function BookingConfirmedPage() {
  return (
    <article className="wrap page system">
      <h1>Deposit checkout finished</h1>
      <p>
        The booking is confirmed only after the payment notice arrives. A test or preview checkout is marked source site-test in the garage app so it is not treated as a Wix booking.
      </p>
      <p><Link href="/">Back home</Link></p>
    </article>
  );
}
