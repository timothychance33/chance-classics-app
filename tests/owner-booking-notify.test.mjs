import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import {
  bookingPlannerText,
  bookingPriceText,
  bookingWhen,
  failedChargeNoticeIds,
  ownerBookingChangedHtml,
  ownerBookingChangedSubject,
  ownerBookingCreatedHtml,
  ownerBookingCreatedRows,
  ownerBookingCreatedSubject,
  ownerBookingMoneyHtml,
  ownerBookingMoneyRows,
  ownerBookingMoneySubject,
  paymentNoticeIds,
  refundNoticeIds,
  shouldEmailOwnerAboutBooking,
} from '../supabase/functions/_shared/owner-booking-email.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shared = readFileSync(join(root, 'supabase/functions/_shared/owner-booking-email.mjs'), 'utf8');
const siteCopy = readFileSync(join(root, 'site/lib/owner-booking-email.mjs'), 'utf8');
assert.equal(siteCopy, shared, 'site and send-notification share one booking email');

const notify = readFileSync(join(root, 'supabase/functions/send-notification/index.ts'), 'utf8');
const webhook = readFileSync(join(root, 'site/app/api/stripe/webhook/route.ts'), 'utf8');
const helper = readFileSync(join(root, 'site/lib/owner-booking-notify.ts'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const bookingsRoute = readFileSync(join(root, 'site/app/api/bookings/route.ts'), 'utf8');

const booking = {
  id: 'b4060b02-5f08-4cc8-90b6-a35152324b2c',
  customer_name: 'Ada <script> Lovelace',
  customer_phone: '318-555-0100',
  customer_email: 'ada@example.com',
  car_name: 'Brenda',
  event_date: '2026-10-23',
  start_time: '14:00:00',
  end_time: '17:00:00',
  pickup_location: 'Joaquin High School',
  event_location: 'Joaquin High School',
  total_usd: 869.87,
  planner: 'Emily Smith 318-460-0532',
  notes: 'Event Planner: ignored when planner is set',
};

assert.equal(bookingWhen(booking), '2:00 PM – 5:00 PM');
assert.equal(bookingPriceText(booking), '$869.87');
assert.equal(bookingPriceText({ notes: 'Booking total: $546.25' }), '$546.25');
assert.equal(bookingPriceText({ notes: 'Quote total: $100' }), '$100.00');
assert.equal(bookingPlannerText(booking), 'Emily Smith 318-460-0532');
assert.equal(
  bookingPlannerText({ notes: 'Event Planner Name and Contact Info: Brandon Hudson 3188346652' }),
  'Brandon Hudson 3188346652',
);
assert.equal(
  bookingPlannerText({ day_of_contact_name: 'Pat', day_of_contact_phone: '318-555-0199', day_of_contact_role: 'Planner' }),
  'Pat · 318-555-0199 · Planner',
);
assert.equal(bookingPlannerText({ day_of_contact_role: 'Maid of honor', day_of_contact_name: 'Pat' }), '');

assert.equal(ownerBookingCreatedSubject(booking), 'New Chance Classics booking — Ada <script> Lovelace / 2026-10-23');
assert.equal(
  ownerBookingCreatedSubject({ customer_name: 'Ada\nBcc: evil@example.com', event_date: '2026-10-23' }),
  'New Chance Classics booking — Ada Bcc: evil@example.com / 2026-10-23',
);
assert.equal(ownerBookingCreatedSubject({}), 'New Chance Classics booking');

const labels = ownerBookingCreatedRows(booking).map(([label]) => label);
assert.deepEqual(labels, [
  'Booking id', 'Client', 'Phone', 'Email', 'Car', 'Date', 'Time', 'Pickup / event location', 'Price', 'Planner',
]);

const mail = ownerBookingCreatedHtml(booking, 'https://app.chanceclassics.com');
assert.match(mail, /b4060b02-5f08-4cc8-90b6-a35152324b2c/);
assert.match(mail, /Ada &lt;script&gt; Lovelace/);
assert.match(mail, /318-555-0100/);
assert.match(mail, /ada@example.com/);
assert.match(mail, /Brenda/);
assert.match(mail, /2026-10-23/);
assert.match(mail, /2:00 PM – 5:00 PM/);
assert.match(mail, /Joaquin High School/);
assert.match(mail, /\$869\.87/);
assert.match(mail, /Emily Smith 318-460-0532/);
assert.match(mail, /Open the app/);
assert.match(mail, /&lt;script&gt;/);
assert.doesNotMatch(mail, /<script>/);

const split = ownerBookingCreatedRows({
  id: 'abc',
  pickup_location: 'Chapel',
  notes: 'Event Location: Reception hall',
});
assert.deepEqual(split.map(([label]) => label), ['Booking id', 'Pickup', 'Event location']);

const noPlanner = ownerBookingCreatedHtml({ id: 'abc', customer_name: 'Ada' }, '');
assert.match(noPlanner, /Booking id/);
assert.doesNotMatch(noPlanner, /Planner/);
assert.doesNotMatch(noPlanner, /Phone/);
assert.doesNotMatch(noPlanner, />there</);

assert.equal(shouldEmailOwnerAboutBooking({ status: 'confirmed' }), true);
assert.equal(shouldEmailOwnerAboutBooking({ status: 'new' }), true);
assert.equal(shouldEmailOwnerAboutBooking({ status: 'hold' }), false);
assert.equal(shouldEmailOwnerAboutBooking({ status: 'cancelled' }), false);
assert.equal(shouldEmailOwnerAboutBooking({ status: 'confirmed', owner_notified_at: '2026-10-12T16:20:00Z' }), false);
assert.equal(shouldEmailOwnerAboutBooking(null), false);

assert.match(notify, /type === "booking_created"/);
assert.match(notify, /booking_created requires booking id/);
assert.match(notify, /sendEmail\(OWNER_EMAIL, subject, html\)/);
const createdAt = notify.indexOf('type === "booking_created"');
const createdBranch = notify.slice(createdAt, notify.indexOf('unknown type'));
assert.doesNotMatch(createdBranch, /customer_email/);
assert.doesNotMatch(createdBranch, /body\.to/);
assert.doesNotMatch(createdBranch, /reviewed_at|photos_received_at/);
assert.match(notify, /secretMatches\(serviceKey, token\)/);
assert.match(notify, /x-notify-secret/);

assert.match(webhook, /emailOwnerAboutBooking/);
assert.match(webhook, /quoteLinkedBookingId/);
assert.ok(webhook.indexOf('confirmPaidQuote') < webhook.indexOf('emailOwnerAboutBooking'));
assert.ok(webhook.lastIndexOf('updateBooking') < webhook.lastIndexOf('emailOwnerAboutBooking'));
assert.match(helper, /type: "booking_created"/);
assert.match(helper, /x-notify-secret/);
assert.match(helper, /Authorization = `Bearer \$\{serviceKey\}`/);
assert.match(helper, /owner_notified_at/);
assert.doesNotMatch(helper, /sendEmail\(\s*(row\.customer_email|booking\.customer_email)/);

assert.match(html, /function notifyOwnerNewBooking/);
assert.match(html, /type:'booking_created'/);
assert.match(html, /ownerMailed=await notifyOwnerNewBooking/);
const saveAt = html.indexOf('async function saveBooking');
const saveFn = html.slice(saveAt, html.indexOf('async function delBooking'));
const insertAt = saveFn.indexOf(".insert(rec)");
const updateAt = saveFn.indexOf(".update(rec)");
const notifyAt = saveFn.indexOf('notifyOwnerNewBooking');
assert.ok(insertAt > updateAt && notifyAt > insertAt, 'owner email runs only after a new garage insert');
assert.doesNotMatch(bookingsRoute, /booking_created|emailOwnerAboutBooking|notifyOwnerNewBooking/);

assert.match(html, /FOLLOWUP_FLAG_COLS=\['reviewed_at','photos_received_at'\]/);

assert.equal(
  ownerBookingChangedSubject(booking, [{ label: 'Date', from: '2026-10-23', to: '2026-10-24' }]),
  'Chance Classics booking changed — Ada <script> Lovelace / 2026-10-23',
);
assert.equal(
  ownerBookingChangedSubject(booking, [{ label: 'Status', from: 'confirmed', to: 'deleted' }]),
  'Chance Classics booking cancelled — Ada <script> Lovelace / 2026-10-23',
);
const changedMail = ownerBookingChangedHtml(booking, [
  { label: 'Date', from: 'Fri Oct 23', to: 'Sat Oct 24' },
  { label: 'Car', from: 'Brenda', to: 'Elsa <b>' },
], 'https://app.chanceclassics.com');
assert.match(changedMail, /Booking changed/);
assert.match(changedMail, /Fri Oct 23/);
assert.match(changedMail, /Sat Oct 24/);
assert.match(changedMail, /Elsa &lt;b&gt;/);
assert.match(changedMail, /b4060b02-5f08-4cc8-90b6-a35152324b2c/);
assert.doesNotMatch(changedMail, /Elsa <b>/);

const money = { amount: 250, reason: 'deposit', amountPaid: 250, balance: 301.25 };
assert.deepEqual(ownerBookingMoneyRows(money).map(([label, value]) => [label, value]), [
  ['Amount', '$250.00'],
  ['Reason', 'Deposit'],
  ['Amount paid', '$250.00'],
  ['Balance', '$301.25'],
]);
assert.equal(ownerBookingMoneyRows({ amount: 40, reason: 'failed', chargeReason: 'damage', amountPaid: 250, balance: 0 })[1][1], 'Charge failed (damage)');
assert.equal(ownerBookingMoneyRows({ amount: 40, reason: 'refund', chargeReason: 'overage', amountPaid: 210, balance: 341.25 })[1][1], 'Refund (overage)');
assert.equal(
  ownerBookingMoneySubject(booking, money),
  'Chance Classics payment — Deposit / Ada <script> Lovelace / 2026-10-23',
);
const moneyMail = ownerBookingMoneyHtml(booking, { ...money, detail: 'pi_123 <x>' }, 'https://app.chanceclassics.com');
assert.match(moneyMail, /\$250\.00/);
assert.match(moneyMail, /\$301\.25/);
assert.match(moneyMail, /Deposit/);
assert.match(moneyMail, /Amount paid/);
assert.match(moneyMail, /Balance/);
assert.match(moneyMail, /pi_123 &lt;x&gt;/);
assert.match(moneyMail, /new totals/);
const failedMail = ownerBookingMoneyHtml(booking, { amount: 12, reason: 'failed', chargeReason: 'balance', amountPaid: 250, balance: 301.25 }, '');
assert.match(failedMail, /did not go through/);
assert.match(failedMail, /Charge failed \(balance\)/);

assert.deepEqual(paymentNoticeIds({ eventId: 'evt_1', paymentIntentId: 'pi_1', sessionId: 'cs_1' }), ['evt_1', 'pi_1', 'cs_1']);
assert.deepEqual(paymentNoticeIds({ eventId: 'evt_1', paymentIntentId: 'evt_1' }), ['evt_1']);
assert.deepEqual(failedChargeNoticeIds('pi_1'), ['failed:pi_1']);
assert.deepEqual(refundNoticeIds({ eventId: 'evt_2', refundId: 're_1' }), ['re_1', 'evt_2:re_1']);
assert.deepEqual(refundNoticeIds({ eventId: 'evt_2', refundId: 're_2' }), ['re_2', 'evt_2:re_2']);
assert.notDeepEqual(refundNoticeIds({ eventId: 'evt_2', refundId: 're_1' }), refundNoticeIds({ eventId: 'evt_2', refundId: 're_2' }));

assert.match(notify, /type === "booking_changed"/);
assert.match(notify, /type === "booking_money"/);
assert.match(notify, /booking_changed requires booking id/);
assert.match(notify, /booking_money requires booking id/);
const changedTypeAt = notify.indexOf('type === "booking_changed"');
const moneyTypeAt = notify.indexOf('type === "booking_money"');
const unknownAt = notify.indexOf('unknown type');
for (const branch of [notify.slice(changedTypeAt, moneyTypeAt), notify.slice(moneyTypeAt, unknownAt)]) {
  assert.match(branch, /sendEmail\(OWNER_EMAIL, subject, html\)/);
  assert.doesNotMatch(branch, /customer_email/);
  assert.doesNotMatch(branch, /body\.to/);
}
assert.match(helper, /emailOwnerAboutMoney/);
assert.match(helper, /owner_money_notices/);
assert.match(helper, /type: "booking_money"/);
assert.match(webhook, /emailOwnerAboutMoney/);
assert.match(webhook, /charge\.refunded/);
assert.ok(webhook.indexOf('confirmPaidQuote') < webhook.indexOf('emailOwnerAboutBooking'));
assert.ok(webhook.lastIndexOf('updateBooking') < webhook.lastIndexOf('emailOwnerAboutBooking'));

assert.match(html, /function notifyOwnerBookingChanged/);
assert.match(html, /type:'booking_changed'/);
const changedAt = saveFn.indexOf('notifyOwnerBookingChanged');
assert.ok(changedAt > updateAt && changedAt < insertAt, 'change email runs on a garage edit');
const deleteFn = html.slice(html.indexOf('async function delBooking'), html.indexOf('function driverPayStatusHtml'));
assert.match(deleteFn, /notifyOwnerBookingChanged/);
assert.match(deleteFn, /to:'deleted'/);
assert.match(html.slice(html.indexOf('async function saveOwnerCustomerAmount'), html.indexOf('async function saveEarnBookingAmount')), /notifyOwnerBookingChanged/);

console.log('owner-booking-notify tests passed');
