import Link from "next/link";
import { EXTRA_HOUR_USD } from "@/lib/booking-rules";
import { fixCopy, pageMeta, services } from "@/lib/content";
import { sharedTerms } from "@/lib/terms";

export const metadata = pageMeta({
  title: "Rental terms | Chance Classics, Classic Car Rental",
  description: "One rental agreement for Chance Classics. Each car’s listing price is on that car’s page.",
  path: "/rental-terms",
});

export default function RentalTermsPage() {
  return (
    <article className="wrap page legal">
      <h1>Rental terms</h1>
      <p>
        Booking on this site uses the listing price on the car’s page: that amount for the first 2 hours, then ${EXTRA_HOUR_USD} for each additional hour. The agreement text below is the captured client agreement, with the car-specific price and passenger count moved onto each car page.
      </p>
      <p>
        The captured agreement also says $200 for each additional consecutive hour. The service listings say ${EXTRA_HOUR_USD}. This site keeps showing the listing price until that difference is decided.
      </p>
      <h2>Listing price by car</h2>
      <ul>
        {services.map((service) => (
          <li key={service.slug}>
            <Link href={`/service-page/${service.slug}/`}>{service.car}</Link>
            {" — "}${service.price} for the first 2 hours
          </li>
        ))}
      </ul>
      {sharedTerms().map((block, index) => (
        <p key={index}>{fixCopy(block.type === "p" ? block.text : "")}</p>
      ))}
    </article>
  );
}
