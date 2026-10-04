import Link from "next/link";
import { notFound } from "next/navigation";
import { Picture } from "@/components/Picture";
import { Reviews } from "@/components/Reviews";
import { EXTRA_HOUR_USD, DEPOSIT_USD, MILEAGE_RULE_TEXT, MIN_LEAD_DAYS, CANCEL_HOURS } from "@/lib/booking-rules";
import { occasionBySlug, occasions } from "@/lib/occasions";
import { pageMeta, services } from "@/lib/content";

export function generateStaticParams() {
  return occasions.map((item) => ({ slug: item.slug }));
}

export function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    const occasion = occasionBySlug(slug);
    if (!occasion) return {};
    return pageMeta({
      title: `${occasion.title} | Chance Classics, Classic Car Rental`,
      description: occasion.text,
      path: `/occasions/${occasion.slug}`,
      image: occasion.image?.src,
    });
  });
}

export default async function OccasionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const occasion = occasionBySlug(slug);
  if (!occasion) notFound();
  return (
    <article className="wrap page">
      <h1>{occasion.title}</h1>
      {occasion.image && <Picture image={occasion.image} alt={occasion.alt} />}
      <p>{occasion.text}</p>
      {occasion.slug === "weddings" && <Reviews wedding />}
      <h2>What’s included</h2>
      <ul>
        <li>A professional chauffeur. You don’t drive the car yourself.</li>
        <li>The car’s listing price covers the first 2 hours.</li>
        <li>Driving within 30 miles of Benton is included in the listing price.</li>
      </ul>
      <h2>Extras and rules</h2>
      <ul>
        <li>${EXTRA_HOUR_USD} for each additional hour, from the service listing.</li>
        <li>{MILEAGE_RULE_TEXT}</li>
        <li>A ${DEPOSIT_USD} non-refundable retainer is due when you book. The balance is billed separately.</li>
        <li>Reservations must be made at least {MIN_LEAD_DAYS} days in advance.</li>
        <li>If cancellation occurs {CANCEL_HOURS} hours or less prior to the booked event, the client forfeits all retainers and fees paid for services.</li>
      </ul>
      <h2>Cars</h2>
      <ul className="occasion-cars">
        {services.map((service) => (
          <li key={service.slug}>
            <Link href={`/service-page/${service.slug}/#book`}>
              <img src={service.image.src} alt="" width={160} height={120} />
              <span>
                <strong>{service.car}</strong>
                <span>{service.name}</span>
                <span>Starting at ${service.price}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p><Link href="/rental-terms/">Rental terms</Link></p>
    </article>
  );
}
