import Link from "next/link";
import { pageMeta } from "@/lib/content";

export const metadata = pageMeta({
  title: "Booking Form | Chance Classics, Classic Car Rental",
  description: "The booking form opens from a car’s Book Now button on the live booking calendar.",
  path: "/booking-form",
});

export default function BookingFormPage() {
  return (
    <article className="wrap page system">
      <h1>There was an issue with booking this service.</h1>
      <p>Please contact us or check out our other services.</p>
      <p><Link className="btn" href="/book-online/">Book Online</Link></p>
    </article>
  );
}
