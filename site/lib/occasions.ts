import { servicePhotos } from "@/lib/content";

export const occasions = [
  {
    slug: "weddings",
    title: "Weddings",
    image: servicePhotos[0],
    alt: "A wedding couple with a classic car",
    text: "Every rental includes a professional chauffeur. You don’t drive the car yourself. Drivers know wedding timelines and photo stops. Photo-only bookings are available, not just transportation. Weddings make up the majority of bookings, typically for the ceremony exit or reception getaway.",
  },
  {
    slug: "prom-and-homecoming",
    title: "Prom and Homecoming",
    image: servicePhotos[2],
    alt: "A classic car in a parade",
    text: "Chance Classics provides vintage car rentals for proms and for homecoming parades. The car comes with a chauffeur. You don’t drive it yourself.",
  },
  {
    slug: "photo-shoots",
    title: "Photo Shoots",
    image: servicePhotos[1],
    alt: "Classic car set up for a photo session",
    text: "Our classic car rental photo sessions are the perfect way to capture lasting memories. We provide classic cars that create the perfect backdrop for your pictures, whether it's for a wedding, engagement, senior or any other special occasion. Photo-only bookings are available, not just transportation.",
  },
  {
    slug: "parades-and-special-events",
    title: "Parades and Special Events",
    image: servicePhotos[2],
    alt: "A classic car in a parade",
    text: "Our classic car rental service for parades is the perfect way to make a grand entrance. Whether you're attending a homecoming parade, a festival parade, or a beauty pageant, the car and driver are part of the rental. Other special occasions use the same cars and the same listing price.",
  },
] as const;

export function occasionBySlug(slug: string) {
  return occasions.find((item) => item.slug === slug);
}
