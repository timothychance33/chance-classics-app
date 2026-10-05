import {
  addDays,
  bookingSource,
  earliestBookableDate,
  mileageCharge,
  openStartTimes,
  quoteCheckoutLines,
  quoteCheckoutMoney,
  quoteLinkOpen,
  quoteRequestRecord,
  dayOfContactColumns,
  dayOfContactNotes,
  quoteTotal,
  rangesOverlap,
  validateBooking,
  validateDayOfContact,
} from "../lib/booking-rules.ts";

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message);
}

const busy = [{ start: "10:00", end: "12:00" }];
const open = openStartTimes(2, busy);
assert(!open.includes("10:00") && !open.includes("11:00") && !open.includes("11:30"), "overlap hidden");
assert(open.includes("08:00") && open.includes("12:00"), "edges stay open");
assert(rangesOverlap(60, 120, 90, 150) && !rangesOverlap(60, 120, 120, 180), "range math");

const money = quoteTotal(500, 4);
assert(money.listing === 700 && money.total === 700 && money.deposit === 250 && money.balance === 450, "listing price");
const withMileage = quoteTotal(500, 2, 180);
assert(withMileage.deposit === 250 && withMileage.balance === 430 && withMileage.total === 680, "mileage stays on the balance");

assert(mileageCharge(25).miles === 25 && mileageCharge(25).fee === 0, "25 has no fee");
assert(mileageCharge(30).miles === 30 && mileageCharge(30).fee === 0, "30 has no fee");
assert(mileageCharge(30.2).miles === 31 && mileageCharge(30.2).fee === 93, "30.2 is $93");
assert(mileageCharge(31).miles === 31 && mileageCharge(31).fee === 93, "31 is $93");
assert(mileageCharge(60).miles === 60 && mileageCharge(60).fee === 180, "60 is $180");

const saved = quoteRequestRecord({
  firstName: "Emily",
  lastName: "Smith",
  email: "emily@example.com",
  phone: "3185550100",
  service: "Patsy - 1953 Packard Limo",
  eventType: "Wedding",
  when: "2026-11-14T14:00",
  pickup: "1001 Airport Dr, Shreveport, LA",
  dropoff: "200 Crockett St, Shreveport, LA",
  details: "Photos after the ceremony",
  planner: "",
  heard: "Google / Search Engine",
});
assert(saved.status === "new" && saved.event_date === "2026-11-14" && saved.event_time === "14:00", "quote request date");
assert(saved.event_location === "1001 Airport Dr, Shreveport, LA" && saved.details.includes("Drop-off: 200 Crockett St"), "drop-off is stored for the driver");
assert(!saved.details.includes("fee"), "a new request does not invent a price");

const linkNow = new Date("2026-10-11T00:00:00Z");
assert(quoteLinkOpen({ status: "sent", book_expires_at: "2026-10-18T00:00:00Z" }, linkNow).ok, "link inside 7 days");
assert(!quoteLinkOpen({ status: "sent", created_at: "2026-10-04T00:00:00Z" }, new Date("2026-10-12T00:00:00Z")).ok, "default 7 days expires");
assert(!quoteLinkOpen({ status: "booked", booking_id: "b1", book_expires_at: "2026-10-18T00:00:00Z" }, linkNow).ok, "used link is closed");
const pay = quoteCheckoutMoney(680);
assert(pay.deposit === 250 && pay.balance === 430 && pay.total === 680, "quote deposit stays 250");
const lines = quoteCheckoutLines({
  car_name: "Patsy",
  base_rate: 500,
  overage: 0,
  travel: 180,
  miles: 60,
  hotel_fee: 0,
  tax: 68,
  line_items: [{ label: "Flowers", amount: 40 }],
});
assert(lines.some((line) => line.label.includes("60 mi") && line.amount === 180), "mileage fee is the pickup distance");
assert(lines.some((line) => line.label === "Flowers" && line.amount === 40), "custom line item");
assert(!lines.some((line) => /drop-off/i.test(line.label)), "drop-off is not a price line");

const early = validateBooking({
  car: "1953-packard-limo",
  date: addDays(earliestBookableDate(new Date("2026-10-04T18:00:00Z")), -1),
  start: "10:00",
  hours: 2,
  name: "Test Guest",
  email: "guest@example.com",
  phone: "3185550100",
  occasion: "Wedding",
  pickup: "118 5th St, Benton, LA",
  dropoff: "Same",
  dayOfName: "Jordan Hale",
  dayOfPhone: "3185550199",
  dayOfRole: "Planner",
  waiver: true,
  reliability: true,
}, new Date("2026-10-04T18:00:00Z"));
assert(!early.ok, "seven day rule");

const missingDayOf = validateDayOfContact({ name: "Jordan", phone: "3185550199", role: "" });
assert(!missingDayOf.ok, "day-of role is required");
const dayOf = validateDayOfContact({ name: " Jordan Hale ", phone: "3185550199", role: "Maid of honor" });
assert(dayOf.ok && dayOf.value.name === "Jordan Hale" && dayOf.value.role === "Maid of honor", "day-of contact is trimmed");
if (dayOf.ok) {
  const columns = dayOfContactColumns(dayOf.value);
  assert(columns.day_of_contact_phone === "3185550199", "day-of phone column");
  assert(dayOfContactNotes(dayOf.value).includes("not the booker"), "day-of note names the driver contact");
}

assert(bookingSource({ stripeSecret: "sk_test_x", vercelEnv: "production" }) === "site-test", "test key");
assert(bookingSource({ stripeSecret: "sk_live_x", vercelEnv: "preview" }) === "site-test", "preview");
assert(bookingSource({ stripeSecret: "sk_live_x", vercelEnv: "production" }) === "site", "live");

console.log("booking rules ok");
