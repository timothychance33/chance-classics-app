import Link from "next/link";
import { notFound } from "next/navigation";
import { ADDRESS, EMAIL, PHONE_DISPLAY, PHONE_TEL, pageMeta, serviceBySlug, serviceDescription, services } from "@/lib/content";

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
          <a className="btn" href={service.wixBookUrl}>Book Now</a>
        </div>
      </div>
      <h2>Service Description</h2>
      <p>{serviceDescription(service)}</p>
      {service.gallery.length > 0 && (
        <div className="thumbs">
          {service.gallery.map((image) => (
            <img key={image.src} src={image.src} alt={image.alt || service.name} width={232} height={232} loading="lazy" />
          ))}
        </div>
      )}
      <h2>Cancellation Policy</h2>
      <p>
        Please read the <Link href={`/terms/${service.portfolioSlug}/`}>Client Agreement: Terms and Conditions</Link> and select the checkbox prior to booking.
      </p>
      <h2>Contact Details</h2>
      <p><a href={`tel:${PHONE_TEL}`}>{PHONE_DISPLAY}</a></p>
      <p><a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
      <p>{ADDRESS}</p>
    </article>
  );
}
