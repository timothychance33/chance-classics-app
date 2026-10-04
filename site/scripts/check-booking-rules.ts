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
const withMileage = quoteTotal(500, 2, 93);
assert(withMileage.deposit === 250 && withMileage.balance === 343 && withMileage.total === 593, "mileage stays on the balance");

const noFee = mileageCharge(10, 15);
assert(noFee.toPickup === 10 && noFee.between === 15 && noFee.miles === 25 && noFee.fee === 0, "10+15 has no fee");
const charged = mileageCharge(20, 15);
assert(charged.toPickup === 20 && charged.between === 15 && charged.miles === 35 && charged.fee === 105, "20+15 is $105");
assert(mileageCharge(29.6, 0).miles === 30 && mileageCharge(29.6, 0).fee === 0, "29.6 rounds to 30");
assert(mileageCharge(30, 0).miles === 30 && mileageCharge(30, 0).fee === 0, "30 has no fee");
assert(mileageCharge(14.2, 16.1).toPickup === 15 && mileageCharge(14.2, 16.1).between === 17 && mileageCharge(14.2, 16.1).miles === 32 && mileageCharge(14.2, 16.1).fee === 96, "each leg rounds up");

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
