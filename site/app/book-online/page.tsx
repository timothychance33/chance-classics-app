import Link from "next/link";
import { carIdentity, factsForCar } from "@/data/carFacts";
import { pageMeta, services } from "@/lib/content";

export const metadata = pageMeta({
  title: "Book Online | Chance Classics, Classic Car Rental",
  description: "Book a chauffeured classic car in Benton and the Shreveport/Bossier area. Rentals start at $500 for two hours.",
  path: "/book-online",
});

export default function BookOnlinePage() {
  return (
    <article className="wrap page">
      <h1 className="center">Book Online</h1>
      <ul className="book-list">
        {services.map((service) => {
          const facts = factsForCar(service.car);
          const identity = facts ? carIdentity(facts) : service.name;
          return (
            <li key={service.slug} className="book-row">
              <img
                src={service.image.src}
                alt=""
                width={192}
                height={144}
              />
              <div className="book-row-copy">
                <h2>{service.car}</h2>
                <p className="book-row-model">{identity}</p>
                <p className="book-row-price">Starting at ${service.price}</p>
              </div>
              <p className="book-row-actions">
                <Link className="btn" href={`/service-page/${service.slug}/#book`}>Book</Link>
                <Link href={`/service-page/${service.slug}/`}>Meet {service.car}</Link>
              </p>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
