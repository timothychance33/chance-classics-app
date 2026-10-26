import type { Metadata } from "next";
import { carIdentity, factsForCar } from "@/data/carFacts";
import servicesData from "@/data/services.json";
import galleriesData from "@/data/galleries.json";
import agreementsData from "@/data/agreements.json";
import homeData from "@/data/home.json";
import aboutData from "@/data/about.json";
import servicesPageData from "@/data/services-page.json";
import portfolioData from "@/data/portfolio.json";
import thanksData from "@/data/thanks.json";

/** Apex host. www.chanceclassics.com redirects here. */
export const SITE_URL = "https://chanceclassics.com";
export const FACEBOOK = "https://www.facebook.com/profile.php?id=100094754298768";
export const EMAIL = "chanceclassics@gmail.com";
export const PHONE_DISPLAY = "318-344-5001";
export const PHONE_TEL = "+13183445001";
export const ADDRESS = "118 5th St, Benton, LA, USA";

const sharePhotos = {
  phyllis: {
    src: "/images/og-phyllis.jpg",
    alt: "Phyllis, the cream 1941 Buick Super convertible, on green grass",
  },
  brenda: {
    src: "/images/og-brenda.jpg",
    alt: "Brenda, the blue 1961 Buick Invicta convertible, in a green field",
  },
  elsa: {
    src: "/images/og-elsa.jpg",
    alt: "Elsa, the white and blue 1954 Packard Caribbean convertible, in front of a columned building",
  },
} as const;

type ShareCar = keyof typeof sharePhotos;

/** Sitewide iMessage, Facebook, and Twitter image. Set to "brenda" or "elsa" to swap. */
export const OG_CHOICE: ShareCar = "phyllis";
export const OG_IMAGE = sharePhotos[OG_CHOICE].src;
export const OG_IMAGE_ALT = sharePhotos[OG_CHOICE].alt;
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

export function defaultShareImage() {
  return {
    url: `${SITE_URL}${OG_IMAGE}`,
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    alt: OG_IMAGE_ALT,
  };
}
export const LOGO = "/images/logo_chance-classics-shield_01.webp";
export const FACEBOOK_ICON = "/images/icon_facebook_01.webp";

export type Img = { src: string; alt: string; w: number; h: number; file?: string };

export type Service = {
  car: string;
  name: string;
  tagLine: string;
  slug: string;
  oldSlugs: string[];
  price: number;
  description: string;
  portfolioSlug: string;
  image: Img;
  gallery: Img[];
  servicePageUrl: string;
  bookingCalendarUrl: string;
  wixBookUrl: string;
};

export type Gallery = {
  slug: string;
  title: string;
  subtitle: string;
  hero: Img | null;
  images: Img[];
  bookable?: boolean;
  note?: string;
};

export type AgreementBlock =
  | { type: "h1"; text: string }
  | { type: "p"; text: string }
  | { type: "link"; text: string; href: string };

export type Agreement = {
  slug: string;
  name: string;
  oldPath: string;
  title: string;
  blocks: AgreementBlock[];
};

/** First model year in a name or caption. Cars with no year sort after the dated ones. */
export function modelYear(text: string | null | undefined): number | null {
  const match = String(text || "").match(/\b(?:18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

/** Oldest model year first. Same year, then car name A to Z. */
export function byModelYear<T>(items: readonly T[], label: (item: T) => string, name: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const yearA = modelYear(label(a));
    const yearB = modelYear(label(b));
    if (yearA == null && yearB == null) return name(a).localeCompare(name(b), "en");
    if (yearA == null) return 1;
    if (yearB == null) return -1;
    if (yearA !== yearB) return yearA - yearB;
    return name(a).localeCompare(name(b), "en");
  });
}

export const services = byModelYear(
  servicesData as Service[],
  (service) => service.name,
  (service) => service.car,
);

/** Veronica and Sylvia are 2-door hardtops. Rosie is a 2-seat Corvette. They stay in the fleet. */
const WEDDING_CARS_EXCLUDED = new Set(["Veronica", "Sylvia", "Rosie"]);

/** Catalog names don't say "convertible" for Rosie, but the 1960 Corvette is an open roadster. */
export function isConvertible(service: Pick<Service, "car" | "name" | "tagLine" | "slug">) {
  const text = `${service.name} ${service.tagLine} ${service.slug}`.toLowerCase();
  if (text.includes("convertible")) return true;
  return service.car === "Rosie";
}

/** Occasion pages filter the fleet. Book Online, car pages, and other occasions keep every car. */
export function carsForOccasion(slug: string) {
  if (slug === "weddings") return services.filter((service) => !WEDDING_CARS_EXCLUDED.has(service.car));
  if (slug === "parades-and-special-events") return services.filter((service) => isConvertible(service));
  return services;
}
export const galleries = galleriesData as Record<string, Gallery>;
export const agreements = agreementsData as Record<string, Agreement>;
export const home = homeData as {
  hero: Img;
  fleet: { name: string; caption: string; href: string; image: Img }[];
  portrait: Img;
  wedding: Img;
};
export const aboutImages = (aboutData as { images: Img[] }).images;
export const servicePhotos = servicesPageData as Img[];
export const portfolioCovers = portfolioData as { alt: string; href: string; image: Img }[];
export const thanksImage = thanksData as Img;

/** Year, make, and model Tim confirmed in carFacts. Empty when that car has no facts row. */
export function fleetModel(car: string) {
  const facts = factsForCar(car);
  return facts ? carIdentity(facts) : "";
}

/** "Phyllis - 1941 Buick Super" from the fleet facts, or the fallback line. */
export function fleetTag(car: string, fallback = "") {
  const model = fleetModel(car);
  return model ? `${car} - ${model}` : fallback;
}

export const portfolioOrder = byModelYear(
  Object.values(galleries).filter((gallery) => gallery.slug !== "others"),
  (gallery) => fleetModel(gallery.title) || gallery.subtitle,
  (gallery) => gallery.title,
).map((gallery) => gallery.slug);

/** Terms submenu, in the live menu order. */
export const termsNav = [
  { label: "Patsy", slug: "patsy" },
  { label: "Phyllis", slug: "phyllis" },
  { label: "Brenda", slug: "brenda" },
  { label: "Bonnie", slug: "bonnie" },
  { label: "Elsa", slug: "elsa" },
  { label: "Black Betty", slug: "black-betty" },
  { label: "Carmen", slug: "carmen" },
  { label: "Rosie", slug: "rosie" },
  { label: "Veronica", slug: "veronica" },
  { label: "Sylvia", slug: "sylvia" },
];

export function serviceBySlug(slug: string) {
  return services.find((s) => s.slug === slug);
}

export function serviceByPortfolio(slug: string) {
  return services.find((s) => s.portfolioSlug === slug);
}

/** Booking description with the capture's known price and spelling fixes. */
export function serviceDescription(service: Service) {
  let text = service.description
    .replaceAll("seperately", "separately")
    .replaceAll("cahrged", "charged")
    .replaceAll(
      "(chauffeured) at a location within 30 miles of Benton, LA (locations outside of the radius will be charged an additional $3/mile)",
      "(chauffeured). Pickups more than 30 miles from Benton are charged $3 per mile for the full distance (trailer transport)",
    );
  if (service.car === "Elsa") text = text.replace("$500 for 2 hour", "$600 for 2 hour");
  if (service.car === "Rosie") text = text.replace("$500 for 2 hour", "$700 for 2 hour");
  return text.replace(/\s+/g, " ").trim();
}

export function fixCopy(text: string) {
  return text
    .replaceAll("seperately", "separately")
    .replaceAll("cahrged", "charged")
    .replaceAll("idication", "indication");
}

function absoluteUrl(path: string) {
  if (!path || path === "/") return `${SITE_URL}/`;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalized.endsWith("/") ? normalized : `${normalized}/`}`;
}

export function pageMeta(opts: {
  title: string;
  description?: string;
  path: string;
  image?: string;
  imageAlt?: string;
  noindex?: boolean;
}): Metadata {
  const description = opts.description || undefined;
  const url = absoluteUrl(opts.path);
  const customImage = opts.image;
  const imageAlt = opts.imageAlt || (customImage ? "Chance Classics" : OG_IMAGE_ALT);
  const share = customImage ? { url: customImage, alt: imageAlt } : defaultShareImage();
  return {
    title: opts.title,
    description,
    alternates: { canonical: url },
    ...(opts.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: opts.title,
      description,
      url,
      siteName: "Chance Classics, Classic Car Rental",
      type: "website",
      images: [share],
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description,
      images: [share.url],
    },
  };
}

export const quoteServices = byModelYear(
  services.map((service) => fleetTag(service.car, `${service.car} - ${service.name}`)),
  (option) => option,
  (option) => option.split(" - ")[0].trim(),
);

export type PostBlock =
  | { type: "p"; html: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] };

export type Post = {
  slug: string;
  title: string;
  description: string;
  date: string;
  dateIso: string;
  read: string;
  views: string;
  blocks: PostBlock[];
};

export const posts: Post[] = [
  {
    slug: "prom-car-rental-tips",
    title: "Prom Car Rental Tips for Northwest Louisiana",
    description:
      "What to sort out before you book a chauffeured classic car for prom around Benton, Shreveport, and Bossier: passengers, an open or closed car, time, and the pickup address.",
    date: "Oct 20, 2026",
    dateIso: "2026-10-20",
    read: "3 min read",
    views: "0 views",
    blocks: [
      {
        type: "p",
        html: "A prom car from Chance Classics is a chauffeured rental, the same way a wedding or a photo shoot is. You pick the car, we bring it to the address you give us, and a driver stays with it. The students do not drive.",
      },
      { type: "h3", text: "Match the car to the number of riders" },
      {
        type: "p",
        html: "Most of the convertibles seat 3 passengers besides the chauffeur. Patsy, the 1953 Packard Patrician Limousine, and Bonnie, the 1937 Cadillac Fleetwood Series 75, each seat 6. Rosie, the 1960 Chevrolet Corvette, is a two-seat roadster: one passenger besides the driver. Count the people who actually need to ride before you choose from a photo.",
      },
      { type: "h3", text: "Open car or closed car" },
      {
        type: "p",
        html: 'A convertible is the picture most people want for prom. Phyllis (1941 Buick Super), Black Betty (1950 Ford Custom Deluxe), Elsa (1954 Packard Caribbean), Brenda (1961 Buick Invicta), and Carmen (1976 Cadillac Eldorado) are the open cars, along with Rosie. Veronica, the 1957 Chevrolet Bel Air, and Sylvia, the 1970 Chevrolet Chevelle SS454, are coupes if you would rather be out of the weather. Say so when you <a href="/quoterequest/">request a quote</a> if rain is a concern.',
      },
      { type: "h3", text: "Time and distance" },
      {
        type: "ul",
        items: [
          "The listed price covers the first 2 hours. Each extra hour is $100.",
          "A pickup 30 miles or less from Benton has no mileage charge.",
          "Farther than that, the car is trailered and the charge is $3 per mile for the full distance.",
          "Reservations have to be made at least 7 days ahead. A $250 non-refundable retainer holds the time.",
          "Prom weekends in the spring can overlap. If you want a specific car, ask while it is still open.",
        ],
      },
      { type: "h3", text: "Pictures, not just the ride" },
      {
        type: "p",
        html: 'You can book the car for photos and not only for the drive. Say so on the quote so the 2 hours cover the pictures you want. Decorations are allowed, and you bring them. The shop is in Benton. Call or text <a href="tel:+13183445001">318-344-5001</a>, or start with <a href="/quoterequest/">a quote</a>.',
      },
    ],
  },
  {
    slug: "homecoming-parade-car-tips",
    title: "Homecoming Parade Car Tips",
    description:
      "How to book an open classic car and driver for a homecoming parade out of Benton: which cars are convertibles, how long to reserve, and what to tell us about the route.",
    date: "Oct 20, 2026",
    dateIso: "2026-10-20",
    read: "3 min read",
    views: "0 views",
    blocks: [
      {
        type: "p",
        html: "A homecoming parade around here is a lineup, a short route, and someone waving from an open car. Chance Classics sends a chauffeur with the car. You do not drive it in the parade.",
      },
      { type: "h3", text: "Ask for a convertible" },
      {
        type: "p",
        html: 'Parade bookings use the open cars: Phyllis, the 1941 Buick Super; Black Betty, the 1950 Ford Custom Deluxe; Elsa, the 1954 Packard Caribbean; Brenda, the 1961 Buick Invicta; Carmen, the 1976 Cadillac Eldorado; and Rosie, the 1960 Chevrolet Corvette. Rosie seats one passenger besides the chauffeur, so a queen and a court need one of the larger convertibles. Those seat 3 passengers besides the driver. The list is on the <a href="/occasions/parades-and-special-events/">parades page</a>.',
      },
      { type: "h3", text: "Build the time around the lineup" },
      {
        type: "p",
        html: "The listed price is for 2 hours, then $100 for each extra hour. A parade afternoon is often more than the ride itself. The driver has to be in line early, wait through the cars ahead, and roll the route. Tell us where to stage and about how long the parade runs so the booking covers it.",
      },
      { type: "h3", text: "Flowers, signs, and weather" },
      {
        type: "p",
        html: "You can decorate the car. Bring the flowers, the sash, and the signs. An open car stays open in the rain. Ask about a rain plan when you request the quote. If the car you booked is not available, we offer a comparable backup. The rental terms cover delays the driver cannot control, including weather.",
      },
      { type: "h3", text: "Where the car comes from" },
      {
        type: "p",
        html: 'The shop is in Benton. A pickup 30 miles or less from Benton has no mileage charge. Past 30 miles the car is trailered at $3 per mile for the whole distance. Book at least 7 days ahead. Homecoming Fridays in the fall land on the same afternoon, so a specific car can already be taken. Call or text <a href="tel:+13183445001">318-344-5001</a>.',
      },
    ],
  },
  {
    slug: "classic-car-photo-shoot-tips",
    title: "Classic Car Photo Shoot Tips in Benton and Shreveport–Bossier",
    description:
      "How to plan a photo-only classic car rental from Chance Classics: which cars you can book, how the 2 hours work, and what to tell the chauffeur.",
    date: "Oct 20, 2026",
    dateIso: "2026-10-20",
    read: "3 min read",
    views: "0 views",
    blocks: [
      {
        type: "p",
        html: "A photo shoot does not have to be part of a wedding. Chance Classics books the car for pictures only. A chauffeur brings it and stays with it. You do not drive.",
      },
      { type: "h3", text: "Any car in the fleet can sit for photos" },
      {
        type: "p",
        html: 'The <a href="/occasions/weddings/">weddings page</a> lists the cars we send for a ceremony exit. Veronica, Sylvia, and Rosie are not on that list. A <a href="/occasions/photo-shoots/">photo shoot</a> can book any car in the fleet, including those three. Veronica, the 1957 Chevrolet Bel Air, and Sylvia, the 1970 Chevrolet Chevelle SS454, are coupes. Rosie, the 1960 Chevrolet Corvette, is a two-seat roadster. The convertibles, Patsy (the 1953 Packard Patrician Limousine), and Bonnie (the 1937 Cadillac Fleetwood Series 75) are available too. Pick the shape you want in the frame.',
      },
      { type: "h3", text: "Use the two hours on purpose" },
      {
        type: "p",
        html: "The listed price covers 2 hours at the location, then $100 an hour. A pickup 30 miles or less from Benton has no mileage fee. Past that, trailer mileage is $3 per mile for the full distance. Shreveport and Bossier City are the short drives from the Benton shop. A session farther out belongs in the quote so the mileage is priced before you book.",
      },
      { type: "h3", text: "Tell the driver the stops" },
      {
        type: "p",
        html: "The chauffeur can move the car, turn it, and wait while you take pictures. Send the stops with the booking: one lot, a downtown block, a field road. The more stops you add, the more of the 2 hours you spend driving between them. Be at the first spot on time. The car is the car you booked. If it is not available, we offer a comparable backup.",
      },
      { type: "h3", text: "What is included" },
      {
        type: "p",
        html: 'The rental is the car and the chauffeur. Decorations are allowed if you bring them. A photographer is not part of the booking. Call or text <a href="tel:+13183445001">318-344-5001</a>, or <a href="/quoterequest/">request a quote</a> with the date, the car, and the address.',
      },
    ],
  },
  {
    slug: "classic-car-vs-limousine-which-is-right-for-your-wedding",
    title: "Classic Car vs. Limousine: Which Is Right for Your Wedding?",
    description:
      "A classic or vintage car offers a distinctive, photo-worthy look built around a single striking vehicle, while a limousine offers more seating and a more traditional, understated exit.",
    date: "Jul 8, 2026",
    dateIso: "2026-07-08",
    read: "1 min read",
    views: "2 views",
    blocks: [
      {
        type: "p",
        html: "A classic or vintage car offers a distinctive, photo-worthy look built around a single striking vehicle, while a limousine offers more seating and a more traditional, understated exit. The right choice depends on your wedding's style and how many people need to ride.",
      },
      { type: "h3", text: "When a classic car makes sense" },
      {
        type: "ul",
        items: [
          "You want striking, unique wedding photos — a 1940s convertible or vintage sedan photographs very differently than a modern limo",
          "Your wedding has a vintage, rustic, or classic aesthetic",
          "You mainly need transportation for the couple, not a full wedding party",
          "You want the car itself to be part of the “wow” moment at your exit",
        ],
      },
      { type: "h3", text: "When a limousine makes more sense" },
      {
        type: "ul",
        items: [
          "You need to transport 6+ people at once (wedding party, family)",
          "Your venue or logistics call for something more standard and low-profile",
          "Photos of the vehicle itself aren't a priority",
        ],
      },
      { type: "h3", text: "Can you have both?" },
      {
        type: "p",
        html: "Yes — some couples book a classic car for the ceremony exit and photos, then use a separate vehicle or limo for transporting the larger wedding party.",
      },
      { type: "h3", text: "Why couples choose Chance Classics" },
      {
        type: "p",
        html: "Chance Classics operates a fleet of 10 vintage automobiles across Louisiana, giving couples more style options than a typical single-car rental company — from Bonnie (a 1937 Cadillac Fleetwood Series 75) to Carmen (a 1976 Cadillac Eldorado) — each with a professional chauffeur included.",
      },
    ],
  },
  {
    slug: "what-to-look-for-when-booking-a-classic-car-for-your-wedding",
    title: "What to Look for When Booking a Classic Car for Your Wedding",
    description:
      "Choosing a wedding getaway car comes down to four things: the car itself, the driver, what's included in the price, and how far in advance you need to book.",
    date: "Jul 8, 2026",
    dateIso: "2026-07-08",
    read: "1 min read",
    views: "1 view",
    blocks: [
      {
        type: "p",
        html: "Choosing a wedding getaway car comes down to four things: the car itself, the driver, what's included in the price, and how far in advance you need to book. Here's what actually matters at each step.",
      },
      { type: "h3", text: "1. See the car in person or on video first" },
      {
        type: "p",
        html: "Photos on a website can be outdated. Ask whether the car you're considering has recent photos or video, and whether it's the exact vehicle you'll get on your date — some rental companies substitute cars without telling you in advance. At Chance Classics, the car you book is the car you get.",
      },
      { type: "h3", text: "2. Ask who's driving" },
      {
        type: "p",
        html: "A professional chauffeur familiar with wedding timelines makes a real difference — they know to wait quietly during vows, time a grand exit, and work around a photographer's shot list. Every Chance Classics rental includes a chauffeur as part of the price, not an add-on.",
      },
      { type: "h3", text: "3. Understand what happens if plans change" },
      {
        type: "p",
        html: "Weather, timeline shifts, and date changes happen. Ask upfront: What's the rescheduling policy? What if it rains? At Chance Classics, we are understanding and flexible.",
      },
      { type: "h3", text: "4. Book earlier than you think you need to" },
      {
        type: "p",
        html: "Most couples book their classic car rental 2 to 4 months out, but popular dates and specific cars can be reserved a year in advance for peak spring and fall weekends. If you have a specific car in mind for your date, booking early is the only way to guarantee it.",
      },
      { type: "h3", text: "5. Ask what's included in the quoted price" },
      {
        type: "p",
        html: "A quote that looks like a great deal can turn expensive with add-on fees for mileage, extra hours, or setup. Ask for a full breakdown before you book.",
      },
    ],
  },
  {
    slug: "how-much-does-a-wedding-getaway-car-cost-in-louisiana",
    title: "How Much Does a Wedding Getaway Car Cost in Louisiana?",
    description:
      "A classic car rental for a Louisiana wedding typically costs between $500 and $1,500, depending on the vehicle, rental length, and how far the car needs to travel.",
    date: "Jul 8, 2026",
    dateIso: "2026-07-08",
    read: "1 min read",
    views: "29 views",
    blocks: [
      {
        type: "p",
        html: "A classic car rental for a Louisiana wedding typically costs between $500 and $1,500, depending on the vehicle, rental length, and how far the car needs to travel. At Chance Classics, our rentals start at $500 for a standard 2-hour window, with pricing increasing for longer rentals, premium cars, or venues further from Benton/Bossier City/Shreveport.",
      },
      { type: "h3", text: "What affects the price?" },
      {
        type: "ul",
        items: [
          "Vehicle choice. Our more valuble and higher demand cars cost more than others.",
          "Rental duration. A quick photo-and-exit rental costs less than a full-day booking that covers ceremony, photos, and reception.",
          "Distance from Benton. Pickups more than 30 miles from Benton are charged $3 per mile for the full distance (trailer transport).",
          "Season and date. Peak wedding season (spring and fall) books up faster, though pricing itself doesn't change seasonally.",
        ],
      },
      { type: "h3", text: "What's typically included?" },
      {
        type: "p",
        html: "Every Chance Classics rental includes the vehicle, and a professional chauffeur. Any decorations are allowed but must be provided by the client.",
      },
      { type: "h3", text: "Getting an exact quote" },
      {
        type: "p",
        html: 'Because pricing depends on your specific date, venue, and car choice, the most accurate way to get a number is to request a quote directly — you can do that at <a href="https://chanceclassics.com/">chanceclassics.com</a> or by calling <a href="tel:+13183445001">(318) 344-5001</a>.',
      },
    ],
  },
];

export function postBySlug(slug: string) {
  return posts.find((p) => p.slug === slug);
}
