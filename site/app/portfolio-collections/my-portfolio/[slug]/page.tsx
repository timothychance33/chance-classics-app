import Link from "next/link";
import { notFound } from "next/navigation";
import { LightboxGallery } from "@/components/Lightbox";
import { Picture } from "@/components/Picture";
import { StickyBookBar } from "@/components/StickyBookBar";
import { descriptiveAlt } from "@/lib/alt";
import { fleetModel, galleries, pageMeta, portfolioOrder, serviceByPortfolio } from "@/lib/content";

export function generateStaticParams() {
  return portfolioOrder.map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    const gallery = galleries[slug];
    if (!gallery) return {};
    const model = fleetModel(gallery.title) || gallery.subtitle;
    return pageMeta({
      title: `${gallery.title} | Chance Classics, Classic Car Rental`,
      description: gallery.note || model,
      path: `/portfolio-collections/my-portfolio/${slug}`,
      image: gallery.hero?.src,
      imageAlt: model ? `Photo of ${gallery.title}, the ${model}` : gallery.title,
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
  const model = fleetModel(gallery.title) || gallery.subtitle;
  const photoAlt = model ? `Photo of ${gallery.title}, the ${model}` : `Photo of ${gallery.title}`;
  const photos = gallery.images
    .filter((img) => img.src !== gallery.hero?.src)
    .map((img) => ({ ...img, alt: descriptiveAlt(img.alt, photoAlt) }));

  return (
    <article className="page">
      {gallery.hero && (
        <div className="gallery-hero">
          <Picture image={gallery.hero} alt={descriptiveAlt(gallery.hero.alt, photoAlt)} priority />
        </div>
      )}
      <div className="wrap">
        <h1 className="center">{gallery.title}</h1>
        <p className="center">{model}</p>
        {gallery.note && <p className="note">{gallery.note}</p>}
        <p className="center gallery-actions">
          {service ? (
            <>
              <Link className="btn" href={`/service-page/${service.slug}/#book`}>Book</Link>
              <Link className="btn btn-quiet" href={`/service-page/${service.slug}/`}>Meet {gallery.title}</Link>
            </>
          ) : (
            <Link className="btn" href="/quoterequest/">Request a Quote</Link>
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
