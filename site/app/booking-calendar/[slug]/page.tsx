import Link from "next/link";
import { notFound } from "next/navigation";
import { fleetModel, fleetTag, pageMeta, serviceBySlug, services } from "@/lib/content";

export function generateStaticParams() {
  return services.map((service) => ({ slug: service.slug }));
}

export function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    const service = serviceBySlug(slug);
    if (!service) return {};
    const model = fleetModel(service.car) || service.name;
    return pageMeta({
      title: `${model} - Chance Classics, Classic Car Rental`,
      description: `Book ${fleetTag(service.car, service.tagLine)} on the car page. Choose an open time and pay the deposit.`,
      path: `/booking-calendar/${service.slug}`,
      image: service.image.src,
      imageAlt: `Photo of ${service.car}, the ${model}`,
    });
  });
}

export default async function CalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = serviceBySlug(slug);
  if (!service) notFound();
  return (
    <article className="wrap page system">
      <h1>Schedule your service</h1>
      <p>Check out our availability and book the date and time that works for you.</p>
      <p>{fleetTag(service.car, service.tagLine)}</p>
      <p className="price">${service.price}</p>
      <p className="dur">2 hr · Central Time</p>
      <p>Choose the date and start time on the car page. The old Wix calendar is no longer the booking path.</p>
      <p>
        <Link className="btn" href={`/service-page/${service.slug}/#book`}>Book {service.car}</Link>
      </p>
      <p><Link href={`/service-page/${service.slug}/`}>Back to {fleetModel(service.car) || service.name}</Link></p>
    </article>
  );
}
