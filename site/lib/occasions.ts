import homeData from "@/data/home.json";
import servicesPageData from "@/data/services-page.json";
import type { Img } from "@/lib/content";

function collect(value: unknown, into: Img[]) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => collect(item, into));
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.src === "string" && record.src.startsWith("/images/")) into.push(record as Img);
  Object.values(record).forEach((item) => collect(item, into));
}

const catalog: Img[] = [];
collect(homeData, catalog);
collect(servicesPageData, catalog);

function photo(src: string) {
  const image = catalog.find((item) => item.src === src);
  if (!image) throw new Error(`Missing occasion image ${src}`);
  return image;
}

export const occasions = [
  {
    slug: "weddings",
    title: "Weddings",
    image: photo("/images/home_main_08.webp"),
    alt: "A bride and groom riding in a classic convertible",
    text: "Every rental includes a professional chauffeur. You don’t drive the car yourself. Drivers know wedding timelines and photo stops. Photo-only bookings are available, not just transportation. Weddings make up the majority of bookings, typically for the ceremony exit or reception getaway.",
  },
  {
    slug: "prom-and-homecoming",
    title: "Prom and Homecoming",
    image: null,
    alt: "",
    text: "Chance Classics provides vintage car rentals for proms and for homecoming parades. The car comes with a chauffeur. You don’t drive it yourself.",
  },
  {
    slug: "photo-shoots",
    title: "Photo Shoots",
    image: photo("/images/home_main_02.webp"),
    alt: "A couple posing on a classic car while a photographer takes their picture",
    text: "Our classic car rental photo sessions are the perfect way to capture lasting memories. We provide classic cars that create the perfect backdrop for your pictures, whether it's for a wedding, engagement, senior or any other special occasion. Photo-only bookings are available, not just transportation.",
  },
  {
    slug: "parades-and-special-events",
    title: "Parades and Special Events",
    image: photo("/images/services_photo-sessions_01.webp"),
    alt: "A classic car in a parade",
    text: "Our classic car rental service for parades is the perfect way to make a grand entrance. Whether you're attending a homecoming parade, a festival parade, or a beauty pageant, the car and driver are part of the rental. Other special occasions use the same cars and the same listing price.",
  },
] as const;

export function occasionBySlug(slug: string) {
  return occasions.find((item) => item.slug === slug);
}
