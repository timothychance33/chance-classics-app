/**
 * Visible FAQ answers are facts already on the site or in the booking rules.
 * An empty answer does not render and is not included in FAQPage JSON-LD.
 *
 * Mileage, deposit, extra hour, and the 7-day lead: site/lib/booking-rules.ts
 * and the service listings. Passenger counts: site/data/carFacts.ts
 * (from the client agreements). Convertible parade list: isConvertible in
 * site/lib/content.ts. Decorations: the wedding-cost blog post in
 * site/lib/content.ts. Rain policy, parade signs/magnets, and any parade
 * lead time beyond 7 days are unknown and stay blank.
 */

export type FaqItem = { q: string; a: string };

export const faqItems: FaqItem[] = [
  {
    q: "What areas does Chance Classics serve?",
    a: "Chance Classics is based in Benton and serves Shreveport, Bossier, and Northwest Louisiana. A pickup 30 miles or less from Benton has no mileage charge. Farther than that, the car is trailered and the charge is $3 per mile for the whole distance, from mile one.",
  },
  {
    q: "How many classic cars does Chance Classics have?",
    a: "The fleet on this site is 10 vintage cars. Each rental includes a chauffeur.",
  },
  {
    q: "What occasions do you provide cars for?",
    a: "Weddings, photo shoots, parades, and other special occasions. Homecoming is booked as a parade. Weddings are most of the bookings, usually for the ceremony exit or the reception getaway. Photo-only time is available too.",
  },
  {
    q: "How much does it cost to rent a classic car?",
    a: "Published starting prices are on each car. The first 2 hours are that starting price. Each additional hour is $100. A $250 deposit is due when you book, and the balance is billed separately. Mileage is separate when the pickup is more than 30 miles from Benton.",
  },
  {
    q: "How far in advance should I book?",
    a: "Reservations have to be made at least 7 days ahead.",
  },
  {
    q: "Does the rental include a driver?",
    a: "Yes. Every rental includes a chauffeur. You don’t drive the car.",
  },
  {
    q: "What happens if it rains on my event day?",
    a: "",
  },
  {
    q: "Can I use the car just for photos, not transportation?",
    a: "Yes. Photo-only bookings are available.",
  },
  {
    q: "How do I book a car with Chance Classics?",
    a: "Book online at chanceclassics.com/book-online, or call (318) 344-5001.",
  },
  {
    q: "Are decorations allowed?",
    a: "Decorations are allowed. The client brings them.",
  },
  {
    q: "How many passengers can ride in each car?",
    a: "These counts are passengers besides the chauffeur. Patsy 6. Bonnie 4. Phyllis, Black Betty, Elsa, Veronica, Brenda, Sylvia, and Carmen 3 each. Rosie 1.",
  },
  {
    q: "How does mileage work?",
    a: "A pickup 30 miles or less from Benton is $0. Past 30 miles, the car is trailered and the charge is $3 per mile for the entire distance, from mile one. 25 miles is $0. 45 miles is 45 × $3 = $135.",
  },
  {
    q: "What cars can do a parade?",
    a: "Parades use convertibles: Phyllis, Black Betty, Elsa, Rosie, Brenda, and Carmen. Homecoming is booked as a parade. The same 7-day minimum applies.",
  },
  {
    q: "Can we put signs or magnets on the car for a parade?",
    a: "",
  },
  {
    q: "How far ahead does a parade need to be booked, beyond the 7-day minimum?",
    a: "",
  },
  {
    q: "Why is the rental chauffeur-only?",
    a: "Customers never drive these cars. A chauffeur is part of every rental.",
  },
  {
    q: "How do the deposit and the balance work?",
    a: "A $250 non-refundable deposit is due when you book. The balance is billed separately. Time after the first 2 hours is $100 an hour.",
  },
];

export function visibleFaqs() {
  return faqItems.filter((item) => item.a.trim());
}
