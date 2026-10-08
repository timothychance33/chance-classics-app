import type { Metadata } from "next";
import servicesData from "@/data/services.json";
import galleriesData from "@/data/galleries.json";
import agreementsData from "@/data/agreements.json";
import homeData from "@/data/home.json";
import aboutData from "@/data/about.json";
import servicesPageData from "@/data/services-page.json";
import portfolioData from "@/data/portfolio.json";
import thanksData from "@/data/thanks.json";

export const SITE_URL = "https://www.chanceclassics.com";
export const FACEBOOK = "https://www.facebook.com/profile.php?id=100094754298768";
export const EMAIL = "chanceclassics@gmail.com";
export const PHONE_DISPLAY = "318-344-5001";
export const PHONE_TEL = "+13183445001";
export const ADDRESS = "118 5th St, Benton, LA, USA";
export const OG_IMAGE = "/images/home_main_02.webp";
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

export const portfolioOrder = byModelYear(
  Object.values(galleries),
  (gallery) => gallery.subtitle,
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

export function pageMeta(opts: {
  title: string;
  description?: string;
  path: string;
  image?: string;
  noindex?: boolean;
}): Metadata {
  const description = opts.description || undefined;
  const url = `${SITE_URL}${opts.path === "/" ? "/" : opts.path}`;
  const image = opts.image || OG_IMAGE;
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
      images: [{ url: image, alt: "Chance Classics" }],
    },
  };
}

export const quoteServices = byModelYear(
  [
    "Patsy - 1953 Packard Limo",
    "Brenda - 1961 Buick Invicta Convertible",
    "Phyllis - 1941 Buick Super Convertible",
    "Rosie - 1960 Chevrolet Corvette",
    "Black Betty - 1950 Ford Custom Convertible",
    "Veronica - 1957 Chevrolet Bel Air",
    "Sylvia - 1970 Chevelle SS454",
    "Elsa - 1954 Packard Caribbean (White)",
    "Carmen - 1976 Cadillac Eldorado",
    "Bonnie - 1937 Cadillac Fleetwood 75",
  ],
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
        html: "Chance Classics operates a fleet of 10 vintage automobiles across Louisiana, giving couples more style options than a typical single-car rental company — from Bonnie (a 1939 Cadillac Sedan) to Carmen (a 1976 Cadillac Convertible) — each with a professional chauffeur included.",
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
        html: 'Because pricing depends on your specific date, venue, and car choice, the most accurate way to get a number is to request a quote directly — you can do that at <a href="https://www.chanceclassics.com/">chanceclassics.com</a> or by calling <a href="tel:+13183445001">(318) 344-5001</a>.',
      },
    ],
  },
];

export function postBySlug(slug: string) {
  return posts.find((p) => p.slug === slug);
}
