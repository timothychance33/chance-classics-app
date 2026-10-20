/**
 * Drivers on the About page. Each person has one image path.
 * The card has no picture until that file exists under public/.
 * Set image to "" to keep the card text-only, like Eric's.
 */
export type AboutDriver = {
  name: string;
  role: string;
  text: string;
  image: string;
};

export const aboutDrivers: AboutDriver[] = [
  {
    name: "Zack",
    role: "Driver and mechanic",
    text: "Zack drives and is one of our mechanics, so he knows these cars inside and out.",
    image: "/images/about_zack_01.webp",
  },
  {
    name: "Edward",
    role: "Driver",
    text: "Edward is a young guy who loves old cars and great conversation.",
    image: "/images/about_edward_01.webp",
  },
  {
    name: "Ed",
    role: "Driver",
    text: "Ed is a seasoned car guy who loves taking care of his passengers.",
    image: "/images/about_ed_01.webp",
  },
  {
    name: "Benny",
    role: "Driver",
    text: "Benny is a bit of a classic himself. He's retired and does this for the fun of it.",
    image: "/images/about_benny_01.webp",
  },
];
