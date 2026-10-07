import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

import { allowNotify, roleTokens, secretMatches } from '../supabase/functions/send-notification/access.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const notifyDir = join(root, 'supabase/functions/send-notification');
const index = readFileSync(join(notifyDir, 'index.ts'), 'utf8');
const quotes = readFileSync(join(notifyDir, 'quotes.ts'), 'utf8');
const shared = readFileSync(join(notifyDir, 'shared.ts'), 'utf8');

assert.equal(secretMatches('same-value', 'same-value'), true);
assert.equal(secretMatches('same-value', 'same-valuE'), false);
assert.equal(secretMatches('same-value', ''), false);
assert.equal(secretMatches('', 'same-value'), false);
assert.deepEqual(roleTokens(' Admin, Driver '), ['admin', 'driver']);

assert.deepEqual(allowNotify({ secretOk: true, roles: [], type: 'quote' }), { ok: true, via: 'secret' });
assert.deepEqual(allowNotify({ secretOk: false, roles: ['admin'], type: 'quote_declined' }), { ok: true, via: 'admin' });
assert.deepEqual(allowNotify({ secretOk: false, roles: 'driver,mechanic', type: 'offer' }), { ok: true, via: 'driver' });
assert.deepEqual(allowNotify({ secretOk: false, roles: ['driver'], type: 'claimed' }), { ok: true, via: 'driver' });
assert.deepEqual(allowNotify({ secretOk: false, roles: ['driver'], type: 'passed' }), { ok: true, via: 'driver' });
assert.deepEqual(allowNotify({ secretOk: false, roles: ['driver'], type: 'quote' }), { ok: false, via: 'denied' });
assert.deepEqual(allowNotify({ secretOk: false, roles: ['driver'], type: 'quote_declined' }), { ok: false, via: 'denied' });
assert.deepEqual(allowNotify({ secretOk: false, roles: ['mechanic'], type: 'claimed' }), { ok: false, via: 'denied' });
assert.deepEqual(allowNotify({ secretOk: false, roles: [], type: 'offer' }), { ok: false, via: 'denied' });
assert.equal(allowNotify({ secretOk: false, roles: ['admin', 'driver'], type: 'reoffer' }).via, 'admin');

assert.match(html, /const NOTIFY_FN_URL = SUPABASE_URL \+ '\/functions\/v1\/send-notification'/);
assert.match(html, /function postNotification/);
assert.match(html, /Authorization':'Bearer '\+token/);
assert.doesNotMatch(html, /send-notification\?secret/);
assert.equal((html.match(/fetch\(NOTIFY_FN_URL/g) || []).length, 1, 'only postNotification calls the function');
assert.match(html, /type:'quote_declined'/);
assert.match(html, /notify\('claimed'/);
assert.match(html, /notify\('passed'/);
assert.match(html, /notify\('offer'/);
assert.doesNotMatch(html, /service_role/);

assert.match(index, /x-notify-secret/);
assert.match(index, /secretMatches/);
assert.match(index, /auth\.getUser/);
assert.match(index, /from\("profiles"\)/);
assert.match(index, /from\("staff"\)/);
assert.doesNotMatch(index, /searchParams\.get\(["']secret["']\)/);
assert.match(index, /ignored secret in the query string/);
assert.match(index, /handleQuoteAlternatives/);
assert.match(index, /handleQuoteDeclined/);
assert.match(quotes, /!== "elvira"/);
assert.match(quotes, /export async function handleQuoteDeclined/);
assert.match(shared, /x-notify-secret/);
assert.doesNotMatch(index + quotes + shared, /service_role/);

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter((s) => s.trim());
for (const source of scripts) new vm.Script(source);

console.log('notify-auth tests passed');
