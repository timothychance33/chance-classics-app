import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import {
  calcQuoteFromBase,
  carsForAlternateOffers,
  carsOpenOnDate,
  defaultAlternateNote,
  defaultUnavailableNote,
  ELVIRA_CAR_ID,
  findBookingClash,
  HOTEL_FEE,
  isElviraCar,
  money,
  pricedAlternateQuotes,
} from '../lib/quotes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const notify = readFileSync(join(root, 'supabase/functions/send-notification/index.ts'), 'utf8');

const mustang = { id: 'm', name: '1965 Mustang', base_rate: 500, book_url: 'https://www.chanceclassics.com/mustang' };
const chevy = { id: 'c', name: '1957 Chevy', base_rate: 600, book_url: 'https://www.chanceclassics.com/chevy' };
const impala = { id: 'i', name: '1964 Impala', base_rate: 450 };
const elvira = { id: ELVIRA_CAR_ID, name: 'Elvira', base_rate: 0 };
const cars = [mustang, chevy, impala, elvira];
const bookings = [
  { id: 'b1', car_id: 'm', event_date: '2026-10-10', status: 'confirmed', customer_name: 'Other wedding' },
  { id: 'b2', car_id: 'c', event_date: '2026-10-10', status: 'cancelled' },
  { id: 'b3', car_id: 'i', event_date: '2026-10-11', status: 'confirmed' },
];

// Same hours/miles/hotel, only the car (base rate) changes.
const hours = 4, miles = 45, hotel = HOTEL_FEE;
const mustangQ = calcQuoteFromBase(500, hours, miles, hotel);
const chevyQ = calcQuoteFromBase(600, hours, miles, hotel);
const impalaQ = calcQuoteFromBase(450, hours, miles, hotel);

assert.equal(mustangQ.extraH, 2);
assert.equal(mustangQ.overage, 200);
assert.equal(mustangQ.travel, 135);
assert.equal(mustangQ.hotel, 200);
assert.equal(mustangQ.subtotal, 500 + 200 + 135 + 200);
assert.equal(chevyQ.overage, mustangQ.overage);
assert.equal(chevyQ.travel, mustangQ.travel);
assert.equal(chevyQ.hotel, mustangQ.hotel);
assert.ok(chevyQ.total > mustangQ.total);
assert.ok(impalaQ.total < mustangQ.total);

assert.ok(findBookingClash(bookings, 'm', '2026-10-10'));
assert.equal(findBookingClash(bookings, 'c', '2026-10-10'), null, 'cancelled booking does not block a car');
assert.equal(findBookingClash(bookings, 'i', '2026-10-10'), null);

const open = carsOpenOnDate(cars, bookings, '2026-10-10', 'm');
assert.deepEqual(open.map((c) => c.id), ['c', 'i', ELVIRA_CAR_ID], 'Elvira stays in true availability');

assert.equal(isElviraCar(elvira), true);
assert.equal(isElviraCar({ id: 'x', name: ' elvira ' }), true);
assert.equal(isElviraCar(chevy), false);
const offered = carsForAlternateOffers(cars, bookings, '2026-10-10', 'm');
assert.deepEqual(offered.map((c) => c.id), ['c', 'i'], 'Elvira is not an alternate offer');

const alts = pricedAlternateQuotes(cars, bookings, '2026-10-10', 'm', hours, miles, hotel);
assert.equal(alts.length, 2);
assert.equal(alts[0].name, '1957 Chevy');
assert.equal(alts[0].total, chevyQ.total);
assert.equal(alts[0].book_url, chevy.book_url);
assert.equal(alts[1].name, '1964 Impala');
assert.equal(alts[1].total, impalaQ.total);
assert.equal(alts[1].book_url, null);
assert.ok(!alts.some((a) => isElviraCar(a)));
const elviraOnly = pricedAlternateQuotes([elvira], [], '2026-10-10', 'm', hours, miles, hotel);
assert.equal(elviraOnly.length, 0, 'if only Elvira is free, do not offer priced alternates');
const elviraDirect = calcQuoteFromBase(elvira.base_rate, hours, miles, hotel);
assert.equal(elviraDirect.base, 0, 'direct Elvira quote math is unchanged');

const restBooked = [
  ...bookings,
  { id: 'b4', car_id: 'c', event_date: '2026-10-10', status: 'confirmed' },
  { id: 'b5', car_id: 'i', event_date: '2026-10-10', status: 'confirmed' },
];
assert.equal(carsForAlternateOffers(cars, restBooked, '2026-10-10', 'm').length, 0, 'Elvira alone does not count as an alternate');
const noneOpen = carsOpenOnDate(
  cars,
  [
    ...restBooked,
    { id: 'b6', car_id: ELVIRA_CAR_ID, event_date: '2026-10-10', status: 'confirmed' },
  ],
  '2026-10-10',
  'm',
);
assert.equal(noneOpen.length, 0);

assert.match(defaultAlternateNote({ requestedName: '1965 Mustang', evDate: '2026-10-10' }), /1965 Mustang is already booked on 2026-10-10/);
assert.match(defaultAlternateNote({ requestedName: '1965 Mustang', evDate: '2026-10-10' }), /prices for the cars we still have open/);
assert.match(defaultUnavailableNote({ requestedName: '1965 Mustang', evDate: '2026-10-10' }), /other cars are booked that day as well/);
assert.equal(money(1210), '$1210.00');

// Browser builder reuses the same helpers and still has the normal send path.
assert.match(html, /function findBookingClash/, 'availability helper is in the builder');
assert.match(html, /function carsOpenOnDate/, 'open-car helper is in the builder');
assert.match(html, /function isElviraCar/, 'builder knows Elvira by name and id');
assert.match(html, /function carsForAlternateOffers/, 'priced-offer list has its own helper');
assert.match(html, /function pricedAlternateQuotes/, 'alternate pricing reuses calcQuote');
assert.match(html, /function alternateQuotesNotice/, 'Tim can draft priced options');
assert.match(html, /function sendAlternateQuotes/, 'priced options go out through send-notification');
assert.match(html, /type:'quote_alternatives'/, 'browser posts quote_alternatives, not a second mailer');
assert.match(html, /function sendQuote/, 'single-car send path stays');
assert.match(html, /type:'quote'/, 'available-car emails stay type quote');
assert.match(html, /function unavailableNotice/, 'all-booked path still has the unavailable draft');
assert.match(html, /type:'unavailable'/, 'all-booked email stays unavailable');
assert.match(html, /Send prices for \$\{others\.length\} open car/, 'primary CTA is priced options when others are free');
assert.match(html, /Open that day — same trip, each car priced/, 'builder shows priced open cars');
assert.match(html, /id="q_alts"/, 'priced list has a home in the builder');
assert.match(html, /id="q_send_row"/, 'send actions swap based on availability');
assert.match(html, /Hours, miles, and hotel still apply/, 'copy says trip details stay, car swaps');
assert.match(html, /function quoteTripInputs/, 'miles\/hours\/hotel are read once and reused');
assert.match(html, / — booked/, 'car dropdown marks booked cars');
assert.match(html, /if\(clash\)\{\s*const others=carsForAlternateOffers/, 'Send to customer will not quote a booked car');
assert.match(html, /return \(DATA\.cars\|\|\[\]\)\.map\(c=>/, 'car dropdown still lists every car, including Elvira');
assert.doesNotMatch(html, /function quoteCarOptions[\s\S]*isElviraCar/, 'dropdown does not hide Elvira');
assert.match(html, /OWNER_ONLY_TABS=\['staff','earnings','quotes'\]/, 'Quotes stays owner-only');
assert.match(html, /if\(!isOwnerView\(\)\)\{ el\.innerHTML=`<div class="empty"><div class="big">Quotes<\/div>Owner only\./, 'staff still see Quotes as owner only');
assert.doesNotMatch(html, /service_role/, 'no service_role in the browser app');

// Edge function: new type sits next to quote / unavailable, still Resend.
assert.match(notify, /type === "quote_alternatives"/, 'send-notification knows quote_alternatives');
assert.match(notify, /trim\(\)\.toLowerCase\(\) !== "elvira"/, 'quote_alternatives email drops Elvira by name');
assert.match(notify, /Cars still open/, 'alternate email subject is practical');
assert.match(notify, /A few cars are still open/, 'alternate email heading');
assert.match(notify, /Book this car/, 'each priced car can be booked');
assert.match(notify, /doesn't hold a date/, 'alternate email does not pretend to reserve');
assert.match(notify, /type === "quote"/, 'normal quote type is unchanged');
assert.match(notify, /type === "unavailable"/, 'unavailable type is unchanged');
assert.match(notify, /api\.resend\.com\/emails/, 'still Resend');
assert.doesNotMatch(notify, /service_role/);

console.log('quote-alternates tests passed');
