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

export const occasions: {
  slug: string;
  title: string;
  image: Img;
  alt: string;
  /** object-position for cropped views of the photo (home cards, services rows). */
  cardPosition?: string;
  /** object-position for the occasion page hero when a portrait photo is shown as a square. */
  heroPosition?: string;
  /** Extra event photos shown under the intro. The hero image stays separate. */
  pictures?: Img[];
  /** One line on the home-page card. Different for each occasion. */
  blurb: string;
  text: string;
}[] = [
  {
    slug: "weddings",
    title: "Weddings",
    image: photo("/images/occasion-weddings-packard.webp"),
    alt: "Bride and groom on the back of a light-blue classic Packard convertible",
    /** Portrait photo in a 4:3 card: keep the couple and the spare-tire emblem in frame. */
    cardPosition: "center 70%",
    /** Square hero trims the trees above and keeps the couple through the license plate. */
    heroPosition: "center 85%",
    blurb: "A chauffeur for the ceremony exit, the photos, and the ride to the reception.",
    pictures: [
      {
        src: "/images/cars-elsa_gallery_21.webp",
        alt: "Newlyweds waving from Elsa, our 1954 Packard Caribbean, during a sparkler send-off",
        w: 1067,
        h: 1600,
        file: "cars-elsa_gallery_21.jpg",
      },
      {
        src: "/images/cars-elsa_gallery_22.webp",
        alt: "Newlyweds sharing a kiss in Elsa, our 1954 Packard Caribbean, on a downtown street at night",
        w: 1004,
        h: 1567,
        file: "cars-elsa_gallery_22.png",
      },
      {
        src: "/images/cars-carmen_gallery_22.webp",
        alt: "Laughing newlyweds holding hands beside Carmen, our white Cadillac convertible, at night",
        w: 1200,
        h: 1600,
        file: "cars-carmen_gallery_22.jpg",
      },
      {
        src: "/images/cars-carmen_gallery_23.webp",
        alt: "Newlyweds sharing a kiss in the front seat of Carmen, our white Cadillac convertible",
        w: 1200,
        h: 1600,
        file: "cars-carmen_gallery_23.png",
      },
      {
        src: "/images/occasion-weddings-01.webp",
        alt: "Couple kissing in front of Veronica, our black 1957 Chevrolet Bel Air, at night with fireworks",
        w: 1066,
        h: 1600,
        file: "occasion-weddings-01.jpg",
      },
      {
        src: "/images/occasion-weddings-02.webp",
        alt: "Couple riding in Elsa, our white Packard Caribbean convertible, at dusk",
        w: 590,
        h: 422,
        file: "occasion-weddings-02.jpg",
      },
      {
        src: "/images/occasion-weddings-03.webp",
        alt: "Couple with Brenda, our blue 1961 Buick Invicta convertible, in front of a museum",
        w: 1600,
        h: 1068,
        file: "occasion-weddings-03.jpg",
      },
      {
        src: "/images/occasion-weddings-04.webp",
        alt: "Couple on the back of Phyllis, our 1941 Buick Super convertible, downtown at night",
        w: 1066,
        h: 1600,
        file: "occasion-weddings-04.jpg",
      },
      {
        src: "/images/occasion-weddings-05.webp",
        alt: "Just Married couple on Phyllis, our 1941 Buick Super convertible, with sparklers",
        w: 1066,
        h: 1600,
        file: "occasion-weddings-05.jpg",
      },
      {
        src: "/images/occasion-weddings-06.webp",
        alt: "Couple kissing beside a black Packard with sparkler fountains",
        w: 1600,
        h: 1066,
        file: "occasion-weddings-06.jpg",
      },
    ],
    text: "Every rental includes a professional chauffeur. You don’t drive the car yourself. Drivers know wedding timelines and photo stops. Photo-only bookings are available, not just transportation. Weddings make up the majority of bookings, typically for the ceremony exit or reception getaway.",
  },
  {
    slug: "photo-shoots",
    title: "Photo Shoots",
    image: photo("/images/cars-sylvia_gallery_07.webp"),
    alt: "Couple posing with Sylvia, the silver 1970 Chevelle SS, during a photo session",
    blurb: "Book the car for pictures only. The chauffeur stays with it while you shoot.",
    pictures: [
      {
        src: "/images/occasion-photo-shoots-01.webp",
        alt: "Portrait session on the trunk of Rosie, our red 1960 Corvette, at sunset",
        w: 1067,
        h: 1600,
        file: "occasion-photo-shoots-01.jpg",
      },
      {
        src: "/images/occasion-photo-shoots-02.webp",
        alt: "Sunset photo shoot beside Rosie, our red 1960 Corvette, in a field",
        w: 1200,
        h: 1600,
        file: "occasion-photo-shoots-02.jpg",
      },
      {
        src: "/images/occasion-photo-shoots-03.webp",
        alt: "Photographer and lighting crew shooting Black Betty, our black 1950 Ford Custom Deluxe convertible, downtown",
        w: 1200,
        h: 1600,
        file: "occasion-photo-shoots-03.jpg",
      },
      {
        src: "/images/occasion-photo-shoots-04.webp",
        alt: "Couple posing at the chrome grille of Phyllis, our cream 1941 Buick Super convertible",
        w: 1068,
        h: 1600,
        file: "occasion-photo-shoots-04.jpg",
      },
      {
        src: "/images/occasion-photo-shoots-05.webp",
        alt: "Editorial photo shoot with Phyllis, our cream 1941 Buick Super convertible, in downtown Shreveport",
        w: 1600,
        h: 1600,
        file: "occasion-photo-shoots-05.jpg",
      },
      {
        src: "/images/occasion-photo-shoots-06.webp",
        alt: "Family portrait with Brenda, our turquoise 1961 Buick Invicta convertible, in a meadow",
        w: 1600,
        h: 1065,
        file: "occasion-photo-shoots-06.jpg",
      },
    ],
    text: "Our classic car rental photo sessions are the perfect way to capture lasting memories. We provide classic cars that create the perfect backdrop for your pictures, whether it's for a wedding, engagement, senior or any other special occasion. Photo-only bookings are available, not just transportation.",
  },
  {
    slug: "parades-and-special-events",
    title: "Parades and Special Events",
    image: photo("/images/occasion-parades-homecoming.webp"),
    alt: "Homecoming queen waving from a blue classic convertible in a downtown parade",
    /** Wide photo in a 4:3 card: keep the car's front, the flowers, and the waving rider in frame. */
    cardPosition: "5% center",
    blurb: "An open car and a driver for homecoming, festivals, and other parades.",
    pictures: [
      {
        src: "/images/occasion-parades-01.webp",
        alt: "Phyllis, our cream 1941 Buick Super convertible, decorated with roses, pearls and a crown for a parade",
        w: 1600,
        h: 1200,
        file: "occasion-parades-01.jpg",
      },
      {
        src: "/images/occasion-parades-02.webp",
        alt: "Brenda, our blue 1961 Buick Invicta convertible, carrying Miss Louisiana Tech University in a parade",
        w: 1600,
        h: 1200,
        file: "occasion-parades-02.jpg",
      },
      {
        src: "/images/occasion-parades-03.webp",
        alt: "Elsa, our white and blue 1954 Packard Caribbean convertible, carrying a homecoming court member",
        w: 1600,
        h: 1200,
        file: "occasion-parades-03.jpg",
      },
      {
        src: "/images/occasion-parades-04.webp",
        alt: "Rosie, our red and white 1960 Corvette, carrying a homecoming maid in a parade",
        w: 1200,
        h: 1600,
        file: "occasion-parades-04.jpg",
      },
      {
        src: "/images/occasion-parades-05.webp",
        alt: "Brenda, our blue 1961 Buick Invicta convertible, carrying a pageant contestant in a parade",
        w: 1600,
        h: 1200,
        file: "occasion-parades-05.jpg",
      },
    ],
    text: "Our classic car rental service for parades is the perfect way to make a grand entrance. Whether you're attending a homecoming parade, other homecoming parades, a festival parade, or a beauty pageant, the car and driver are part of the rental. Other special occasions use the same cars and the same listing price.",
  },
];

export function occasionBySlug(slug: string) {
  return occasions.find((item) => item.slug === slug);
}
