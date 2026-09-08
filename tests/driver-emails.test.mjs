import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import {
  bookingsForDriverWeek,
  chicagoWeekWindow,
  classifyDriverNotify,
  diffDriverFacing,
  driverFacingNotes,
  driverPayAmount,
  fmtEventDate,
  fmtTime,
  fmtTimeRange,
  normTime,
  sameDriverVal,
  shouldSendWeeklyDigest,
  assignedSubject,
  unassignedSubject,
  updatedSubject,
  weeklySubject,
} from '../lib/driver-emails.mjs';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

assert.match(html, /function notifyDriversAfterBookingWrite/, 'save/delete/release call a shared notify helper');
assert.match(html, /function classifyDriverNotify/, 'browser has the same classify helper');
assert.match(html, /function driverFacingNotes/, 'browser strips owner Price lines from driver mail');
assert.match(html, /booking_updated/, 'edit emails use booking_updated');
assert.match(html, /booking_assigned/, 'new assignment uses booking_assigned');
assert.match(html, /booking_unassigned/, 'removed driver uses booking_unassigned');
assert.match(html, /Your Chance Classics bookings this week/, 'weekly subject is in the app comments or helper');
assert.match(html, /STAFF_TABS=\['schedule','calendar','prep','cars'\]/, 'staff nav is unchanged');
assert.match(html, /OWNER_ONLY_TABS=\['staff','earnings','quotes'\]/, 'owner-only tabs are unchanged');
assert.doesNotMatch(html, /service_role/, 'no service_role in the browser app');

assert.equal(driverFacingNotes('Meet at side door\nPrice: $880.00 ($200 due)\nBring hats'), 'Meet at side door\nBring hats');
assert.equal(driverFacingNotes('Price: $100'), '');
assert.equal(sameDriverVal('notes', 'Hello\nPrice: $50', 'Hello\nPrice: $999'), true);
assert.equal(sameDriverVal('notes', 'Hello', 'Hello — bring umbrellas'), false);
assert.equal(sameDriverVal('start_time', '14:00:00', '14:00'), true);
assert.equal(sameDriverVal('end_time', '18:00', '18:30'), false);
assert.equal(sameDriverVal('needs_trailer', true, 1), true);
assert.equal(sameDriverVal('pay_tier', '3', 3), true);
assert.equal(sameDriverVal('customer_name', null, ''), true);
assert.equal(normTime('9:05:00'), '09:05');
assert.equal(fmtTime('14:00:00'), '2:00PM');
assert.equal(fmtTimeRange('14:00', '18:00'), '2:00PM – 6:00PM');
assert.equal(fmtEventDate('2026-09-12'), 'Sat Sep 12');

const prev = {
  driver_id: 'd1',
  customer_name: 'Jane',
  event_type: 'wedding',
  event_date: '2026-09-12',
  start_time: '14:00',
  end_time: '18:00',
  car_id: 'c1',
  pickup_location: 'Church',
  return_location: 'Hall',
  customer_phone: '555-0100',
  customer_email: 'jane@example.com',
  notes: 'Side door\nPrice: $880',
  needs_trailer: false,
  pay_tier: 2,
  status: 'confirmed',
  payment_status: 'unpaid',
};

assert.deepEqual(diffDriverFacing(prev, { ...prev, payment_status: 'paid' }), []);
assert.deepEqual(diffDriverFacing(prev, { ...prev, notes: 'Side door\nPrice: $1200' }), []);
assert.equal(diffDriverFacing(prev, { ...prev, pickup_location: 'Hotel' })[0].label, 'Pickup');

const dateChange = classifyDriverNotify({ previous: prev, next: { ...prev, event_date: '2026-09-13' } });
assert.equal(dateChange.length, 1);
assert.equal(dateChange[0].kind, 'booking_updated');
assert.equal(dateChange[0].changes[0].key, 'event_date');

const assigned = classifyDriverNotify({ previous: { ...prev, driver_id: null }, next: prev });
assert.equal(assigned.length, 1);
assert.equal(assigned[0].kind, 'booking_assigned');
assert.equal(assigned[0].driverId, 'd1');

const unassigned = classifyDriverNotify({ previous: prev, next: { ...prev, driver_id: null } });
assert.equal(unassigned.length, 1);
assert.equal(unassigned[0].kind, 'booking_unassigned');
assert.equal(unassigned[0].driverId, 'd1');

const swapped = classifyDriverNotify({ previous: prev, next: { ...prev, driver_id: 'd2' } });
assert.deepEqual(swapped.map((x) => x.kind), ['booking_unassigned', 'booking_assigned']);
assert.equal(swapped[0].driverId, 'd1');
assert.equal(swapped[1].driverId, 'd2');

const created = classifyDriverNotify({ previous: null, next: prev });
assert.equal(created.length, 1);
assert.equal(created[0].kind, 'booking_assigned');

const deleted = classifyDriverNotify({ previous: prev, deleted: true });
assert.equal(deleted.length, 1);
assert.equal(deleted[0].kind, 'booking_unassigned');

const noise = classifyDriverNotify({
  previous: prev,
  next: { ...prev, payment_status: 'paid', driver_paid_at: '2026-09-08T12:00:00Z', offer_rank: 2 },
});
assert.deepEqual(noise, []);

const week = chicagoWeekWindow(new Date('2026-09-08T14:00:00Z')); // Tuesday 9am CDT
assert.equal(week.weekStart, '2026-09-07');
assert.equal(week.weekEnd, '2026-09-13');

const mondayMorning = shouldSendWeeklyDigest(new Date('2026-09-14T13:30:00Z')); // 8:30am CDT Monday
assert.equal(mondayMorning.ok, true);
assert.equal(mondayMorning.weekStart, '2026-09-14');
assert.equal(mondayMorning.weekEnd, '2026-09-20');

const mondayNight = shouldSendWeeklyDigest(new Date('2026-09-14T23:00:00Z'));
assert.equal(mondayNight.ok, false);

const tuesday = shouldSendWeeklyDigest(new Date('2026-09-08T13:00:00Z'));
assert.equal(tuesday.ok, false);

const forced = shouldSendWeeklyDigest(new Date('2026-09-08T13:00:00Z'), { force: true });
assert.equal(forced.ok, true);
assert.equal(forced.weekStart, '2026-09-07');

const list = [
  { id: 'a', driver_id: 'd1', status: 'confirmed', event_date: '2026-09-16', start_time: '16:00' },
  { id: 'b', driver_id: 'd1', status: 'confirmed', event_date: '2026-09-15', start_time: '10:00' },
  { id: 'c', driver_id: 'd1', status: 'cancelled', event_date: '2026-09-17', start_time: '12:00' },
  { id: 'd', driver_id: 'd2', status: 'confirmed', event_date: '2026-09-16', start_time: '09:00' },
  { id: 'e', driver_id: 'd1', status: 'confirmed', event_date: '2026-09-21', start_time: '09:00' },
];
const mine = bookingsForDriverWeek(list, 'd1', '2026-09-14', '2026-09-20');
assert.deepEqual(mine.map((b) => b.id), ['b', 'a']);
assert.equal(bookingsForDriverWeek(list, 'd3', '2026-09-14', '2026-09-20').length, 0);

assert.equal(driverPayAmount({ pay_tier: 3 }, { pay_rate: 50 }), 150);
assert.equal(driverPayAmount({ pay_tier: null }, { pay_rate: 50 }), null);

assert.equal(weeklySubject(), 'Your Chance Classics bookings this week');
assert.equal(updatedSubject({ customer_name: 'Jane', event_date: '2026-09-13' }), 'Booking updated: Jane — Sun Sep 13');
assert.equal(assignedSubject({ customer_name: 'Jane', event_date: '2026-09-13' }), "You're on a booking: Jane — Sun Sep 13");
assert.equal(unassignedSubject({ customer_name: 'Jane', event_date: '2026-09-13' }), "You're off a booking: Jane — Sun Sep 13");

console.log('driver-emails tests passed');
