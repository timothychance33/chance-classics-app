import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import { ALERT_TO, couldNotRunText, handleRequest } from '../supabase/functions/wix-booking-audit/audit.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexSrc = readFileSync(join(root, 'supabase/functions/wix-booking-audit/index.ts'), 'utf8');
const MISSING_KEY = 'Wix API key not configured (Vault secret wix_api_key)';

function request(body, secret = 'ok') {
  return new Request('https://example.test/wix-booking-audit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cron-secret': secret },
    body: JSON.stringify(body ?? {}),
  });
}

function deps(overrides = {}) {
  const sent = [];
  return {
    sent,
    async verifySecret(candidate) { return candidate === 'ok'; },
    async getWixKey() { return 'key'; },
    async fetchWixBookings() { return []; },
    async getAppBookings() { return []; },
    async sendEmail(message) { sent.push(message); return 're_1'; },
    now: () => new Date('2026-10-26T13:00:00Z'),
    ...overrides,
  };
}

const unauthorized = deps();
const denied = await handleRequest(request({}, ''), unauthorized);
assert.equal(denied.status, 401);
assert.equal(unauthorized.sent.length, 0);

const skipped = deps({ now: () => new Date('2026-10-26T15:00:00Z') });
const skipRes = await handleRequest(request({ only_at_chicago_hour: 8 }), skipped);
assert.equal(skipRes.status, 200);
assert.equal(skipped.sent.length, 0);
assert.equal((await skipRes.json()).skipped, 'not the scheduled Chicago hour');

const quiet = deps();
const quietRes = await handleRequest(request({}), quiet);
assert.equal(quietRes.status, 200);
assert.equal((await quietRes.json()).sent, false);
assert.equal(quiet.sent.length, 0);

const missingKey = deps({ async getWixKey() { return null; } });
const missingRes = await handleRequest(request({}), missingKey);
assert.equal(missingRes.status, 503);
assert.equal((await missingRes.json()).error, MISSING_KEY);
assert.equal(missingKey.sent.length, 1);
assert.equal(missingKey.sent[0].subject, couldNotRunText(MISSING_KEY));
assert.equal(missingKey.sent[0].text, missingKey.sent[0].subject);
assert.equal(missingKey.sent[0].text, 'Wix booking audit could not run: Wix API key not configured (Vault secret wix_api_key)');
assert.deepEqual(missingKey.sent[0].to, ALERT_TO);
assert.match(missingKey.sent[0].html, /Wix booking audit could not run/);

const dryMissing = deps({ async getWixKey() { return ''; } });
const dryRes = await handleRequest(request({ dry_run: true }), dryMissing);
assert.equal(dryRes.status, 503);
assert.equal(dryMissing.sent.length, 1);
assert.match(dryMissing.sent[0].text, /^Wix booking audit could not run: /);

const wixDown = deps({
  async fetchWixBookings() { throw new Error('Wix 401: unauthorized'); },
});
const wixRes = await handleRequest(request({}), wixDown);
assert.equal(wixRes.status, 500);
assert.equal((await wixRes.json()).error, 'Wix 401: unauthorized');
assert.equal(wixDown.sent[0].text, 'Wix booking audit could not run: Wix 401: unauthorized');
assert.equal(wixDown.sent[0].subject, wixDown.sent[0].text);

const queryDown = deps({
  async getAppBookings() { throw new Error('bookings query: timeout'); },
});
const queryRes = await handleRequest(request({ test: true }), queryDown);
assert.equal(queryRes.status, 500);
assert.equal(queryDown.sent.length, 1);
assert.equal(queryDown.sent[0].text, 'Wix booking audit could not run: bookings query: timeout');
assert.deepEqual(queryDown.sent[0].to, ALERT_TO);

const noticeDown = deps({
  async getWixKey() { return null; },
  async sendEmail() { throw new Error('RESEND_API_KEY is not set'); },
});
const noticeRes = await handleRequest(request({}), noticeDown);
assert.equal(noticeRes.status, 503);
assert.equal((await noticeRes.json()).error, MISSING_KEY);

const confirmed = [{
  booking: {
    id: 'w1',
    status: 'CONFIRMED',
    startDate: '2026-11-01T18:00:00Z',
    contactDetails: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
    bookedEntity: { title: 'Wedding', slot: { resource: { name: 'Elsa' } } },
  },
}];
const alert = deps({
  async fetchWixBookings() { return confirmed; },
});
const alertRes = await handleRequest(request({}), alert);
assert.equal(alertRes.status, 200);
assert.equal(alert.sent.length, 1);
assert.match(alert.sent[0].subject, /missing from the Chance Classics app/);
assert.doesNotMatch(alert.sent[0].subject, /could not run/);
assert.match(alert.sent[0].text, /Ada Lovelace/);
assert.deepEqual(alert.sent[0].to, ALERT_TO);

assert.match(indexSrc, /FROM_EMAIL = Deno\.env\.get\('FROM_EMAIL'\) \?\? DEFAULT_FROM_EMAIL/);
assert.match(indexSrc, /from: `Chance Classics <\$\{FROM_EMAIL\}>`/);
assert.match(indexSrc, /htmlToPlainText/);
assert.match(indexSrc, /text: plain/);
assert.match(indexSrc, /from '\.\.\/_shared\/email-plain\.mjs'/);
assert.doesNotMatch(indexSrc, /noreply@chanceclassics\.com/);
assert.doesNotMatch(indexSrc, /function htmlToPlainText/);

console.log('wix-booking-audit tests passed');
