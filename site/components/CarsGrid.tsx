import { CarTile } from "@/components/CarTile";
import { galleries, portfolioCovers, portfolioOrder, serviceByPortfolio } from "@/lib/content";

export function CarsGrid() {
  const covers = portfolioCovers.map((cover) => {
    const slug = cover.href.split("/").filter(Boolean).pop() || "";
    return { ...cover, slug, title: galleries[slug]?.title || cover.alt };
  });
  const ordered = portfolioOrder
    .map((slug) => covers.find((c) => c.slug === slug))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <div className="car-grid">
      {ordered.map((car) => {
        const service = serviceByPortfolio(car.slug);
        const galleryHref = `${car.href.endsWith("/") ? car.href : `${car.href}/`}`;
        const meetHref = service ? `/service-page/${service.slug}/` : galleryHref;
        const bookHref = service ? `/service-page/${service.slug}/#book` : meetHref;
        const subtitle = galleries[car.slug]?.subtitle;
        return (
          <CarTile
            key={car.slug}
            name={car.title}
            model={subtitle}
            price={service?.price}
            image={car.image}
            bookHref={bookHref}
            meetHref={meetHref}
          />
        );
      })}
    </div>
  );
}
