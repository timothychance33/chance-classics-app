import { Picture } from "@/components/Picture";
import { aboutImages, pageMeta } from "@/lib/content";

export const metadata = pageMeta({
  title: "About | Chance Classics, Classic Car Rental",
  description: "Tim Chance, Carl Chance, and Eric Edwards — the family behind Chance Classics car rental in Benton, Louisiana.",
  path: "/about",
});

export default function AboutPage() {
  const [driving, portrait, eric] = aboutImages;
  return (
    <article className="wrap page center">
      <h1>Our Automotive Family</h1>
      <p className="lede center">
        Chance Classic Car Rental consists of 2 generations of &quot;car guys&quot; who have spent the past 4 decades building and collecting classic cars. After being asked over and over if we would be willing to rent our cars for events or photo shoots, we decided to offer a select few from the collection to help people create the perfect event or picture.
      </p>
      <p><a className="btn" href="#family">View More</a></p>
      <div className="split" id="family">
        {driving && <Picture image={driving} alt="Driving one of the classic cars" />}
        {portrait && <Picture image={portrait} alt="Carl Chance" />}
      </div>
      <h2>Tim Chance</h2>
      <p className="lede center">Owner</p>
      <p className="lede center">
        I&apos;ve been around classic cars my whole life. Most of the vehicles in our collection my dad has had since before I was born. It is my pleasure to be able to share some of these cars with you. I help coordinate the rentals and occasionally drive.
      </p>
      <h2>Carl Chance</h2>
      <p className="lede center">Owner</p>
      <p className="lede center">
        Cars have been Carl&apos;s passion since childhood. A &quot;classic&quot; himself, a lot of his collection he has owned for over 50 years. In this business, Carl not only owns a lot of the vehicles, he also helps drive them on occasions.
      </p>
      {eric && <Picture image={eric} alt="Eric Edwards" />}
      <h2>Eric Edwards</h2>
      <p className="lede center">Mechanic/Driver</p>
      <p className="lede center">
        Eric has extensive knowledge about classic cars. He helps to maintain the fleet and also drives them to events.
      </p>
    </article>
  );
}
