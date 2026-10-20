import Link from "next/link";
import { CallLine } from "@/components/CallLine";
import { ServiceAreaMap } from "@/components/ServiceAreaMap";
import { cities } from "@/data/cities";
import { EMAIL, PHONE_TEL, SITE_URL, pageMeta } from "@/lib/content";
import { EXTRA_MILE_USD, MILE_THRESHOLD, MILEAGE_EXAMPLES, SHOP_ADDRESS } from "@/lib/booking-rules";

export const dynamic = "force-dynamic";

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
  name: "Chance Classics",
  url: `${SITE_URL}/service-area/`,
  telephone: PHONE_TEL,
  email: EMAIL,
  address: {
    "@type": "PostalAddress",
    streetAddress: "118 5th St E",
    addressLocality: "Benton",
    addressRegion: "LA",
    postalCode: "71006",
    addressCountry: "US",
  },
  areaServed: [
    ...areaServed,
    { "@type": "City", name: "Shreveport" },
    { "@type": "City", name: "Bossier City" },
    { "@type": "City", name: "Benton" },
    { "@type": "City", name: "Minden" },
    { "@type": "City", name: "Ruston" },
  ],
};

export default function ServiceAreaPage() {
  return (
    <article className="wrap page">
      <h1>Service area</h1>
      <p>Chance Classics is based at {SHOP_ADDRESS}.</p>
      <p>We work mostly in Northwest Louisiana and go as far as New Orleans, Longview, Jackson, and Hot Springs.</p>
      <CallLine />
      <h2>Cities</h2>
      <ul>
        {cities.map((city) => (
          <li key={city.slug}>
            <Link href={`/service-area/${city.slug}/`}>{city.name}, {city.region}</Link>
          </li>
        ))}
      </ul>
      <ServiceAreaMap apiKey={process.env.GOOGLE_MAPS_API_KEY || ""} />
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
