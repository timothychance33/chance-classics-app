import { PlannerForm } from "@/components/PlannerForm";
import { EMAIL, PHONE_DISPLAY, PHONE_TEL, pageMeta } from "@/lib/content";

export const metadata = pageMeta({
  title: "For Planners, Venues, and Photographers | Chance Classics",
  description: "Planners, venues, and photographers can email Tim at Chance Classics in Benton, Louisiana.",
  path: "/planners",
});

export default function PlannersPage() {
  return (
    <article className="wrap page">
      <h1>For planners, venues, and photographers</h1>
      <p>
        If you plan weddings, run a venue, or take photos in the Shreveport–Bossier area, send Tim a note. He will write back.
      </p>
      <p>
        Or email <a href={`mailto:${EMAIL}`}>{EMAIL}</a> or call <a href={`tel:${PHONE_TEL}`}>{PHONE_DISPLAY}</a>.
      </p>
      <PlannerForm />
    </article>
  );
}
