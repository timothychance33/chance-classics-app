import { CarsGrid } from "@/components/CarsGrid";
import { pageMeta } from "@/lib/content";

export const metadata = pageMeta({
  title: "Cars | Chance Classics, Classic Car Rental",
  description: "Photographs of the classic cars available from Chance Classics in Benton, Louisiana, including Daisy, a 1954 Packard that is not booked online.",
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
      <p className="note">
        Daisy, the yellow 1954 Packard, is part of the collection and is shown here. She does not have an online booking service, so there is no Book button on her page.
      </p>
    </article>
  );
}
