import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { CallLine } from "@/components/CallLine";
import { Picture } from "@/components/Picture";
import { aboutDrivers } from "@/data/drivers";
import { aboutImages, pageMeta } from "@/lib/content";
import { SHOP_ADDRESS } from "@/lib/booking-rules";

export const metadata = pageMeta({
  title: "About | Chance Classics, Classic Car Rental",
  description: "Tim Chance, Carl Chance, Eric Edwards, and the drivers behind Chance Classics car rental in Benton, Louisiana.",
  path: "/about",
});

function monogram(name: string) {
  const trimmed = name.trim();
  if (trimmed.length <= 3) return trimmed.toUpperCase();
  return trimmed.slice(0, 1).toUpperCase();
}

/** Use the driver's one image path when that file is in public/. */
function driverPhoto(src: string) {
  if (!src.startsWith("/")) return "";
  const file = path.join(process.cwd(), "public", src.slice(1));
  return fs.existsSync(file) ? src : "";
}

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
      {aboutDrivers.map((driver) => {
        const photo = driverPhoto(driver.image);
        return (
          <section className="bio" key={driver.name}>
            {photo ? (
              <img className="bio-portrait" src={photo} alt={driver.name} width={1200} height={1500} />
            ) : (
              <div className="bio-portrait" aria-hidden="true">
                <svg viewBox="0 0 120 120">
                  <circle cx="60" cy="46" r="18" fill="none" stroke="currentColor" strokeWidth="2.25" />
                  <path
                    d="M24 104c6-22 16-32 36-32s30 10 36 32"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="monogram">{monogram(driver.name)}</span>
              </div>
            )}
            <h2>{driver.name}</h2>
            <p className="lede center">{driver.role}</p>
            <p className="lede center">{driver.text}</p>
          </section>
        );
      })}
      <section className="bio">
        <h2>The shop</h2>
        <p>
          The cars are kept in Benton and maintained in our own shop, 2nd Chance Speed Shop. Chance Classics is at {SHOP_ADDRESS}. Tim coordinates the rentals. Carl owns some of the vehicles. Eric helps keep the fleet ready. They drive, and so do Zack, Edward, Ed, and Benny.
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
