import { Picture } from "@/components/Picture";
import { pageMeta, thanksImage } from "@/lib/content";

export const metadata = pageMeta({
  title: "Thanks for your Quote Request | Chance Classics, Classic Car Rental",
  description: "Thanks for your inquiry. A Chance Classics team member will follow up within 24 hours.",
  path: "/registrationthanks",
  image: thanksImage.src,
  noindex: true,
});

export default function ThanksPage() {
  return (
    <article className="wrap page center">
      <h1>Thanks for your inquiry</h1>
      <p>A team member will follow up via email, text, or call within 24 hours.</p>
      <Picture image={thanksImage} alt="Chance Classics" />
    </article>
  );
}
