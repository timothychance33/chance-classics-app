import Link from "next/link";
import { notFound } from "next/navigation";
import { LightboxGallery } from "@/components/Lightbox";
import { Picture } from "@/components/Picture";
import { StickyBookBar } from "@/components/StickyBookBar";
import { galleries, pageMeta, portfolioOrder, serviceByPortfolio } from "@/lib/content";

export function generateStaticParams() {
  return portfolioOrder.map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    const gallery = galleries[slug];
    if (!gallery) return {};
    return pageMeta({
      title: `${gallery.title} | Chance Classics, Classic Car Rental`,
      description: gallery.note || gallery.subtitle,
      path: `/portfolio-collections/my-portfolio/${slug}`,
      image: gallery.hero?.src,
    });
  });
}

export default async function CarGalleryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const gallery = galleries[slug];
  if (!gallery) notFound();
  const index = portfolioOrder.indexOf(slug);
  const prev = portfolioOrder[(index - 1 + portfolioOrder.length) % portfolioOrder.length];
  const next = portfolioOrder[(index + 1) % portfolioOrder.length];
  const service = serviceByPortfolio(slug);
  const photos = gallery.images.filter((img) => img.src !== gallery.hero?.src);

  return (
    <article className="page">
      {gallery.hero && (
        <div className="gallery-hero">
          <Picture image={gallery.hero} alt={gallery.title} priority />
        </div>
      )}
      <div className="wrap">
        <h1 className="center">{gallery.title}</h1>
        <p className="center">{gallery.subtitle}</p>
        {gallery.note && <p className="note">{gallery.note}</p>}
        <p className="center">
          {service ? (
            <Link href={`/service-page/${service.slug}/#book`}>Book</Link>
          ) : (
            <Link href="/quoterequest/">Request a Quote</Link>
          )}
        </p>
        {photos.length > 0 && <LightboxGallery images={photos} />}
        <StickyBookBar bookHref={service ? `/service-page/${service.slug}/#book` : undefined} />
        <nav className="pager" aria-label="More cars">
          <Link href={`/portfolio-collections/my-portfolio/${prev}/`}>Previous project</Link>
          <Link href={`/portfolio-collections/my-portfolio/${next}/`}>Next project</Link>
        </nav>
      </div>
    </article>
  );
}
