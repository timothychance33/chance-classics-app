import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

import { calcQuoteFromBase } from '../lib/quotes.mjs';
import { allowQuoteMileage, roleTokens } from '../supabase/functions/quote-mileage/access.mjs';
import {
  FREE_MILES,
  PER_MILE,
  SHOP_ADDRESS,
  destinationWaypoint,
  distanceMatrixBody,
  mileageCharge,
  mileageMessage,
  quoteDrivingMileage,
  reviewMileage,
  routeMatrixDriveMinutes,
  routeMatrixMiles,
} from '../supabase/functions/_shared/mileage.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const fn = readFileSync(join(root, 'supabase/functions/quote-mileage/index.ts'), 'utf8');
const config = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
const METERS_PER_MILE = 1609.344;

assert.equal(SHOP_ADDRESS, '118 5th St E, Benton, LA 71006');
assert.equal(FREE_MILES, 30);
assert.equal(PER_MILE, 3);

assert.equal(mileageCharge(25).miles, 25);
assert.equal(mileageCharge(25).fee, 0);
assert.equal(mileageCharge(30).miles, 30);
assert.equal(mileageCharge(30).fee, 0);
assert.equal(mileageCharge(30.2).miles, 31);
assert.equal(mileageCharge(30.2).fee, 93);
assert.equal(mileageCharge(31).miles, 31);
assert.equal(mileageCharge(31).fee, 93);
assert.equal(mileageCharge(60).miles, 60);
assert.equal(mileageCharge(60).fee, 180);
assert.equal(mileageMessage(mileageCharge(12)), '12 miles from Benton to pickup. No mileage fee.');
assert.equal(mileageMessage(mileageCharge(45)), '45 miles from Benton to pickup. Mileage fee $135, billed with the balance.');
assert.deepEqual(reviewMileage(), {
  needsReview: true,
  miles: null,
  fee: null,
  driveMinutes: null,
  message: "We'll confirm mileage.",
});

assert.equal(calcQuoteFromBase(500, 4, 45, 0).travel, 135);
assert.equal(calcQuoteFromBase(500, 4, 45, 0).mi, 45);
assert.equal(calcQuoteFromBase(500, 2, 30, 0).travel, 0);
assert.equal(calcQuoteFromBase(500, 2, 30.2, 0).mi, 31);
assert.equal(calcQuoteFromBase(500, 2, 30.2, 0).travel, 93);
assert.equal(calcQuoteFromBase(500, 2, 60, 0).travel, 180);

assert.equal(routeMatrixMiles([{ originIndex: 0, destinationIndex: 0, condition: 'ROUTE_EXISTS', distanceMeters: 25 * METERS_PER_MILE }]), 25);
assert.equal(routeMatrixMiles([{ originIndex: 1, destinationIndex: 0, condition: 'ROUTE_EXISTS', distanceMeters: 1000 }]), null);
assert.equal(routeMatrixMiles([{ originIndex: 0, destinationIndex: 0, condition: 'ROUTE_NOT_FOUND', distanceMeters: 1000 }]), null);
assert.equal(routeMatrixMiles({ distanceMeters: 1000, condition: 'ROUTE_EXISTS' }), null);
assert.equal(routeMatrixMiles([{ condition: 'ROUTE_EXISTS', distanceMeters: -1 }]), null);

assert.deepEqual(destinationWaypoint(undefined, '1001 Airport Dr, Shreveport, LA'), { address: '1001 Airport Dr, Shreveport, LA' });
assert.deepEqual(destinationWaypoint('ChIJxyz', 'ab'), { placeId: 'ChIJxyz' });
assert.equal(destinationWaypoint('', 'no'), null);
assert.equal(distanceMatrixBody({ address: 'Shreveport, LA' }).origins[0].waypoint.address, SHOP_ADDRESS);
assert.equal(distanceMatrixBody({ address: 'Shreveport, LA' }).travelMode, 'DRIVE');

const calls = [];
async function fakeFetch(body, ok = true) {
  return quoteDrivingMileage(
    { pickup: '1001 Airport Dr, Shreveport, LA' },
    {
      apiKey: 'test-key',
      fetch: async (url, init) => {
        calls.push({ url, init });
        return { ok, json: async () => body };
      },
    },
  );
}

const far = await fakeFetch([{ originIndex: 0, destinationIndex: 0, condition: 'ROUTE_EXISTS', distanceMeters: 30.2 * METERS_PER_MILE }]);
assert.equal(far.needsReview, false);
assert.equal(far.miles, 31);
assert.equal(far.fee, 93);
assert.equal(far.driveMinutes, null);
assert.match(far.message, /Mileage fee \$93/);
assert.equal(calls[0].url, 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix');
assert.equal(calls[0].init.headers['X-Goog-Api-Key'], 'test-key');
assert.equal(calls[0].init.headers['X-Goog-FieldMask'], 'originIndex,destinationIndex,distanceMeters,duration,status,condition');
assert.equal(calls[0].init.method, 'POST');
const sent = JSON.parse(calls[0].init.body);
assert.equal(sent.origins[0].waypoint.address, SHOP_ADDRESS);
assert.equal(sent.destinations[0].waypoint.address, '1001 Airport Dr, Shreveport, LA');
assert.equal(sent.travelMode, 'DRIVE');

const near = await quoteDrivingMileage(
  { pickup: '200 Crockett St, Shreveport, LA', pickupPlaceId: 'ignored-when-address-is-long' },
  {
    apiKey: 'test-key',
    fetch: async (_url, init) => {
      assert.equal(JSON.parse(init.body).destinations[0].waypoint.address, '200 Crockett St, Shreveport, LA');
      return { ok: true, json: async () => [{ originIndex: 0, destinationIndex: 0, condition: 'ROUTE_EXISTS', distanceMeters: 25 * METERS_PER_MILE }] };
    },
  },
);
assert.equal(near.miles, 25);
assert.equal(near.fee, 0);
assert.match(near.message, /No mileage fee/);

const byPlace = await quoteDrivingMileage(
  { pickup: 'ab', pickupPlaceId: 'ChIJxyz' },
  {
    apiKey: 'test-key',
    fetch: async (_url, init) => {
      assert.deepEqual(JSON.parse(init.body).destinations[0].waypoint, { placeId: 'ChIJxyz' });
      return { ok: true, json: async () => [{ originIndex: 0, destinationIndex: 0, condition: 'ROUTE_EXISTS', distanceMeters: 60 * METERS_PER_MILE }] };
    },
  },
);
assert.equal(byPlace.miles, 60);
assert.equal(byPlace.fee, 180);

const withDuration = [{
  originIndex: 0,
  destinationIndex: 0,
  condition: 'ROUTE_EXISTS',
  distanceMeters: 75 * METERS_PER_MILE,
  duration: '4500s',
}];
assert.equal(routeMatrixDriveMinutes(withDuration), 75);
assert.equal(routeMatrixDriveMinutes([{
  originIndex: 0,
  destinationIndex: 0,
  condition: 'ROUTE_EXISTS',
  distanceMeters: 1000,
  duration: { seconds: '119' },
}]), 2);
assert.equal(routeMatrixDriveMinutes([{ condition: 'ROUTE_NOT_FOUND', duration: '600s' }]), null);
const timed = await fakeFetch(withDuration);
assert.equal(timed.miles, 75);
assert.equal(timed.driveMinutes, 75);

let fetched = false;
const noKey = await quoteDrivingMileage(
  { pickup: '1001 Airport Dr, Shreveport, LA' },
  { apiKey: '', fetch: async () => { fetched = true; return { ok: true, json: async () => [] }; } },
);
assert.equal(fetched, false);
assert.equal(noKey.needsReview, true);
assert.equal((await quoteDrivingMileage({ pickup: 'LA' }, { apiKey: 'test-key', fetch: async () => { throw new Error('should not fetch'); } })).needsReview, true);
assert.equal((await fakeFetch([{ condition: 'ROUTE_NOT_FOUND' }], true)).needsReview, true);
assert.equal((await fakeFetch([], false)).needsReview, true);
assert.equal((await quoteDrivingMileage(
  { pickup: '1001 Airport Dr, Shreveport, LA' },
  { apiKey: 'test-key', fetch: async () => { throw new Error('network'); } },
)).needsReview, true);

assert.deepEqual(roleTokens(' Admin, Driver '), ['admin', 'driver']);
assert.deepEqual(allowQuoteMileage({ roles: ['admin'] }), { ok: true, via: 'admin' });
assert.equal(allowQuoteMileage({ roles: 'admin,driver' }).via, 'admin');
assert.deepEqual(allowQuoteMileage({ roles: ['driver'] }), { ok: false, via: 'denied' });
assert.deepEqual(allowQuoteMileage({ roles: ['mechanic'] }), { ok: false, via: 'denied' });
assert.deepEqual(allowQuoteMileage({ roles: [] }), { ok: false, via: 'denied' });

assert.match(html, /const MILEAGE_FN_URL = SUPABASE_URL \+ '\/functions\/v1\/quote-mileage'/);
assert.match(html, /function postQuoteMileage/);
assert.match(html, /function autofillQuoteMileage/);
const autofill = html.slice(html.indexOf('async function autofillQuoteMileage'), html.indexOf('function ensureBookToken'));
assert.match(autofill, /missing drop-off is ignored/);
assert.match(autofill, /event_location/);
assert.doesNotMatch(autofill, /dropoff_location/);
assert.match(fn, /A quote with no drop-off still looks up/);
assert.match(html, /function lookupQuoteMiles/);
assert.match(html, /function maybeAutofillQuoteMileage/);
assert.match(html, /maybeAutofillQuoteMileage\(\)/);
assert.match(html, /id="q_mileage_lookup"/);
assert.match(html, /id="q_mileage_note"/);
assert.match(html, /Look up from pickup/);
assert.match(html, /118 5th St E, Benton, LA/);
assert.match(html, /\$3 per mile for the full distance, from mile one/);
assert.match(html, /function wholeQuoteMiles/);
assert.match(html, /Math\.ceil\(n-1e-6\)/);
assert.match(html, /const mi=wholeQuoteMiles\(miles\)/);
assert.match(html, /One-way miles from Benton/);
assert.doesNotMatch(html, /0 if within 30/);
assert.doesNotMatch(html, /GOOGLE_MAPS_API_KEY/);
assert.doesNotMatch(html, /X-Goog-Api-Key/);
assert.doesNotMatch(html, /quote-mileage\?secret/);
assert.doesNotMatch(html, /service_role/);
assert.equal((html.match(/fetch\(MILEAGE_FN_URL/g) || []).length, 1, 'only postQuoteMileage calls the function');

assert.match(fn, /GOOGLE_MAPS_API_KEY/);
assert.match(fn, /quoteDrivingMileage/);
assert.match(fn, /auth\.getUser/);
assert.match(fn, /from\("profiles"\)/);
assert.match(fn, /allowQuoteMileage/);
assert.match(fn, /from "npm:@supabase\/supabase-js@2"/);
assert.match(fn, /ignored secret in the query string/);
assert.doesNotMatch(fn, /searchParams\.get\(["']secret["']\)/);
assert.doesNotMatch(fn, /X-Goog-Api-Key/);
assert.match(config, /\[functions\.quote-mileage\]\s+verify_jwt = false/);

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter((s) => s.trim());
for (const source of scripts) new vm.Script(source);

console.log('quote-mileage tests passed');
