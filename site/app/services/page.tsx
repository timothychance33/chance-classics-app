import Link from "next/link";
import { Picture } from "@/components/Picture";
import { pageMeta } from "@/lib/content";
import { occasions } from "@/lib/occasions";

export const metadata = pageMeta({
  title: "Wedding, Photo & Parade Rentals | Chance Classics",
  description: "Classic cars for weddings, photo sessions, and parades in Benton and the Shreveport/Bossier area. Call 318-344-5001.",
  path: "/services",
});

const blocks = [
  {
    title: "Weddings",
    href: "/occasions/weddings/",
    image: occasions[0].image,
    alt: occasions[0].alt,
    reverse: true,
    text: "Every rental includes a professional chauffeur. You don’t drive the car yourself. Drivers know wedding timelines and photo stops. Photo-only bookings are available, not just transportation.",
  },
  {
    title: "Photo Sessions",
    href: "/occasions/photo-shoots/",
    image: occasions[2].image,
    alt: occasions[2].alt,
    reverse: false,
    text: "Our classic car rental photo sessions are the perfect way to capture lasting memories. We provide classic cars that create the perfect backdrop for your pictures, whether it's for a wedding, engagement, senior or any other special occasion. Let us help you create a unique and memorable experience with our classic car rental photo session.",
  },
  {
    title: "Parades",
    href: "/occasions/parades-and-special-events/",
    image: occasions[3].image,
    alt: occasions[3].alt,
    reverse: true,
    text: "Our classic car rental service for parades is the perfect way to make a grand entrance. Our cars and drivers will make you feel like royalty in a chariot, no matter what the occasion. Whether you're attending a homecoming parade, a festival parade, or a beauty pageant, our classic cars will ensure you make a lasting impression.",
  },
];

export default function ServicesPage() {
  return (
    <article className="wrap page">
      <h1>Services</h1>
      {blocks.map((block) => (
        <section key={block.title} className={block.reverse ? "svc-row reverse" : "svc-row"}>
          <Picture image={block.image} alt={block.alt} />
          <div>
            <h2>{block.title}</h2>
            <p>{block.text}</p>
          <p><Link href={block.href}>See cars and pricing</Link></p>
          </div>
        </section>
      ))}
    </article>
  );
}
