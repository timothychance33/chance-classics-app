import { SITE_URL, pageMeta } from "@/lib/content";
import { EXTRA_MILE_USD, MILE_THRESHOLD, MILEAGE_EXAMPLES, SHOP_ADDRESS } from "@/lib/booking-rules";

export const metadata = pageMeta({
  title: "Service Area | Chance Classics, Classic Car Rental",
  description:
    "Chance Classics is based in Benton, Louisiana. We work mostly in Northwest Louisiana and go as far as New Orleans, Longview, Jackson, and Hot Springs.",
  path: "/service-area",
});

const areaServed = [
  { "@type": "AdministrativeArea", name: "Northwest Louisiana" },
  { "@type": "City", name: "New Orleans" },
  { "@type": "City", name: "Longview" },
  { "@type": "City", name: "Jackson" },
  { "@type": "City", name: "Hot Springs" },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Chance Classic Car Rental",
  url: `${SITE_URL}/service-area/`,
  telephone: "+13183445001",
  email: "chanceclassics@gmail.com",
  address: {
    "@type": "PostalAddress",
    streetAddress: "118 5th St E",
    addressLocality: "Benton",
    addressRegion: "LA",
    postalCode: "71006",
    addressCountry: "US",
  },
  areaServed,
};

export default function ServiceAreaPage() {
  return (
    <article className="wrap page">
      <h1>Service area</h1>
      <p>Chance Classics is based at {SHOP_ADDRESS}.</p>
      <p>We work mostly in Northwest Louisiana and go as far as New Orleans, Longview, Jackson, and Hot Springs.</p>
      <h2>Mileage</h2>
      <p>
        A pickup {MILE_THRESHOLD} miles or less from Benton has no mileage charge.
        Farther than {MILE_THRESHOLD} miles, the car is trailered and the charge is ${EXTRA_MILE_USD} per mile for the whole distance, from mile one.
      </p>
      <ul className="mileage-examples">
        {MILEAGE_EXAMPLES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </article>
  );
}
