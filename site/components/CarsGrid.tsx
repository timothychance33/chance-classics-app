import Link from "next/link";
import { galleries, portfolioCovers, portfolioOrder } from "@/lib/content";

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
      {ordered.map((car) => (
        <Link key={car.slug} href={`${car.href.endsWith("/") ? car.href : car.href + "/"}`}>
          <img src={car.image.src} alt="" width={640} height={640} loading="lazy" decoding="async" />
          <span>{car.title}</span>
        </Link>
      ))}
    </div>
  );
}
