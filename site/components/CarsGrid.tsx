import Link from "next/link";
import { galleries, portfolioCovers, portfolioOrder, serviceByPortfolio } from "@/lib/content";

export function CarsGrid({ showDaisy = true }: { showDaisy?: boolean }) {
  const covers = portfolioCovers.map((cover) => {
    const slug = cover.href.split("/").filter(Boolean).pop() || "";
    return { ...cover, slug, title: galleries[slug]?.title || cover.alt };
  });
  if (showDaisy && galleries.daisy?.hero) {
    covers.push({
      alt: "Daisy, 1954 Packard Convertible",
      href: "/portfolio-collections/my-portfolio/daisy",
      image: galleries.daisy.hero,
      slug: "daisy",
      title: "Daisy",
    });
  }
  const ordered = portfolioOrder
    .map((slug) => covers.find((c) => c.slug === slug))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <div className="car-grid">
      {ordered.map((car) => {
        const service = serviceByPortfolio(car.slug);
        const galleryHref = `${car.href.endsWith("/") ? car.href : `${car.href}/`}`;
        const href = service ? `/service-page/${service.slug}/` : galleryHref;
        const subtitle = galleries[car.slug]?.subtitle;
        return (
          <Link key={car.slug} href={href} className="tile">
            <img
              src={car.image.src}
              alt={subtitle ? `Photo of ${car.title}, ${subtitle}` : `Photo of ${car.title}`}
              width={640}
              height={640}
              loading="lazy"
              decoding="async"
            />
            <span className="cap">
              <strong>{car.title}</strong>
              {subtitle && <span className="model">{subtitle}</span>}
              {service && <span className="price">Starting at ${service.price}</span>}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
