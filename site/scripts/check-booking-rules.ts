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
const withMileage = quoteTotal(500, 2, 225);
assert(withMileage.deposit === 250 && withMileage.balance === 475 && withMileage.total === 725, "mileage stays on the balance");

const near = mileageCharge(25, 20);
assert(near.toPickup === 25 && near.between === 20 && near.miles === 45 && near.fee === 0, "25+20 has no fee");
const edge = mileageCharge(30, 40);
assert(edge.toPickup === 30 && edge.between === 40 && edge.miles === 70 && edge.fee === 0, "30+40 has no fee");
const justOver = mileageCharge(31, 0);
assert(justOver.toPickup === 31 && justOver.between === 0 && justOver.miles === 31 && justOver.fee === 93, "31+0 is $93");
const far = mileageCharge(60, 15);
assert(far.toPickup === 60 && far.between === 15 && far.miles === 75 && far.fee === 225, "60+15 is $225");
assert(mileageCharge(29.6, 40).toPickup === 30 && mileageCharge(29.6, 40).between === 40 && mileageCharge(29.6, 40).fee === 0, "29.6 rounds to 30");
assert(mileageCharge(30.2, 0).toPickup === 31 && mileageCharge(30.2, 0).miles === 31 && mileageCharge(30.2, 0).fee === 93, "30.2 rounds up to 31");
assert(mileageCharge(59.1, 14.2).toPickup === 60 && mileageCharge(59.1, 14.2).between === 15 && mileageCharge(59.1, 14.2).miles === 75 && mileageCharge(59.1, 14.2).fee === 225, "each leg rounds up");

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
