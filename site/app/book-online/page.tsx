import Link from "next/link";
import { galleries, pageMeta, services } from "@/lib/content";

export const metadata = pageMeta({
  title: "Book Online | Chance Classics, Classic Car Rental",
  description: "Book a chauffeured classic car in Benton and the Shreveport/Bossier area. Rentals start at $500 for two hours.",
  path: "/book-online",
});

export default function BookOnlinePage() {
  const daisy = galleries.daisy;
  return (
    <article className="wrap page">
      <h1 className="center">Our Services</h1>
      <div className="book-list">
        {services.map((service) => (
          <article key={service.slug} className="book-card">
            <Link href={`/service-page/${service.slug}/`}>
              <img src={service.image.src} alt="" width={service.image.w || 900} height={service.image.h || 600} />
            </Link>
            <h2><Link href={`/service-page/${service.slug}/`}>{service.name}</Link></h2>
            <p className="tag">{service.tagLine}</p>
            <p><Link className="more" href={`/service-page/${service.slug}/`}>Read More</Link></p>
            <p className="price">${service.price}</p>
            <p className="dur">2 hr</p>
            <a className="btn" href={service.wixBookUrl}>Book Now</a>
          </article>
        ))}
        {daisy?.hero && (
          <article className="book-card">
            <Link href="/portfolio-collections/my-portfolio/daisy/">
              <img src={daisy.hero.src} alt="" width={daisy.hero.w || 900} height={daisy.hero.h || 600} />
            </Link>
            <h2><Link href="/portfolio-collections/my-portfolio/daisy/">Daisy</Link></h2>
            <p className="tag">1954 Packard Convertible</p>
            <p>Part of the collection. Not offered as an online booking.</p>
            <p><Link className="more" href="/quoterequest/">Request a Quote</Link></p>
          </article>
        )}
      </div>
    </article>
  );
}
