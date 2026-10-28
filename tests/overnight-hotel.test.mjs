import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

import {
  HOTEL_LINE_LABEL,
  HOTEL_MILES_OVER,
  HOTEL_NIGHT_USD,
  HOTEL_RETURN_CUTOFF_MINUTES,
  hotelNotesLine,
  overnightDriverHotel,
} from '../supabase/functions/_shared/overnight-hotel.mjs';
import { HOTEL_FEE } from '../lib/quotes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

assert.equal(HOTEL_MILES_OVER, 60);
assert.equal(HOTEL_RETURN_CUTOFF_MINUTES, 120);
assert.equal(HOTEL_NIGHT_USD, 200);
assert.equal(HOTEL_FEE, 200);
assert.equal(HOTEL_LINE_LABEL, 'Overnight driver hotel');
assert.match(html, /const HOTEL_MILES_OVER=60, HOTEL_RETURN_CUTOFF_MINUTES=2\*60, HOTEL_NIGHT_USD=200/);

function hotel(miles, driveMinutes, extra = {}) {
  return overnightDriverHotel({
    miles,
    driveMinutes,
    eventDate: '2026-06-06',
    startTime: '18:00',
    hours: 6,
    ...extra,
  });
}

// Event ends at midnight. Drive time is the only thing that moves the return.
const beforeCutoff = hotel(61, 119);
const atCutoff = hotel(61, 120);
assert.equal(beforeCutoff.returnLabel, '1:59 AM the next day');
assert.equal(beforeCutoff.applies, false);
assert.equal(beforeCutoff.nights, 0);
assert.equal(beforeCutoff.fee, 0);
assert.equal(atCutoff.returnLabel, '2:00 AM the next day');
assert.equal(atCutoff.applies, true);
assert.equal(atCutoff.nights, 1);
assert.equal(atCutoff.fee, 200);
assert.match(atCutoff.reason, /61 miles from Benton/);
assert.match(atCutoff.reason, /Estimated return to the shop: 2:00 AM the next day/);
assert.match(atCutoff.lineLabel, /Overnight driver hotel — 61 mi from Benton, driver back about 2:00 AM the next day/);

const fiftyNine = hotel(59, 120);
const sixty = hotel(60, 120);
const sixtyPointTwo = hotel(60.2, 120);
assert.equal(fiftyNine.miles, 59);
assert.equal(fiftyNine.distanceQualifies, false);
assert.equal(fiftyNine.fee, 0);
assert.match(fiftyNine.reason, /60 miles or less/);
assert.equal(sixty.miles, 60);
assert.equal(sixty.fee, 0);
assert.equal(sixtyPointTwo.miles, 61);
assert.equal(sixtyPointTwo.fee, 200);

// Start 10:00 PM, 1.5 hours ends 11:30 PM. Drive crosses midnight.
const cross = overnightDriverHotel({
  miles: 75,
  driveMinutes: 150,
  eventDate: '2026-06-06',
  startTime: '22:00',
  hours: 1.5,
});
const crossEarly = overnightDriverHotel({
  miles: 75,
  driveMinutes: 149,
  eventDate: '2026-06-06',
  startTime: '22:00',
  hours: 1.5,
});
assert.equal(cross.returnLabel, '2:00 AM the next day');
assert.equal(cross.nights, 1);
assert.equal(cross.fee, 200);
assert.equal(crossEarly.returnLabel, '1:59 AM the next day');
assert.equal(crossEarly.nights, 0);
assert.equal(crossEarly.fee, 0);
assert.match(hotelNotesLine(cross), /Overnight driver hotel: \$200\.00 \(75 miles from Benton, driver back about 2:00 AM the next day\)/);

// Friday 6:00 PM plus 48 hours ends Sunday 6:00 PM. A 30 minute drive is still out for two 2:00 AM marks.
const twoNights = overnightDriverHotel({
  miles: 80,
  driveMinutes: 30,
  eventDate: '2026-06-05',
  startTime: '18:00',
  hours: 48,
});
assert.equal(twoNights.returnLabel, '6:30 PM, 2 days later');
assert.equal(twoNights.nights, 2);
assert.equal(twoNights.fee, 400);
assert.match(twoNights.lineLabel, /\(2 nights\)/);

const sameDay = overnightDriverHotel({
  miles: 80,
  driveMinutes: 30,
  eventDate: '2026-06-06',
  startTime: '10:00',
  hours: 4,
});
assert.equal(sameDay.returnLabel, '2:30 PM');
assert.equal(sameDay.fee, 0);
assert.match(sameDay.reason, /before 2:00 AM/);

const unknown = overnightDriverHotel({
  miles: 80,
  eventDate: '2026-06-06',
  startTime: '22:00',
  hours: 4,
});
assert.equal(unknown.known, false);
assert.equal(unknown.fee, 0);

// The garage copy in index.html must match the shared module on these edges.
const garageSource = [
  html.slice(html.indexOf('const HOTEL_MILES_OVER'), html.indexOf('const FOLLOWUP_DAYS')),
  html.slice(html.indexOf('function wholeQuoteMiles'), html.indexOf('function mileageFeeNote')),
  html.slice(html.indexOf('function hotelCutoffLabel'), html.indexOf('function calcQuote(')),
  html.slice(html.indexOf('function clockMinutes'), html.indexOf('function blockedInterval')),
].join('\n');
const garage = { overnightDriverHotel: null };
vm.runInNewContext(`${garageSource}\nthis.overnightDriverHotel = overnightDriverHotel;`, garage);

const edges = [
  { miles: 61, driveMinutes: 119, eventDate: '2026-06-06', startTime: '18:00', hours: 6 },
  { miles: 61, driveMinutes: 120, eventDate: '2026-06-06', startTime: '18:00', hours: 6 },
  { miles: 59, driveMinutes: 120, eventDate: '2026-06-06', startTime: '18:00', hours: 6 },
  { miles: 60, driveMinutes: 120, eventDate: '2026-06-06', startTime: '18:00', hours: 6 },
  { miles: 60.2, driveMinutes: 120, eventDate: '2026-06-06', startTime: '18:00', hours: 6 },
  { miles: 75, driveMinutes: 150, eventDate: '2026-06-06', startTime: '22:00', hours: 1.5 },
  { miles: 75, driveMinutes: 149, eventDate: '2026-06-06', startTime: '22:00', hours: 1.5 },
  { miles: 80, driveMinutes: 30, eventDate: '2026-06-05', startTime: '18:00', hours: 48 },
  { miles: 80, driveMinutes: 30, eventDate: '2026-06-06', startTime: '10:00', hours: 4 },
];
for (const input of edges) {
  const shared = overnightDriverHotel(input);
  const fromPage = garage.overnightDriverHotel(input);
  assert.equal(fromPage.miles, shared.miles);
  assert.equal(fromPage.fee, shared.fee);
  assert.equal(fromPage.nights, shared.nights);
  assert.equal(fromPage.returnLabel, shared.returnLabel);
  assert.equal(fromPage.applies, shared.applies);
  assert.equal(fromPage.lineLabel, shared.lineLabel);
}

console.log('overnight hotel tests passed');
