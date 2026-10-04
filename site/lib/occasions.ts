import { readFileSync } from "node:fs";
import path from "node:path";
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

function webpSize(buf: Buffer) {
  const format = buf.toString("ascii", 12, 16);
  if (format === "VP8 " && buf.length >= 30) {
    return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  if (format === "VP8L" && buf.length >= 25) {
    const b0 = buf[21];
    const b1 = buf[22];
    const b2 = buf[23];
    const b3 = buf[24];
    return {
      w: 1 + (((b1 & 0x3f) << 8) | b0),
      h: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (format === "VP8X" && buf.length >= 30) {
    return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  }
  return null;
}

/** Occasion art can be any file in public/images, including gallery shots that are not on the home or services JSON. */
function photo(src: string): Img {
  const image = catalog.find((item) => item.src === src);
  if (image) return image;
  if (!src.startsWith("/images/") || src.includes("..")) throw new Error(`Missing occasion image ${src}`);
  const file = path.join(process.cwd(), "public", src.slice(1));
  const buf = readFileSync(file);
  const size = buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP" ? webpSize(buf) : null;
  return { src, alt: "", w: size?.w || 1600, h: size?.h || 1066 };
}

export const occasions = [
  {
    slug: "weddings",
    title: "Weddings",
    image: photo("/images/cars-phyllis_gallery_13.webp"),
    alt: "Bride and groom beside Phyllis, the 1941 Buick convertible, as guests wave sparklers",
    text: "Every rental includes a professional chauffeur. You don’t drive the car yourself. Drivers know wedding timelines and photo stops. Photo-only bookings are available, not just transportation. Weddings make up the majority of bookings, typically for the ceremony exit or reception getaway.",
  },
  {
    slug: "photo-shoots",
    title: "Photo Shoots",
    image: photo("/images/cars-sylvia_gallery_07.webp"),
    alt: "Couple posing with Sylvia, the silver 1970 Chevelle SS, during a photo session",
    text: "Our classic car rental photo sessions are the perfect way to capture lasting memories. We provide classic cars that create the perfect backdrop for your pictures, whether it's for a wedding, engagement, senior or any other special occasion. Photo-only bookings are available, not just transportation.",
  },
  {
    slug: "parades-and-special-events",
    title: "Parades and Special Events",
    image: photo("/images/services_weddings_02.webp"),
    alt: "Rosie, the red 1959 Corvette, carrying a homecoming court maid in a parade",
    text: "Our classic car rental service for parades is the perfect way to make a grand entrance. Whether you're attending a homecoming parade, other homecoming parades, a festival parade, or a beauty pageant, the car and driver are part of the rental. Other special occasions use the same cars and the same listing price.",
  },
] as const;

export function occasionBySlug(slug: string) {
  return occasions.find((item) => item.slug === slug);
}
