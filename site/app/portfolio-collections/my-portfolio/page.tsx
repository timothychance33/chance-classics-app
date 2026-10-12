import Link from "next/link";
import { CarsGrid } from "@/components/CarsGrid";
import { pageMeta } from "@/lib/content";

export const metadata = pageMeta({
  title: "Cars | Chance Classics, Classic Car Rental",
  description: "Here are the cars we currently have available. Tap a car to see details and book.",
  path: "/portfolio-collections/my-portfolio",
});

export default function CollectionPage() {
  return (
    <article className="wrap page">
      <p><Link className="back" href="/portfolio/">Back to Portfolio</Link></p>
      <h1 className="center">Cars</h1>
      <p className="lede center">
        Here are the cars we currently have available. Tap a car to see details and book.
      </p>
      <CarsGrid />
    </article>
  );
}
