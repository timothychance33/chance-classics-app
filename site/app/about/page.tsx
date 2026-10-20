import Link from "next/link";
import { CallLine } from "@/components/CallLine";
import { Picture } from "@/components/Picture";
import { aboutImages, pageMeta } from "@/lib/content";
import { SHOP_ADDRESS } from "@/lib/booking-rules";

export const metadata = pageMeta({
  title: "About | Chance Classics, Classic Car Rental",
  description: "Tim Chance, Carl Chance, and Eric Edwards — the family behind Chance Classics car rental in Benton, Louisiana.",
  path: "/about",
});

export default function AboutPage() {
  const [driving, tim, carl, familyCars] = aboutImages;
  return (
    <article className="wrap page center">
      <h1>Our Automotive Family</h1>
      <p className="lede center">
        Chance Classic Car Rental consists of 2 generations of &quot;car guys&quot; who have spent the past 4 decades building and collecting classic cars. After being asked over and over if we would be willing to rent our cars for events or photo shoots, we decided to offer a select few from the collection to help people create the perfect event or picture.
      </p>
      <p><a className="btn" href="#family">View More</a></p>
      <div className="family-photos">
        {driving && (
          <Picture className="family-photo" image={driving} alt="The family with one of the classic cars" />
        )}
        {familyCars && (
          <Picture className="family-photo" image={familyCars} alt="The family with two of the cars" />
        )}
      </div>
      <section className="bio" id="family">
        {tim && <Picture image={tim} alt="Tim Chance" />}
        <h2>Tim Chance</h2>
        <p className="lede center">Owner</p>
        <p className="lede center">
          I&apos;ve been around classic cars my whole life. Most of the vehicles in our collection my dad has had since before I was born. It is my pleasure to be able to share some of these cars with you. I help coordinate the rentals and occasionally drive.
        </p>
      </section>
      <section className="bio">
        {carl && <Picture image={carl} alt="Carl Chance" />}
        <h2>Carl Chance</h2>
        <p className="lede center">Owner</p>
        <p className="lede center">
          Cars have been Carl&apos;s passion since childhood. A &quot;classic&quot; himself, a lot of his collection he has owned for over 50 years. In this business, Carl not only owns a few of the vehicles, he also helps drive them on occasions.
        </p>
      </section>
      <section className="bio">
        <h2>Eric Edwards</h2>
        <p className="lede center">Mechanic/Driver</p>
        <p className="lede center">
          Eric has extensive knowledge about classic cars. He helps to maintain the fleet and also drives them to events.
        </p>
      </section>
      <section className="bio">
        <h2>The shop</h2>
        <p>
          The cars are kept in Benton and maintained in our own shop, 2nd Chance Speed Shop. Chance Classics is at {SHOP_ADDRESS}. Tim coordinates the rentals. Carl owns some of the vehicles. Eric helps keep the fleet ready. All three drive.
        </p>
        <p>
          Every rental includes a chauffeur. You do not drive the car. We keep a 2-hour buffer before and after each booking, so the car is not coming straight from another event. If the car you booked is not available, we offer a comparable backup. Starting prices are on the car pages, and you can book online.
        </p>
        <p>
          Most of the work is in Northwest Louisiana. The cars also go as far as New Orleans, Longview, Jackson, and Hot Springs. A pickup more than 30 miles from Benton is trailered, and that mileage is part of the quote.
        </p>
        <p>
          <Link href="/portfolio/">See the cars</Link>
          {" · "}
          <Link href="/service-area/">Service area</Link>
        </p>
        <CallLine />
      </section>
    </article>
  );
}
