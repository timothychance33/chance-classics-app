import {
  addDays,
  bookingSource,
  earliestBookableDate,
  mileageCharge,
  openStartTimes,
  quoteTotal,
  rangesOverlap,
  validateBooking,
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
  waiver: true,
  reliability: true,
}, new Date("2026-10-04T18:00:00Z"));
assert(!early.ok, "seven day rule");

assert(bookingSource({ stripeSecret: "sk_test_x", vercelEnv: "production" }) === "site-test", "test key");
assert(bookingSource({ stripeSecret: "sk_live_x", vercelEnv: "preview" }) === "site-test", "preview");
assert(bookingSource({ stripeSecret: "sk_live_x", vercelEnv: "production" }) === "site", "live");

console.log("booking rules ok");
