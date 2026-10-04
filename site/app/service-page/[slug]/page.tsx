import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingForm } from "@/components/BookingForm";
import { EventPhotos } from "@/components/EventPhotos";
import { Reviews } from "@/components/Reviews";
import { StickyBookBar } from "@/components/StickyBookBar";
import { DEPOSIT_USD, EXTRA_HOUR_USD, EXTRA_MILE_USD, MILE_RADIUS } from "@/lib/booking-rules";
import { ADDRESS, EMAIL, PHONE_DISPLAY, PHONE_TEL, pageMeta, serviceBySlug, serviceDescription, services } from "@/lib/content";
import { carCapacity } from "@/lib/terms";

export function generateStaticParams() {
  return services.map((service) => ({ slug: service.slug }));
}

export function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    const service = serviceBySlug(slug);
    if (!service) return {};
    return pageMeta({
      title: `${service.name} | Chance Classics, Classic Car Rental`,
      description: serviceDescription(service),
      path: `/service-page/${service.slug}`,
      image: service.image.src,
    });
  });
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = serviceBySlug(slug);
  if (!service) notFound();
  return (
    <article className="wrap page">
      <div className="service-top">
        <img src={service.image.src} alt={service.tagLine} width={service.image.w || 900} height={service.image.h || 600} />
        <div>
          <h1>{service.name}</h1>
          <p>{service.tagLine}</p>
          <p className="dur">2 hr - 4 hr</p>
          <p>Customer&apos;s Place</p>
          <p className="price">${service.price}</p>
          <p className="book-actions">
            <a className="btn" href="#book">Book</a>
            <Link href="/quoterequest/">Prefer to talk? Request a quote</Link>
          </p>
        </div>
      </div>
      <h2>Service Description</h2>
      <p>{serviceDescription(service)}</p>
      <section className="car-facts">
        <h2>This car</h2>
        <ul>
          <li>{service.tagLine}</li>
          <li>${service.price} for the first 2 hours, then ${EXTRA_HOUR_USD} for each additional hour.</li>
          <li>A chauffeur is included. You don’t drive the car.</li>
          {carCapacity(service.portfolioSlug) && <li>{carCapacity(service.portfolioSlug)}</li>}
          <li>Within {MILE_RADIUS} miles of Benton, LA. Outside that radius, ${EXTRA_MILE_USD.toFixed(2)} per mile.</li>
          <li>${DEPOSIT_USD} non-refundable deposit when you book. The balance is billed separately.</li>
        </ul>
      </section>
      <EventPhotos slug={service.slug} />
      <Reviews car={service.car} />
      <BookingForm car={service.slug} carName={service.car} basePrice={service.price} />
      {service.gallery.length > 0 && (
        <div className="thumbs">
          {service.gallery.map((image) => (
            <img key={image.src} src={image.src} alt={image.alt || service.name} width={232} height={232} loading="lazy" />
          ))}
        </div>
      )}
      <h2>Cancellation Policy</h2>
      <p>
        Please read the <Link href="/rental-terms/">rental terms</Link> and select the checkbox prior to booking.
      </p>
      <h2>Contact Details</h2>
      <p><a href={`tel:${PHONE_TEL}`}>{PHONE_DISPLAY}</a></p>
      <p><a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
      <p>{ADDRESS}</p>
      <StickyBookBar bookHref="#book" />
    </article>
  );
}
