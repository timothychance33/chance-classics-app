import Link from "next/link";
import { Picture } from "@/components/Picture";
import { Reviews } from "@/components/Reviews";
import { ADDRESS, EMAIL, PHONE_DISPLAY, PHONE_TEL, home, pageMeta, services } from "@/lib/content";
import { occasions } from "@/lib/occasions";

export const metadata = pageMeta({
  title: "Classic Car Rental for Weddings & Photos | Chance Classics",
  description:
    "Vintage car rental for weddings, photo shoots, and special occasions in Benton and the Shreveport/Bossier area. Ten cars. Call 318-344-5001.",
  path: "/",
});

export default function HomePage() {
  return (
    <>
      <Picture image={home.hero} alt="Classic cars from the Chance Classics collection" priority className="hero" />
      <section className="wrap home-intro center">
        <h1>Classic Car Rental for Weddings and Photo Shoots</h1>
        <p className="lede center">
          Serving Benton, Shreveport, Bossier, and surrounding areas. Whether it’s your wedding day, anniversary, birthday, engagement, photo shoot, or any special occasion, Chance Classics can transport you in style.
        </p>
      </section>
      <section className="wrap fleet" aria-label="The cars">
        {home.fleet.map((car) => {
          const service = services.find((item) => item.car === car.name);
          const model = car.caption.split(" / ")[0];
          const price = service?.price;
          const href = service ? `/service-page/${service.slug}/` : `${car.href.replace(/\/$/, "")}/`;
          return (
            <Link key={car.name} href={href} className="tile">
              <img
                src={car.image.src}
                alt={`Photo of ${car.name}, ${model}`}
                width={640}
                height={640}
                loading="lazy"
                decoding="async"
              />
              <span className="cap">
                <strong>{car.name}</strong>
                <span className="model">{model}</span>
                {price != null && <span className="price">Starting at ${price}</span>}
              </span>
            </Link>
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
                  <img src={occasion.image.src} alt={occasion.alt} width={occasion.image.w || 640} height={occasion.image.h || 480} />
                )}
                <strong>{occasion.title}</strong>
                <span>See the cars, the listing price, and what’s included.</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <div className="wrap">
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
