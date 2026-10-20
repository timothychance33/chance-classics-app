import Link from "next/link";
import { notFound } from "next/navigation";
import { CallLine } from "@/components/CallLine";
import { cities, cityBySlug } from "@/data/cities";
import { fleetModel, pageMeta, services } from "@/lib/content";

export function generateStaticParams() {
  return cities.map((city) => ({ city: city.slug }));
}

export function generateMetadata({ params }: { params: Promise<{ city: string }> }) {
  return params.then(({ city: slug }) => {
    const city = cityBySlug(slug);
    if (!city) return {};
    return pageMeta({
      title: `${city.title} | Chance Classics`,
      description: city.description,
      path: `/service-area/${city.slug}`,
    });
  });
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city: slug } = await params;
  const city = cityBySlug(slug);
  if (!city) notFound();
  const cars = city.cars
    .map((name) => services.find((service) => service.car === name))
    .filter((service): service is (typeof services)[number] => Boolean(service));

  return (
    <article className="wrap page">
      <p>
        <Link className="back" href="/service-area/">
          Service area
        </Link>
      </p>
      <h1>{city.title}</h1>
      {city.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <h2>Cars to look at</h2>
      <ul>
        {cars.map((service) => {
          const model = fleetModel(service.car) || service.name;
          return (
            <li key={service.slug}>
              <Link href={`/service-page/${service.slug}/`}>
                {service.car}, the {model}
              </Link>
              {" — starting at $"}
              {service.price}
            </li>
          );
        })}
      </ul>
      <p>
        <Link href="/portfolio/">See the full fleet</Link>
      </p>
      <h2>Occasions</h2>
      <ul>
        <li>
          <Link href="/occasions/weddings/">Weddings</Link>
        </li>
        <li>
          <Link href="/occasions/photo-shoots/">Photo shoots</Link>
        </li>
        <li>
          <Link href="/occasions/parades-and-special-events/">Parades and special events</Link>
        </li>
      </ul>
      <p>
        <Link className="btn" href="/quoterequest/">
          Request a quote
        </Link>
      </p>
      <p>
        Or <Link href="/book-online/">book online</Link> if you already know the car.
      </p>
      <CallLine />
      <p className="meta">Distances are approximate drives from the Benton shop. The quote uses the measured pickup.</p>
    </article>
  );
}
