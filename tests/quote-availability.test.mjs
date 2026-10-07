import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

import {
  BOOKING_BUFFER_HOURS,
  NO_AVAILABILITY_REASON,
  blockedInterval,
  carsForAlternateOffers,
  declineAvailabilityPatch,
  defaultDeclineAvailabilityMessage,
  findBookingClash,
  isOpenQuote,
  partitionQuotes,
  QUOTE_VALID_DAYS,
} from '../lib/quotes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const notifyDir = join(root, 'supabase/functions/send-notification');
const notifyIndex = readFileSync(join(notifyDir, 'index.ts'), 'utf8');
const notify = ['index.ts', 'shared.ts', 'quotes.ts'].map((name) => readFileSync(join(notifyDir, name), 'utf8')).join('\n');

assert.equal(BOOKING_BUFFER_HOURS, 2, 'buffer defaults to 2 hours');

const morning = {
  id: 'am',
  car_id: 'brenda',
  event_date: '2026-10-16',
  start_time: '08:30',
  end_time: '10:30',
  status: 'new',
  customer_name: 'Morning wedding',
};
const bookings = [
  morning,
  { id: 'other', car_id: 'phyllis', event_date: '2026-10-16', start_time: '08:30', end_time: '10:30', status: 'confirmed' },
  { id: 'gone', car_id: 'brenda', event_date: '2026-10-16', start_time: '13:00', end_time: '17:00', status: 'cancelled' },
];

const afternoon = { startTime: '1:00:00 PM', hours: 4 };
assert.equal(
  findBookingClash(bookings, 'brenda', '2026-10-16', afternoon),
  null,
  '1:00 PM for 4 hours does not overlap an 8:30–10:30 booking plus a 2 hour buffer',
);
assert.ok(
  findBookingClash(bookings, 'brenda', '2026-10-16', { startTime: '11:00 AM', hours: 2 }),
  '11:00 AM sits inside the 2 hour buffer after 10:30',
);
assert.equal(
  findBookingClash(bookings, 'brenda', '2026-10-16', { startTime: '12:30 PM', hours: 2 }),
  null,
  'a start exactly 2 hours after the booking ends is clear',
);
assert.ok(
  findBookingClash(bookings, 'brenda', '2026-10-16', { startTime: '9:00 AM', hours: 2 }),
  'a window inside the booking itself still clashes',
);

const later = [{ id: 'pm', car_id: 'brenda', event_date: '2026-10-16', start_time: '15:00', end_time: '18:00', status: 'confirmed' }];
assert.ok(
  findBookingClash(later, 'brenda', '2026-10-16', { startTime: '1:00 PM', hours: 2 }),
  '2 hours before a 3:00 PM start is inside the buffer',
);
assert.equal(
  findBookingClash(later, 'brenda', '2026-10-16', { startTime: '11:00 AM', hours: 2 }),
  null,
  'ending exactly when the buffer starts is clear',
);

const overnight = [{
  id: 'late',
  car_id: 'brenda',
  event_date: '2026-10-10',
  start_time: '22:00',
  end_time: '00:00',
  status: 'confirmed',
}];
assert.ok(
  findBookingClash(overnight, 'brenda', '2026-10-11', { startTime: '1:00 AM', hours: 1 }),
  'a booking that ends at midnight blocks the next morning through the buffer',
);
assert.equal(
  findBookingClash(overnight, 'brenda', '2026-10-11', { startTime: '2:00 AM', hours: 2 }),
  null,
  '2:00 AM is exactly when the post-midnight buffer ends',
);
assert.equal(
  findBookingClash(overnight, 'brenda', '2026-10-10', { startTime: '6:00 PM', hours: 2 }),
  null,
  '6:00–8:00 PM ends as the pre-booking buffer begins',
);

assert.equal(
  findBookingClash(bookings, 'phyllis', '2026-10-16', afternoon),
  null,
  'Phyllis is also free at 1:00 PM even though she has a morning booking',
);
assert.ok(
  findBookingClash(bookings, 'phyllis', '2026-10-16', { startTime: '9:00 AM', hours: 2 }),
  'Phyllis is still blocked when the request overlaps her own booking',
);
assert.equal(findBookingClash(bookings, 'brenda', '2026-10-16'), morning, 'no request time still treats the same day as booked');
assert.equal(
  findBookingClash(
    [{ id: 'no-end', car_id: 'brenda', event_date: '2026-10-16', start_time: '08:30', end_time: null, status: 'new' }],
    'brenda',
    '2026-10-16',
    afternoon,
  )?.id,
  'no-end',
  'a same-day booking with no end time still blocks, because its window cannot be placed',
);

const wider = blockedInterval(morning, 3);
const standard = blockedInterval(morning);
assert.ok(wider && standard && wider.start < standard.start && wider.end > standard.end, 'the buffer argument widens both sides');
assert.equal(standard.end - standard.start, (2 + 2 + 2) * 60, '8:30–10:30 plus 2 hours each side is 6 hours');

const chevy = { id: 'c', name: '1957 Chevy', base_rate: 600 };
const brendaCar = { id: 'brenda', name: 'Brenda', base_rate: 500 };
const phyllis = { id: 'phyllis', name: 'Phyllis', base_rate: 400 };
const open = carsForAlternateOffers([brendaCar, phyllis, chevy], bookings, '2026-10-16', 'brenda', afternoon);
assert.deepEqual(open.map((c) => c.id), ['phyllis', 'c'], 'same-day cars stay offerable when their bookings do not overlap this time');

const message = defaultDeclineAvailabilityMessage('Brandy Lewis');
assert.match(message, /^Hi Brandy,/);
assert.match(message, /I'm sorry, we can't accommodate your request due to a lack of availability\./);
assert.match(message, /Chance Classics\s*$/);
assert.equal(defaultDeclineAvailabilityMessage('').startsWith('Hi,'), true);

const nowIso = '2026-10-07T15:00:00.000Z';
assert.deepEqual(declineAvailabilityPatch(nowIso), {
  status: 'declined',
  decline_reason: NO_AVAILABILITY_REASON,
  declined_at: nowIso,
  book_expires_at: nowIso,
});
assert.equal(isOpenQuote({ status: 'quoted' }), true);
assert.equal(isOpenQuote({ status: 'sent' }), true);
assert.equal(isOpenQuote({ status: 'declined' }), false);
assert.equal(isOpenQuote({ status: 'booked' }), false);

const parts = partitionQuotes([
  { id: 'n', status: 'new', created_at: nowIso },
  { id: 's', status: 'sent', sent_at: nowIso },
  { id: 'd', status: 'declined', created_at: nowIso },
  { id: 'b', status: 'booked', created_at: nowIso },
  { id: 'old', status: 'sent', sent_at: new Date(Date.parse(nowIso) - (QUOTE_VALID_DAYS + 1) * 86400000).toISOString() },
], Date.parse(nowIso));
assert.deepEqual(parts.needsQuote.map((q) => q.id), ['n']);
assert.deepEqual(parts.active.map((q) => q.id), ['s']);
assert.deepEqual(parts.old.map((q) => q.id).sort(), ['b', 'd', 'old']);

assert.match(html, /BOOKING_BUFFER_HOURS=2/);
assert.match(html, /function blockedInterval/);
assert.match(html, /function requestedInterval/);
assert.match(html, /findBookingClash\(carId, evDate, slot\)/);
assert.match(html, /findBookingClash\(f\.car_id, evDate, slot\)/);
assert.match(html, /Decline: no availability/);
assert.match(html, /type:'quote_declined'/);
assert.match(html, /declined_at:nowIso/);
assert.match(html, /book_expires_at:nowIso/);
assert.match(html, /decline_reason:NO_AVAILABILITY_REASON/);
assert.match(html, /status!=='declined'/);
assert.match(html, /Nothing is sent until you confirm/);
assert.doesNotMatch(html, /service_role/);

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter((s) => s.trim());
assert.ok(scripts.length, 'page has inline script');
for (const source of scripts) new vm.Script(source);

const declinedBranch = notify.slice(notify.indexOf('export async function handleQuoteDeclined'));
assert.match(notifyIndex, /type === "quote_declined"/);
assert.match(notifyIndex, /handleQuoteDeclined/);
assert.ok(declinedBranch.includes('quote_declined requires'), 'send-notification sends the decline');
assert.doesNotMatch(declinedBranch, /book_url|Book now|Book \$\{/);
assert.match(declinedBranch, /Chance Classics/);
assert.match(notify, /api\.resend\.com\/emails/);

console.log('quote-availability tests passed');
