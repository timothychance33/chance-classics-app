import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import {
  bookingPlannerText,
  bookingPriceText,
  bookingWhen,
  ownerBookingCreatedHtml,
  ownerBookingCreatedRows,
  ownerBookingCreatedSubject,
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

console.log('owner-booking-notify tests passed');
