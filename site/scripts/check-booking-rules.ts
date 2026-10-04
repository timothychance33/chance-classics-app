import {
  addDays,
  bookingSource,
  earliestBookableDate,
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
assert(money.total === 700 && money.deposit === 250 && money.balance === 450, "listing price");

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
