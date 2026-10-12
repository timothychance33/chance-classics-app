import { CarsGrid } from "@/components/CarsGrid";
import { pageMeta } from "@/lib/content";

export const metadata = pageMeta({
  title: "Cars | Chance Classics, Classic Car Rental",
  description: "Here are some photographs of the cars we currently have available. Click an image below for more pictures.",
  path: "/portfolio",
});

export default function PortfolioPage() {
  return (
    <article className="wrap page">
      <h1 className="center">Cars</h1>
      <p className="lede center">
        Here are some photographs of the cars we currently have available. Click an image below for more pictures.
      </p>
      <CarsGrid />
    </article>
  );
}
