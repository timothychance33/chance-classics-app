import Link from "next/link";
import { notFound } from "next/navigation";
import { agreements, fixCopy, pageMeta, serviceByPortfolio, termsNav } from "@/lib/content";

export function generateStaticParams() {
  return termsNav.map((car) => ({ slug: car.slug }));
}

export function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    const agreement = agreements[slug];
    if (!agreement) return {};
    return pageMeta({
      title: agreement.title || `${agreement.name} | Chance Classics, Classic Car Rental`,
      description: `Client agreement for ${agreement.name}. Review these terms before reserving the car.`,
      path: `/terms/${slug}`,
    });
  });
}

export default async function AgreementPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agreement = agreements[slug];
  if (!agreement) notFound();
  const service = serviceByPortfolio(slug);
  return (
    <article className="wrap page legal">
      {agreement.blocks.map((block, i) => {
        if (block.type === "h1") return <h1 key={i}>{block.text}</h1>;
        if (block.type === "link") {
          const href = service && /book now/i.test(block.text) ? service.wixBookUrl : block.href;
          const external = href.startsWith("http");
          return (
            <p key={i}>
              <a className="btn" href={href} {...(external ? { rel: "noreferrer" } : {})}>
                {block.text}
              </a>
            </p>
          );
        }
        return <p key={i}>{fixCopy(block.text)}</p>;
      })}
      <p><Link href="/termsandconditions/">All terms</Link></p>
    </article>
  );
}
