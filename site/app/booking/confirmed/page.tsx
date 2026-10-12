import Link from "next/link";
import { pageMeta } from "@/lib/content";

export const metadata = pageMeta({
  title: "Booking received | Chance Classics",
  description: "The deposit checkout is finished. The booking is confirmed after Stripe reports the payment.",
  path: "/booking/confirmed",
  noindex: true,
});

export default async function BookingConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string }>;
}) {
  const paid = (await searchParams).paid;
  const balance = paid === "balance";
  const charge = paid === "charge";
  return (
    <article className="wrap page system">
      <h1>{balance ? "Balance checkout finished" : charge ? "Payment checkout finished" : "Deposit checkout finished"}</h1>
      <p>
        {balance
          ? "The balance is applied to the booking when the payment notice arrives."
          : charge
            ? "The payment is applied to the booking when the payment notice arrives."
            : "The booking is confirmed only after the payment notice arrives. A test or preview checkout is marked source site-test in the garage app so it is not treated as a Wix booking."}
      </p>
      <p><Link href="/">Back home</Link></p>
    </article>
  );
}
