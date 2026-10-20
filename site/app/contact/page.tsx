import Link from "next/link";
import { CallLine } from "@/components/CallLine";
import { InstagramStrip } from "@/components/InstagramStrip";
import { MapEmbed } from "@/components/MapEmbed";
import { EMAIL, pageMeta } from "@/lib/content";
import { SHOP_ADDRESS } from "@/lib/booking-rules";

export const metadata = pageMeta({
  title: "Contact | Chance Classics, Classic Car Rental",
  description:
    "Call or text Chance Classics in Benton, Louisiana at 318-344-5001, or email chanceclassics@gmail.com. Request a quote or book online.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <article className="wrap page">
      <h1>Contact</h1>
      <p>Chance Classics is based at {SHOP_ADDRESS}.</p>
      <CallLine lead="Call or text" />
      <p>
        <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
      </p>
      <p>
        We work mostly in Northwest Louisiana and go as far as New Orleans, Longview, Jackson, and Hot Springs.
        Pickups more than 30 miles from Benton are charged $3 per mile for the full distance, because the car is trailered.
      </p>
      <p>
        <Link className="btn" href="/quoterequest/">
          Request a quote
        </Link>
      </p>
      <p>
        <Link href="/book-online/">Book online</Link>
        {" · "}
        <Link href="/service-area/">Service area</Link>
      </p>
      <MapEmbed query={SHOP_ADDRESS} title={`Map of Chance Classics at ${SHOP_ADDRESS}`} />
      <InstagramStrip />
    </article>
  );
}
