import { approvedPlaces } from "@/data/serviceArea";
import { ADDRESS, SITE_URL, pageMeta } from "@/lib/content";
import { EXTRA_MILE_USD, MILE_THRESHOLD, SHOP_ADDRESS } from "@/lib/booking-rules";

export const metadata = pageMeta({
  title: "Service Area | Chance Classics, Classic Car Rental",
  description:
    "Chance Classics is based in Benton, Louisiana, and serves Shreveport, Bossier, and Northwest Louisiana. Mileage is free within 30 miles.",
  path: "/service-area",
});

const areaServed = [
  { "@type": "City", name: "Benton" },
  { "@type": "City", name: "Shreveport" },
  { "@type": "City", name: "Bossier City" },
  { "@type": "AdministrativeArea", name: "Northwest Louisiana" },
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
  const places = approvedPlaces();
  const towns = places.filter((place) => place.kind === "town");
  const venues = places.filter((place) => place.kind === "venue");
  return (
    <article className="wrap page">
      <h1>Service area</h1>
      <p>Chance Classics is based at {SHOP_ADDRESS}.</p>
      <p>
        We serve Shreveport, Bossier, Benton, and Northwest Louisiana.
      </p>
      <h2>Mileage</h2>
      <p>
        A pickup {MILE_THRESHOLD} miles or less from Benton has no mileage charge.
        Farther than {MILE_THRESHOLD} miles, the car is trailered and the charge is ${EXTRA_MILE_USD} per mile for the whole distance, from mile one.
      </p>
      <p>25 miles is $0. 45 miles is 45 × ${EXTRA_MILE_USD} = $135.</p>
      {towns.length > 0 && (
        <>
          <h2>Towns</h2>
          <ul>
            {towns.map((place) => (
              <li key={place.name}>{place.name}</li>
            ))}
          </ul>
        </>
      )}
      {venues.length > 0 && (
        <>
          <h2>Venues</h2>
          <ul>
            {venues.map((place) => (
              <li key={place.name}>{place.name}</li>
            ))}
          </ul>
        </>
      )}
      <p>{ADDRESS}</p>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </article>
  );
}
