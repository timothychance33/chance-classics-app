import { withSecondCarNote } from "../data/packages.ts";
import { FREE_MILE_RADIUS, freeMileageRadiusMeters, mountShopMap, SHOP_ADDRESS_LABEL, SHOP_POINT } from "../lib/shop-map.ts";
import {
  addDays,
  bookingSource,
  earliestBookableDate,
  mileageCharge,
  BOOKING_BUFFER_HOURS,
  openStartTimes,
  quoteCheckoutLines,
  slotTaken,
  quoteCheckoutMoney,
  quoteLinkOpen,
  quoteRequestRecord,
  dayOfContactColumns,
  dayOfContactNotes,
  quoteTotal,
  salesTax,
  DEPOSIT_USD,
  CARD_SAVE_TEXT,
  MILE_THRESHOLD,
  SHOP_ADDRESS,
  rangesOverlap,
  validateBooking,
  validateDayOfContact,
} from "../lib/booking-rules.ts";
import {
  confirmedDepositUpdate,
  depositDollarsFromSession,
  totalDollarsFromCheckout,
} from "../lib/deposit-payment.ts";
import { balanceReminderMonday, chargeAmounts, depositCheckoutSaveCard } from "../lib/saved-card.ts";

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message);
}

assert(BOOKING_BUFFER_HOURS === 2, "buffer is 2 hours");
const busy = [{ start: "10:00", end: "12:00", date: "2026-10-16" }];
const open = openStartTimes(2, busy, "2026-10-16");
assert(!open.includes("08:00") && !open.includes("10:00") && !open.includes("12:00"), "2 hour buffer hides the edges");
assert(open.includes("14:00"), "a start exactly when the buffer ends stays open");
assert(open.includes("14:15"), "15-minute start after the buffer is offered");
assert(open.every((time) => ["00", "15", "30", "45"].includes(time.slice(3))), "start minutes are 00, 15, 30, or 45");
assert(open[0] === "14:00" && open.at(-1) === "20:00", "open starts stay inside 8:00 AM to 8:00 PM");
const sixHours = openStartTimes(6, [], "2026-10-16");
assert(sixHours.includes("18:00") && !sixHours.includes("18:15"), "a rental must finish the same day");
const overnight = [{ date: "2026-10-10", start: "22:00", end: "00:00" }];
assert(slotTaken("2026-10-11", "01:00", 1, overnight), "a midnight end blocks the next morning through the buffer");
assert(!slotTaken("2026-10-11", "02:00", 2, overnight), "2:00 AM is exactly when the post-midnight buffer ends");
assert(!slotTaken("2026-10-10", "18:00", 2, overnight), "6:00–8:00 PM ends as the pre-booking buffer begins");
assert(rangesOverlap(60, 120, 90, 150) && !rangesOverlap(60, 120, 120, 180), "range math");

const baseHours = quoteTotal(500, 2, 0);
assert(
  baseHours.subtotal === 500 && baseHours.tax === 51.25 && baseHours.total === 551.25 && baseHours.deposit === 250 && baseHours.balance === 301.25,
  "$500 subtotal is $51.25 tax, $551.25 total, $250 deposit, $301.25 balance",
);
assert(salesTax(500) === 51.25 && salesTax(635) === 65.09, "sales tax rounds to cents");
const money = quoteTotal(500, 4);
assert(money.listing === 700 && money.subtotal === 700 && money.tax === 71.75 && money.total === 771.75 && money.deposit === 250 && money.balance === 521.75, "listing price includes tax");
const withMileage = quoteTotal(500, 2, 180);
assert(withMileage.subtotal === 680 && withMileage.tax === 69.7 && withMileage.total === 749.7 && withMileage.deposit === 250 && withMileage.balance === 499.7, "mileage is taxed with the rental");

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
assert(!quoteLinkOpen({ status: "declined", book_expires_at: "2026-10-18T00:00:00Z" }, linkNow).ok, "declined quote is closed");
assert(
  withSecondCarNote("Drop-off: 200 Crockett St", true) ===
    "Drop-off: 200 Crockett St\nSecond car requested for parents or grandparents, at the same hourly rate as the main car.",
  "second car note uses the main car's hourly rate",
);
assert(withSecondCarNote("Drop-off: 200 Crockett St", false) === "Drop-off: 200 Crockett St", "an unchecked second car stays out of notes");
assert(!withSecondCarNote("Drop-off: 200 Crockett St", true).includes("$"), "the second car note has no separate price");
const pay = quoteCheckoutMoney(680);
assert(pay.deposit === 250 && pay.balance === 430 && pay.total === 680, "a stored quote total is not taxed again");
const depositPatch = confirmedDepositUpdate({
  status: "hold",
  paymentStatus: "unpaid",
  existingTotal: null,
  existingPaid: null,
  totalUsd: 551.25,
  depositUsd: depositDollarsFromSession({ amount_total: 25000, metadata: { deposit_usd: "250.00" } }),
  sessionId: "cs_test_deposit",
  notes: "Listing total: $500.00\nSubtotal: $500.00\nSales tax (10.25%): $51.25\nBooking total: $551.25\nMileage: 25 miles from Benton to pickup, fee $0.00, billed with the balance.",
  includeSessionId: true,
});
assert(depositPatch.status === "confirmed" && depositPatch.payment_status === "deposit", "a paid deposit is confirmed");
assert(depositPatch.total_usd === 551.25 && depositPatch.amount_paid_usd === 250, "total with tax and amount paid are stored");
assert(!("balance_due_usd" in depositPatch), "balance due stays a generated column");
assert(Number(depositPatch.total_usd) - Number(depositPatch.amount_paid_usd) === 301.25, "generated balance is total with tax minus the deposit");
assert(depositPatch.stripe_deposit_session_id === "cs_test_deposit", "checkout session id is stored");
assert(String(depositPatch.notes).includes("Price: $551.25 ($301.25 due)"), "garage price line matches the balance");
assert(totalDollarsFromCheckout({
  notes: "Listing total: $500.00\nMileage: 25 miles from Benton to pickup, fee $0.00, billed with the balance.",
  mileageFeeUsd: 0,
}) === 551.25, "a listing note is taxed");
assert(totalDollarsFromCheckout({
  notes: "Listing total: $500\nMileage: 45 miles from Benton to pickup, fee $135, billed with the balance.",
  mileageFeeUsd: 135,
}) === 700.09, "mileage is part of the taxed booking total");
assert(totalDollarsFromCheckout({
  metadata: { total_usd: "551.25" },
  notes: "Listing total: $500",
}) === 551.25, "checkout metadata total already includes tax");
assert(totalDollarsFromCheckout({
  notes: "Quote total: $551.25\nListing total: $500",
}) === 551.25, "a stored quote total is not taxed again");
assert(totalDollarsFromCheckout({
  notes: "Listing total: $500.00\nSales tax (10.25%): $51.25\nBooking total: $551.25",
}) === 551.25, "booking total is used as written");
const kept = confirmedDepositUpdate({
  status: "prepping",
  paymentStatus: "paid",
  existingTotal: 500,
  existingPaid: 500,
  existingSessionId: "cs_already",
  totalUsd: 500,
  depositUsd: 250,
  sessionId: "cs_retry",
  notes: "Deposit paid. Booking confirmed.",
  includeSessionId: true,
});
assert(kept.status === "prepping" && kept.payment_status === "paid" && kept.amount_paid_usd === 500, "a later payment is not reset to the deposit");
const withCard = confirmedDepositUpdate({
  status: "hold",
  paymentStatus: "unpaid",
  existingTotal: 551.25,
  existingPaid: null,
  totalUsd: 551.25,
  depositUsd: 250,
  sessionId: "cs_card",
  notes: "Booking total: $551.25",
  includeSessionId: true,
  stripeCustomerId: "cus_123",
  stripePaymentMethodId: "pm_123",
});
assert(withCard.stripe_customer_id === "cus_123" && withCard.stripe_payment_method_id === "pm_123", "deposit checkout stores the saved card");
const cardKept = confirmedDepositUpdate({
  status: "confirmed",
  paymentStatus: "deposit",
  existingTotal: 551.25,
  existingPaid: 250,
  totalUsd: 551.25,
  depositUsd: 250,
  notes: "Deposit paid.",
  stripeCustomerId: "cus_new",
  stripePaymentMethodId: "pm_new",
  existingCustomerId: "cus_123",
  existingPaymentMethodId: "pm_123",
});
assert(!("stripe_customer_id" in cardKept) && !("stripe_payment_method_id" in cardKept), "a later notice does not replace the saved card");
const balancePay = chargeAmounts({ total: 551.25, paid: 250, amount: 301.25, reason: "balance", source: "owner" });
assert(!("error" in balancePay) && balancePay.total === 551.25 && balancePay.paid === 551.25, "a balance charge clears the balance");
const tooMuch = chargeAmounts({ total: 551.25, paid: 250, amount: 400, reason: "balance", source: "owner" });
assert("error" in tooMuch, "the garage cannot charge more than the balance");
const overage = chargeAmounts({ total: 551.25, paid: 250, amount: 100, reason: "overage", source: "owner" });
assert(!("error" in overage) && overage.total === 651.25 && overage.paid === 350, "overage raises the total and the amount paid");
assert(balanceReminderMonday("2026-10-14") === "2026-10-12", "Wednesday uses Monday of that week");
assert(balanceReminderMonday("2026-10-18") === "2026-10-12", "Sunday uses Monday of that week");
assert(balanceReminderMonday("2026-10-12") === "2026-10-05", "Monday uses the previous Monday");
assert(balanceReminderMonday("2026-10-13") === "2026-10-05", "Tuesday uses the previous Monday");
assert(balanceReminderMonday("2026-10-19") === "2026-10-12", "next Monday uses this Monday");
const saveCard = depositCheckoutSaveCard();
assert(saveCard.customer_creation === "always" && saveCard.payment_intent_data.setup_future_usage === "off_session", "deposit checkout saves the card");
assert(saveCard.custom_text.submit.message === CARD_SAVE_TEXT, "checkout consent names balance, overages, and damage");
assert(depositDollarsFromSession({ amount_total: null, metadata: null }) === DEPOSIT_USD, "missing checkout amount still uses the deposit");
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
assert(lines.some((line) => line.label === "Sales tax (10.25%)" && line.amount === 68), "quote checkout shows sales tax");
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

assert(FREE_MILE_RADIUS === MILE_THRESHOLD && SHOP_ADDRESS_LABEL === SHOP_ADDRESS, "map uses the same shop and 30-mile rule");
assert(freeMileageRadiusMeters() === 30 * 1609.344, "free mileage circle is 30 miles");
assert(SHOP_POINT.lat > 32.69 && SHOP_POINT.lat < 32.71 && SHOP_POINT.lng < -93.73 && SHOP_POINT.lng > -93.75, "shop pin is in Benton");
const drawn: { marker?: { title?: string; position?: { lat: number } }; circle?: { radius?: number; geodesic?: boolean }; fitted?: boolean } = {};
mountShopMap(null as unknown as HTMLElement, {
  Map: class {
    fitBounds() { drawn.fitted = true; }
  } as unknown as new (el: HTMLElement, opts: object) => { fitBounds: (bounds: object, padding?: number) => void },
  Marker: class {
    constructor(opts: { title?: string; position?: { lat: number } }) { drawn.marker = opts; }
  } as unknown as new (opts: object) => unknown,
  Circle: class {
    constructor(opts: { radius?: number; geodesic?: boolean }) { drawn.circle = opts; }
    getBounds() { return { ok: true }; }
  } as unknown as new (opts: object) => { getBounds: () => object },
});
assert(drawn.marker?.title === "Chance Classics, 118 5th St E, Benton, LA 71006", "map pin names the shop");
assert(drawn.circle?.radius === freeMileageRadiusMeters() && drawn.circle?.geodesic === true, "map circle is the free mileage zone");
assert(drawn.fitted === true, "map frames the 30-mile circle");

console.log("booking rules ok");
