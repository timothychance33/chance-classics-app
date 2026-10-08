import Link from "next/link";
import { CarTile } from "@/components/CarTile";
import { Picture } from "@/components/Picture";
import { Reviews } from "@/components/Reviews";
import { WhyBook } from "@/components/WhyBook";
import { ADDRESS, EMAIL, PHONE_DISPLAY, PHONE_TEL, byModelYear, home, pageMeta, services } from "@/lib/content";
import { occasions } from "@/lib/occasions";

export const metadata = pageMeta({
  title: "Classic Car Rental for Weddings, Photo Shoots, and Parades | Chance Classics",
  description:
    "Chance Classics is Northwest Louisiana’s premier classic car rental, with a fleet of chauffeured vintage cars for weddings, photo shoots, parades, and special events across Shreveport, Bossier, and surrounding areas.",
  path: "/",
});

export default function HomePage() {
  return (
    <>
      <Picture image={home.hero} alt="Classic cars from the Chance Classics collection" priority className="hero" />
      <section className="wrap home-intro center">
        <h1>Make Your Moment a Classic</h1>
        <p className="lede center">
          Chance Classics is Northwest Louisiana’s premier classic car rental, with a fleet of chauffeured vintage cars for weddings, photo shoots, parades, and special events across Shreveport, Bossier, and surrounding areas.
        </p>
      </section>
      <section className="wrap fleet" aria-label="The cars">
        {byModelYear(home.fleet, (car) => car.caption, (car) => car.name).map((car) => {
          const service = services.find((item) => item.car === car.name);
          const model = car.caption.split(" / ")[0];
          const meetHref = service ? `/service-page/${service.slug}/` : `${car.href.replace(/\/$/, "")}/`;
          const bookHref = service ? `/service-page/${service.slug}/#book` : meetHref;
          return (
            <CarTile
              key={car.name}
              name={car.name}
              model={model}
              price={service?.price}
              image={car.image}
              bookHref={bookHref}
              meetHref={meetHref}
            />
          );
        })}
      </section>
      <section className="wrap occasions" aria-label="Occasions">
        <h2>Plan by occasion</h2>
        <ul>
          {occasions.map((occasion) => (
            <li key={occasion.slug}>
              <Link href={`/occasions/${occasion.slug}/`}>
                {occasion.image && (
                  <img
                    style={occasion.cardPosition ? { objectPosition: occasion.cardPosition } : undefined}
                    src={occasion.image.src}
                    alt={occasion.alt}
                    width={occasion.image.w || 640}
                    height={occasion.image.h || 480}
                  />
                )}
                <strong>{occasion.title}</strong>
                <span>See the cars, the listing price, and what’s included.</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <div className="wrap">
        <WhyBook />
        <Reviews />
      </div>
      <section className="wrap split">
        <div>
          <h2>Who we are</h2>
          <p>
            Chance Classic Car Rental consists of 2 generations of &quot;car guys&quot; (Tim Chance and Carl Chance) who have spent the past 4 decades building and collecting classic cars. After being asked over and over if we would be willing to rent our cars for events or photo shoots, we decided to offer a select few from the collection to help people create the perfect event or photo shoot.
          </p>
        </div>
        <Picture image={home.portrait} alt="Tim and Carl Chance with one of the cars" />
      </section>
      <section className="wrap contact-block center">
        <h2>Contact</h2>
        <p>{ADDRESS}</p>
        <p><a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
        <p><a href={`tel:${PHONE_TEL}`}>{PHONE_DISPLAY}</a></p>
      </section>
      <Picture image={home.wedding} alt="A wedding party with a Chance Classics car" className="band" />
    </>
  );
}
