import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { withSecondCarNote } from "../data/packages.ts";
import { FREE_MILE_RADIUS, freeMileageRadiusMeters, mountShopMap, SHOP_ADDRESS_LABEL, SHOP_POINT } from "../lib/shop-map.ts";
import {
  addDays,
  bookingSource,
  earliestBookableDate,
  endMinutes,
  mileageCharge,
  BOOKING_BUFFER_HOURS,
  openStartTimes,
  quoteCheckoutLines,
  quoteIsTaxExempt,
  rentalEndLabel,
  slotTaken,
  quoteCheckoutMoney,
  quoteLinkOpen,
  quoteRequestRecord,
  quoteDropoffError,
  quoteDropoffHidden,
  isPhotoShootOnly,
  dayOfContactColumns,
  dayOfContactNotes,
  weddingCelebrationColumns,
  weddingCelebrationErrors,
  quoteTotal,
  salesTax,
  DEPOSIT_USD,
  CARD_SAVE_TEXT,
  MILE_THRESHOLD,
  SHOP_ADDRESS,
  START_WINDOW_NOTE,
  rangesOverlap,
  validateBooking,
  validateDayOfContact,
} from "../lib/booking-rules.ts";
import {
  confirmedDepositUpdate,
  depositDollarsFromSession,
  promotedStatusIfNew,
  totalDollarsFromCheckout,
} from "../lib/deposit-payment.ts";
import { balanceReminderMonday, chargeAmounts, depositCheckoutSaveCard, refundAmounts } from "../lib/saved-card.ts";

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
assert(open[0] === "14:00" && open.at(-1) === "23:45", "open starts stay inside 8:00 AM to 11:45 PM");
const sixHours = openStartTimes(6, [], "2026-10-16");
assert(sixHours[0] === "08:00" && sixHours.at(-1) === "23:45", "a rental may start through 11:45 PM and end after midnight");
assert(sixHours.includes("18:15"), "6:15 PM is offered even though a 6-hour rental ends after midnight");
const empty = openStartTimes(2, [], "2026-10-16");
assert(empty[0] === "08:00" && empty.at(-1) === "23:45", "an open day runs 8:00 AM through 11:45 PM");
assert(empty.includes("23:00") && empty.includes("23:15") && empty.includes("23:30") && empty.includes("23:45"), "late starts are every 15 minutes");
assert(!empty.includes("07:45") && !empty.includes("00:00"), "starts do not begin before 8:00 AM");
assert(endMinutes("23:00", 2) === 60, "11:00 PM plus 2 hours is 1:00 AM");
assert(endMinutes("22:00", 2) === 0, "10:00 PM plus 2 hours is midnight");
assert(endMinutes("18:00", 2) === 20 * 60, "6:00 PM plus 2 hours stays 8:00 PM");
assert(endMinutes("23:45", 6) === 5 * 60 + 45, "11:45 PM plus 6 hours is 5:45 AM");
assert(rentalEndLabel("23:00", 2) === "1:00 AM the next day", "end label names the next day");
assert(rentalEndLabel("14:00", 2) === "4:00 PM", "an afternoon end stays on the same day");
assert(START_WINDOW_NOTE === "Start times are every 15 minutes, from 8:00 AM to 11:45 PM.", "helper text");
const overnight = [{ date: "2026-10-10", start: "22:00", end: "00:00" }];
assert(slotTaken("2026-10-11", "01:00", 1, overnight), "a midnight end blocks the next morning through the buffer");
assert(!slotTaken("2026-10-11", "02:00", 2, overnight), "2:00 AM is exactly when the post-midnight buffer ends");
assert(!slotTaken("2026-10-10", "18:00", 2, overnight), "6:00–8:00 PM ends as the pre-booking buffer begins");
const endsAtOne = [{ date: "2026-10-16", start: "23:00", end: "01:00" }];
assert(slotTaken("2026-10-17", "01:00", 2, endsAtOne), "11:00 PM–1:00 AM blocks the next morning through the buffer");
assert(!slotTaken("2026-10-17", "03:00", 2, endsAtOne), "3:00 AM is exactly when that buffer ends");
const nextMorning = [{ date: "2026-10-17", start: "01:00", end: "03:00" }];
assert(slotTaken("2026-10-16", "23:00", 2, nextMorning), "11:00 PM plus 2 hours conflicts with a 1:00 AM next-day booking");
assert(!slotTaken("2026-10-16", "21:00", 2, nextMorning), "9:00–11:00 PM ends as the next-day buffer begins");
assert(slotTaken("2026-10-16", "21:15", 2, nextMorning), "9:15 PM runs into the buffer before 1:00 AM");
const afterThree = [{ date: "2026-10-17", start: "03:00", end: "05:00" }];
assert(!slotTaken("2026-10-16", "23:00", 2, afterThree), "11:00 PM–1:00 AM ends as the 3:00 AM buffer begins");
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
const noDropoff = quoteRequestRecord({
  firstName: "Emily",
  lastName: "Smith",
  email: "emily@example.com",
  phone: "3185550100",
  service: "Phyllis - 1941 Buick",
  eventType: "Photo Session",
  when: "2026-11-14T14:00",
  pickup: "1001 Airport Dr, Shreveport, LA",
  dropoff: "",
  details: "Golden hour portraits",
  planner: "",
  heard: "",
});
assert(noDropoff.event_location === "1001 Airport Dr, Shreveport, LA" && !String(noDropoff.details).includes("Drop-off:"), "a missing drop-off is stored without a drop-off line");
assert(quoteDropoffError("") === "" && quoteDropoffError("   ") === "", "an empty drop-off is valid");
assert(quoteDropoffError("ab") === "Enter a drop-off location.", "a short drop-off is still rejected");
assert(quoteDropoffError("200 Crockett St") === "", "a real drop-off is still accepted");
assert(isPhotoShootOnly("Photo Session") && isPhotoShootOnly("photo-shoot") && isPhotoShootOnly("Pictures only"), "photo-only events hide drop-off");
assert(!isPhotoShootOnly("Wedding") && !isPhotoShootOnly("Wedding photo shoot") && !isPhotoShootOnly(""), "a ride that mentions photos still asks for drop-off");
assert(quoteDropoffHidden({ eventType: "Photo Session", sameLocation: false }), "photo shoot hides the drop-off field");
assert(quoteDropoffHidden({ eventType: "Parade", sameLocation: true }), "same-location events hide the drop-off field");
assert(!quoteDropoffHidden({ eventType: "Wedding", sameLocation: false }), "a wedding with a different drop-off still shows the field");

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
const paidNew = confirmedDepositUpdate({
  status: "new",
  paymentStatus: "deposit",
  existingTotal: 400,
  existingPaid: 250,
  totalUsd: 400,
  depositUsd: 250,
  notes: "Price: $400.00 ($150.00 due)",
});
assert(paidNew.status === "confirmed" && paidNew.payment_status === "deposit", "a new booking with a deposit is confirmed");
const cancelledPaid = confirmedDepositUpdate({
  status: "cancelled",
  paymentStatus: "paid",
  existingTotal: 400,
  existingPaid: 400,
  totalUsd: 400,
  depositUsd: 250,
  notes: "Deposit paid.",
});
assert(cancelledPaid.status === "cancelled" && cancelledPaid.payment_status === "paid", "a cancelled booking stays cancelled after payment");
const declinedPaid = confirmedDepositUpdate({
  status: "declined",
  paymentStatus: "deposit",
  existingTotal: 400,
  existingPaid: 250,
  totalUsd: 400,
  depositUsd: 250,
  notes: "Deposit paid.",
});
assert(declinedPaid.status === "declined", "a declined booking stays declined after a deposit");
assert(promotedStatusIfNew("new", "paid") === "confirmed", "new plus paid promotes");
assert(promotedStatusIfNew("new", "deposit") === "confirmed", "new plus deposit promotes");
assert(promotedStatusIfNew("new", "unpaid") === null, "unpaid new stays new");
assert(promotedStatusIfNew("prepping", "paid") === null, "prepping is not rewritten");
assert(promotedStatusIfNew("ready", "deposit") === null, "ready is not rewritten");
assert(promotedStatusIfNew("out", "paid") === null, "out is not rewritten");
assert(promotedStatusIfNew("completed", "paid") === null, "completed is not rewritten");
assert(promotedStatusIfNew("cancelled", "paid") === null, "cancelled is not rewritten");
assert(promotedStatusIfNew("declined", "deposit") === null, "declined is not rewritten");
assert(promotedStatusIfNew("hold", "deposit") === null, "a hold is confirmed by the deposit patch, not this helper");
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
assert(!("payment_method_types" in saveCard), "deposit checkout uses Dashboard payment methods");
const taggedCard = depositCheckoutSaveCard({ booking_id: "abc", purpose: "deposit", reason: "deposit" });
assert(taggedCard.payment_intent_data.metadata?.booking_id === "abc" && taggedCard.payment_intent_data.metadata?.reason === "deposit", "deposit payment intent carries the booking");
const depositRefund = refundAmounts({ total: 551.25, paid: 250, amount: 100, reason: "deposit" });
assert(!("error" in depositRefund) && depositRefund.total === 551.25 && depositRefund.paid === 150, "a deposit refund lowers amount paid only");
const balanceRefund = refundAmounts({ total: 551.25, paid: 551.25, amount: 301.25, reason: "balance" });
assert(!("error" in balanceRefund) && balanceRefund.total === 551.25 && balanceRefund.paid === 250, "a balance refund lowers amount paid only");
const overageRefund = refundAmounts({ total: 651.25, paid: 350, amount: 100, reason: "overage" });
assert(!("error" in overageRefund) && overageRefund.total === 551.25 && overageRefund.paid === 250, "an overage refund lowers the total and the amount paid");
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
assert(!lines.some((line) => line.label === "Tax exempt"), "a taxed quote does not say tax exempt");
const exemptLines = quoteCheckoutLines({
  car_name: "Patsy",
  base_rate: 500,
  tax: 0,
  taxExempt: true,
});
assert(exemptLines.some((line) => line.label === "Tax exempt"), "a tax-exempt quote says Tax exempt");
assert(!exemptLines.some((line) => line.label === "Sales tax (10.25%)"), "a tax-exempt quote drops the sales tax line");
assert(quoteIsTaxExempt({ tax_exempt: true, tax: 51.25, subtotal: 500 }) === true, "the switch wins");
assert(quoteIsTaxExempt({ tax_exempt: false, tax: 0, subtotal: 500 }) === false, "an explicit off stays taxed in the label");
assert(quoteIsTaxExempt({ tax: 0, subtotal: 500 }) === true, "a stored zero tax is exempt when the column is missing");
assert(quoteIsTaxExempt({ tax: 51.25, subtotal: 500 }) === false, "a normal quote stays taxed");
assert(totalDollarsFromCheckout({
  notes: "Tax exempt\nListing total: $500.00\nMileage: 25 miles from Benton to pickup, fee $0.00, billed with the balance.",
  mileageFeeUsd: 0,
}) === 500, "a tax-exempt listing note is not taxed again");
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

const bookNow = new Date("2026-10-04T18:00:00Z");
const lateBooking = {
  car: "1953-packard-limo",
  date: earliestBookableDate(bookNow),
  start: "23:00",
  hours: 2,
  name: "Test Guest",
  email: "guest@example.com",
  phone: "3185550100",
  occasion: "Wedding" as const,
  pickup: "118 5th St, Benton, LA",
  dropoff: "Same",
  dayOfName: "Jordan Hale",
  dayOfPhone: "3185550199",
  dayOfRole: "Planner",
  waiver: true,
  reliability: true,
};
const late = validateBooking(lateBooking, bookNow);
assert(late.ok && late.value.end === "01:00" && late.value.start === "23:00", "11:00 PM plus 2 hours ends at 1:00 AM");
const latest = validateBooking({ ...lateBooking, start: "23:45", hours: 6 }, bookNow);
assert(latest.ok && latest.value.end === "05:45", "11:45 PM plus 6 hours ends at 5:45 AM");
assert(!validateBooking({ ...lateBooking, start: "00:00" }, bookNow).ok, "midnight is not a start time");
assert(!validateBooking({ ...lateBooking, start: "23:50" }, bookNow).ok, "starts stay on 15-minute steps");
const form = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../components/BookingForm.tsx"), "utf8");
assert(form.includes("START_WINDOW_NOTE") && form.includes("rentalEndLabel"), "booking page uses the shared window and shows the end");
assert(!form.includes("8:00 PM"), "booking page no longer stops at 8:00 PM");
assert(!form.includes("finish the same day"), "the form no longer requires the rental to finish the same day");

const missingDayOf = validateDayOfContact({ name: "Jordan", phone: "3185550199", role: "" });
assert(!missingDayOf.ok, "day-of role is required");
const dayOf = validateDayOfContact({ name: " Jordan Hale ", phone: "3185550199", role: "Maid of honor" });
assert(dayOf.ok && dayOf.value.name === "Jordan Hale" && dayOf.value.role === "Maid of honor", "day-of contact is trimmed");
if (dayOf.ok) {
  const columns = dayOfContactColumns(dayOf.value);
  assert(columns.day_of_contact_phone === "3185550199", "day-of phone column");
  assert(dayOfContactNotes(dayOf.value).includes("not the booker"), "day-of note names the driver contact");
}

const weddingBlank = {
  partner1Name: "  ",
  partner1Social: "",
  partner2Name: "",
  partner2Social: "",
  photographerName: "",
  photographerEmail: "",
  photographerInstagram: "",
};
assert(Object.keys(weddingCelebrationErrors("Wedding", weddingBlank)).length === 0, "empty wedding answers are allowed");
assert(Object.values(weddingCelebrationColumns("Wedding", weddingBlank)).every((value) => value == null), "blank wedding answers store null");
const weddingFilled = weddingCelebrationColumns("Wedding", {
  partner1Name: "  Ann  Marie ",
  partner1Social: "@ann",
  partner2Name: "Jon",
  partner2Social: "",
  photographerName: "Pat Photo",
  photographerEmail: " pat@studio.example ",
  photographerInstagram: "patphoto",
});
assert(weddingFilled.wedding_partner_1_name === "Ann Marie", "wedding names are trimmed");
assert(weddingFilled.wedding_partner_1_social === "@ann", "wedding social is kept");
assert(weddingFilled.wedding_photographer_email === "pat@studio.example", "photographer email is trimmed");
assert(weddingCelebrationErrors("Wedding", { photographerEmail: "not-an-email" }).photographerEmail === "Enter a valid photographer email, or leave it blank.", "bad photographer email is rejected");
assert(weddingCelebrationErrors("Wedding", { partner1Name: "Ann\nMarie" }).partner1Name === "Enter the bride or partner 1 name on one line.", "wedding names stay on one line");
assert("partner1Name" in weddingCelebrationErrors("Wedding", { partner1Name: "A".repeat(121) }), "over-long wedding name is rejected");
const hidden = weddingCelebrationColumns("Parade", { partner1Name: "Ann", photographerEmail: "not-an-email" });
assert(Object.values(hidden).every((value) => value == null), "wedding answers are not stored for another occasion");
assert(Object.keys(weddingCelebrationErrors("Parade", { photographerEmail: "not-an-email" })).length === 0, "wedding checks run only for a wedding");

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
