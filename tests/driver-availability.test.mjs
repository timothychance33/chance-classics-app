import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

import {
  blockedInterval as quoteBlockedInterval,
  travelMinutes as quoteTravelMinutes,
} from '../lib/quotes.mjs';
import {
  BOOKING_BUFFER_HOURS,
  DRIVE_MPH,
  DRIVER_BUSY_MESSAGE,
  blockedInterval,
  busyOfferAdvances,
  claimDecision,
  driverBusyWith,
  driverWindowsOverlap,
  offerRankFor,
  travelMinutes,
} from '../supabase/functions/_shared/driver-availability.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const scheduled = readFileSync(join(root, 'supabase/functions/scheduled-tasks/index.ts'), 'utf8');
const notify = readFileSync(join(root, 'supabase/functions/send-notification/index.ts'), 'utf8');
const claimFn = readFileSync(join(root, 'supabase/functions/claim-booking/index.ts'), 'utf8');
const migration = readFileSync(join(root, 'supabase/migrations/20261017160000_driver_claim_no_time_overlap.sql'), 'utf8');
const config = readFileSync(join(root, 'supabase/config.toml'), 'utf8');

assert.equal(BOOKING_BUFFER_HOURS, 2);
assert.equal(DRIVE_MPH, 55);
assert.equal(DRIVER_BUSY_MESSAGE, 'You already have a booking at that time');

const travelJobs = [
  { miles: 245 },
  { mileage_miles: 245, drive_minutes: null },
  { drive_minutes: 90, mileage_miles: 245 },
  { driveMinutes: 0, miles: 245 },
  { drive_minutes: null, mileage_miles: null },
  {},
  null,
];
for (const job of travelJobs) {
  assert.equal(travelMinutes(job), quoteTravelMinutes(job), `travelMinutes matches quotes for ${JSON.stringify(job)}`);
}
assert.equal(travelMinutes({ miles: 245 }), 268, '245 miles is ceil(245 / 55 * 60) minutes');

const morning = {
  id: 'am',
  driver_id: 'd1',
  event_date: '2026-10-16',
  start_time: '08:30',
  end_time: '10:30',
  status: 'confirmed',
};
const afternoon = {
  id: 'pm',
  event_date: '2026-10-16',
  start_time: '13:00',
  end_time: '17:00',
  status: 'confirmed',
};
const insideBuffer = {
  id: 'buf',
  event_date: '2026-10-16',
  start_time: '11:00',
  end_time: '13:00',
  status: 'confirmed',
};
const exactClear = {
  id: 'clear',
  event_date: '2026-10-16',
  start_time: '12:30',
  end_time: '14:30',
  status: 'confirmed',
};

assert.equal(driverWindowsOverlap(morning, afternoon), false, '1:00 PM is after the 2 hour buffer');
assert.equal(driverWindowsOverlap(afternoon, morning), false, 'the buffer check is symmetric');
assert.equal(driverWindowsOverlap(morning, insideBuffer), true, '11:00 AM sits inside the buffer');
assert.equal(driverWindowsOverlap(insideBuffer, morning), true);
assert.equal(driverWindowsOverlap(morning, exactClear), false, '12:30 is exactly when the buffer ends');
assert.equal(driverWindowsOverlap(exactClear, morning), false);

const later = { id: 'later', event_date: '2026-10-16', start_time: '15:00', end_time: '18:00', status: 'confirmed' };
const before = { id: 'before', event_date: '2026-10-16', start_time: '13:00', end_time: '15:00', status: 'confirmed' };
const endsAtBuffer = { id: 'edge', event_date: '2026-10-16', start_time: '11:00', end_time: '13:00', status: 'confirmed' };
assert.equal(driverWindowsOverlap(later, before), true, '2 hours before a 3:00 PM start is inside the buffer');
assert.equal(driverWindowsOverlap(later, endsAtBuffer), false, 'ending exactly when the buffer starts is clear');

const overnight = { id: 'late', event_date: '2026-10-10', start_time: '22:00', end_time: '00:00', status: 'confirmed' };
const nextMorning = { id: 'early', event_date: '2026-10-11', start_time: '01:00', end_time: '02:00', status: 'confirmed' };
const afterBuffer = { id: 'after', event_date: '2026-10-11', start_time: '02:00', end_time: '04:00', status: 'confirmed' };
assert.equal(driverWindowsOverlap(overnight, nextMorning), true, 'a midnight end blocks the next morning through the buffer');
assert.equal(driverWindowsOverlap(overnight, afterBuffer), false, '2:00 AM is exactly when the post-midnight buffer ends');

const cancelled = { ...morning, id: 'gone', status: 'cancelled' };
assert.equal(driverWindowsOverlap(cancelled, insideBuffer), false, 'cancelled bookings are ignored');
assert.equal(driverBusyWith('d1', insideBuffer, [cancelled, { ...morning, driver_id: 'd2' }]), null);

const noEnd = { id: 'no-end', driver_id: 'd1', event_date: '2026-10-16', start_time: '08:30', end_time: null, status: 'confirmed' };
assert.equal(driverWindowsOverlap(noEnd, afternoon), true, 'a same-day booking with no end still overlaps');
assert.equal(driverWindowsOverlap(noEnd, { ...afternoon, event_date: '2026-10-17' }), false);

// Dec 12 2026: New Iberia parade 5:00–7:00 PM, 245 miles, against a Shreveport
// wedding 9:30–11:30 PM with no stored drive. The same pair the car check rejects.
const shreveport = {
  id: 'shreveport',
  driver_id: 'd1',
  event_date: '2026-12-12',
  start_time: '21:30',
  end_time: '23:30',
  status: 'confirmed',
  mileage_miles: null,
  drive_minutes: null,
};
const newIberia = {
  id: 'new-iberia',
  driver_id: 'd1',
  event_date: '2026-12-12',
  start_time: '17:00',
  end_time: '19:00',
  status: 'confirmed',
  mileage_miles: 245,
  drive_minutes: null,
};
assert.equal(driverWindowsOverlap(newIberia, shreveport), true, '245 miles from New Iberia conflicts with a 9:30 PM job that has no drive');
assert.equal(driverWindowsOverlap(shreveport, newIberia), true, 'the same pair conflicts when the far job is the one already assigned');
assert.equal(
  driverWindowsOverlap({ ...newIberia, mileage_miles: null }, shreveport),
  false,
  'without miles the 5:00–7:00 PM parade does not reach 9:30 PM',
);
assert.equal(driverWindowsOverlap(shreveport, { ...newIberia, mileage_miles: null }), false);
assert.equal(driverBusyWith('d1', { ...newIberia, driver_id: null }, [shreveport])?.id, 'shreveport');
assert.equal(driverBusyWith('d1', { ...shreveport, driver_id: null }, [newIberia])?.id, 'new-iberia');

const shortParade = { ...newIberia, drive_minutes: 30, mileage_miles: 245 };
assert.equal(driverWindowsOverlap(shortParade, shreveport), false, 'a 30 minute stored drive touches the Shreveport buffer and is free');
assert.equal(driverWindowsOverlap(shreveport, shortParade), false);
assert.equal(
  driverWindowsOverlap({ ...newIberia, drive_minutes: 0 }, shreveport),
  false,
  'a stored drive of 0 stays local even when miles are 245',
);
assert.equal(driverWindowsOverlap({ ...newIberia, drive_minutes: 90 }, shreveport), true, 'a stored drive time replaces the 55 mph estimate');

for (const booking of [morning, newIberia, shreveport, shortParade, { ...newIberia, drive_minutes: 0 }]) {
  for (const buffer of [undefined, 0]) {
    const driverWindow = blockedInterval(booking, buffer);
    const quoteWindow = quoteBlockedInterval(booking, buffer);
    assert.equal(driverWindow.start, quoteWindow.start, `blocked start matches quotes for ${booking.id}`);
    assert.equal(driverWindow.end, quoteWindow.end, `blocked end matches quotes for ${booking.id}`);
  }
}

assert.equal(driverBusyWith('d1', insideBuffer, [morning])?.id, 'am');
assert.equal(driverBusyWith('d1', afternoon, [morning]), null);
assert.equal(driverBusyWith('d1', exactClear, [morning]), null);
assert.equal(driverBusyWith('d1', insideBuffer, [{ ...morning, id: insideBuffer.id }]), null, 'a booking does not overlap itself');

const staff = [
  { id: 'd1', role: 'driver', active: true, priority: 1, pulls_trailer: true },
  { id: 'd2', role: 'driver', active: true, priority: 2, pulls_trailer: true },
  { id: 'd3', role: 'driver,mechanic', active: true, priority: 3, pulls_trailer: false },
  { id: 'off', role: 'driver', active: false, priority: 4, pulls_trailer: true },
];
const offer = { id: 'offer', event_date: '2026-10-16', start_time: '11:00', end_time: '13:00', status: 'confirmed', needs_trailer: false };
assert.equal(offerRankFor(staff, offer, [morning], [], null), 2, 'priority 1 is skipped when that window is taken');
assert.equal(offerRankFor(staff, offer, [morning], ['d2'], null), 3);
assert.equal(offerRankFor(staff, { ...offer, needs_trailer: true }, [morning], ['d2'], null), null, 'a non-trailer driver is not offered a trailer job');
assert.equal(offerRankFor(staff, exactClear, [morning], [], null), 1, 'the buffer edge stays offerable');
assert.equal(offerRankFor(staff, offer, [{ ...morning, status: 'cancelled' }], [], null), 1);

const me = staff[0];
assert.deepEqual(claimDecision({
  me,
  booking: { ...offer, offer_rank: 1, driver_id: null },
  bookings: [morning],
}), { ok: false, status: 409, error: DRIVER_BUSY_MESSAGE });
assert.deepEqual(claimDecision({
  me,
  booking: { ...exactClear, offer_rank: 1, driver_id: null },
  bookings: [morning],
}), { ok: true });
assert.equal(claimDecision({
  me,
  booking: { ...exactClear, offer_rank: 2, driver_id: null },
  bookings: [],
}).status, 403);
assert.equal(claimDecision({
  me,
  booking: { ...offer, open_to_all: true, offer_rank: null, driver_id: null },
  bookings: [morning],
}).error, DRIVER_BUSY_MESSAGE);
assert.equal(claimDecision({
  me: null,
  booking: offer,
  bookings: [],
}).status, 403);
assert.equal(offerRankFor(staff, { ...newIberia, driver_id: null, needs_trailer: false }, [shreveport], [], null), 2, 'the far parade is not offered to the driver who has Shreveport');
assert.equal(offerRankFor(staff, { ...shreveport, driver_id: null, needs_trailer: false }, [newIberia], [], null), 2, 'Shreveport is not offered to the driver who has the far parade');
assert.equal(claimDecision({
  me,
  booking: { ...newIberia, driver_id: null, offer_rank: 1 },
  bookings: [shreveport],
}).error, DRIVER_BUSY_MESSAGE);
assert.equal(claimDecision({
  me,
  booking: { ...shreveport, driver_id: null, offer_rank: 1 },
  bookings: [newIberia],
}).error, DRIVER_BUSY_MESSAGE);

const open = { id: 'open', offer_rank: 1, driver_id: null, passed_by: [], event_date: '2026-10-16', start_time: '11:00', end_time: '13:00', status: 'confirmed' };
const advances = busyOfferAdvances(staff, me, [open], [morning]);
assert.equal(advances.length, 1);
assert.equal(advances[0].offer_rank, 2);
assert.deepEqual(advances[0].passed_by, ['d1']);
assert.equal(busyOfferAdvances(staff, me, [open], []).length, 0);

const start = html.indexOf('function clockMinutes');
const end = html.indexOf('function quoteSlot');
assert.ok(start > 0 && end > start);
const sandbox = { BOOKING_BUFFER_HOURS: 2 };
vm.createContext(sandbox);
vm.runInContext(html.slice(start, end), sandbox);
assert.equal(sandbox.driverWindowsOverlap(morning, insideBuffer), true);
assert.equal(sandbox.driverWindowsOverlap(morning, exactClear), false);
assert.equal(sandbox.driverWindowsOverlap(overnight, nextMorning), true);
assert.equal(sandbox.driverBusyWith('d1', insideBuffer, [morning]).id, 'am');
assert.equal(sandbox.driverBusyWith('d1', afternoon, [morning]), null);
assert.equal(sandbox.driverBusyWith('d1', exactClear, [morning]), null);
assert.equal(sandbox.driverWindowsOverlap(newIberia, shreveport), true, 'the garage copy conflicts on the New Iberia parade');
assert.equal(sandbox.driverWindowsOverlap(shreveport, newIberia), true, 'the garage copy conflicts in the other direction');
assert.equal(sandbox.driverWindowsOverlap({ ...newIberia, mileage_miles: null }, shreveport), false);
assert.equal(sandbox.driverWindowsOverlap(shortParade, shreveport), false);
assert.equal(sandbox.driverWindowsOverlap({ ...newIberia, drive_minutes: 0 }, shreveport), false);
assert.equal(sandbox.driverBusyWith('d1', { ...newIberia, driver_id: null }, [shreveport]).id, 'shreveport');
assert.equal(sandbox.driverBusyWith('d1', { ...shreveport, driver_id: null }, [newIberia]).id, 'new-iberia');
assert.match(html, /from\('bookings'\)\.select\('\*'\)/);
assert.match(html, /including the drive each way and the 2-hour buffer/);

assert.match(html, /const CLAIM_FN_URL = SUPABASE_URL \+ '\/functions\/v1\/claim-booking'/);
assert.match(html, /You already have a booking at that time/);
assert.match(html, /Skipped — already booked/);
assert.match(html, /fetch\(CLAIM_FN_URL/);
assert.match(html, /offerRankFor\(\{\.\.\.rec, id:id\|\|null\}/);
assert.match(html, /for\(const d of offerDrivers\(b\)\)/);
assert.doesNotMatch(html.slice(html.indexOf('async function claimBooking'), html.indexOf('async function passBooking')), /Claim this one too/);
assert.doesNotMatch(html, /service_role/);

assert.match(scheduled, /driverBusyWith/);
assert.match(scheduled, /offerRankFor/);
assert.match(scheduled, /skipped_busy/);
assert.match(scheduled, /already has a booking at that time/);
assert.doesNotMatch(scheduled, /service_role/);

assert.match(notify, /offerSkippedForBusyDriver/);
assert.match(notify, /DRIVER_BUSY_MESSAGE/);
assert.match(notify, /skipped: "driver_busy"/);
assert.doesNotMatch(notify, /service_role/);

assert.match(claimFn, /claimDecision/);
assert.match(claimFn, /assigned_by: "claim"/);
assert.match(claimFn, /busyOfferAdvances/);
const assignedCols = 'id,driver_id,event_date,start_time,end_time,status,drive_minutes,mileage_miles';
assert.equal(claimFn.split(`"${assignedCols}"`).length - 1, 2, 'claim loads drive time for the assigned rows before and after the claim');
assert.match(claimFn, /offer_rank,passed_by,open_to_all,needs_trailer,pay_tier,drive_minutes,mileage_miles/);
assert.match(scheduled, new RegExp(`select\\("${assignedCols}"\\)`));
assert.match(notify, /select\("id,event_date,start_time,end_time,status,driver_id,drive_minutes,mileage_miles"\)/);
assert.match(notify, new RegExp(`select\\("${assignedCols}"\\)`));
assert.doesNotMatch(claimFn, /select\("id,driver_id,event_date,start_time,end_time,status"\)/);
assert.doesNotMatch(scheduled, /select\("id,driver_id,event_date,start_time,end_time,status"\)/);
assert.doesNotMatch(notify, /select\("id,driver_id,event_date,start_time,end_time,status"\)/);
assert.doesNotMatch(notify, /select\("id,event_date,start_time,end_time,status,driver_id"\)/);
assert.match(claimFn, /ignored secret in the query string/);
assert.doesNotMatch(claimFn, /searchParams\.get\(["']secret["']\)/);

assert.match(config, /\[functions\.claim-booking\]/);
assert.match(config, /verify_jwt = false/);

assert.match(migration, /NOT APPLIED/);
assert.match(migration, /You already have a booking at that time/);
assert.match(migration, /interval '2 hours'/);
assert.match(migration, /assigned_by is not distinct from 'owner'/);
assert.match(migration, /status is distinct from 'cancelled'/);
assert.match(migration, /security invoker/);
assert.match(readFileSync(join(root, 'sw.js'), 'utf8'), /chance-classics-v9/);

console.log('driver-availability tests passed');
