import Link from "next/link";
import { CarsGrid } from "@/components/CarsGrid";
import { pageMeta } from "@/lib/content";

export const metadata = pageMeta({
  title: "Cars | Chance Classics, Classic Car Rental",
  description: "The Chance Classics portfolio of vintage cars available for weddings, photos, and parades.",
  path: "/portfolio-collections/my-portfolio",
});

export default function CollectionPage() {
  return (
    <article className="wrap page">
      <p><Link className="back" href="/portfolio/">Back to Portfolio</Link></p>
      <h1 className="center">Cars</h1>
      <p className="lede center">
        Here are some photographs of the cars we currently have available. Click an image below for more pictures.
      </p>
      <CarsGrid />
    </article>
  );
}
