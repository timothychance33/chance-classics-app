import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { driverFacingNotes } from '../supabase/functions/_shared/driver-notes.mjs';
import { driverFacingNotes as fromEmails } from '../lib/driver-emails.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const scheduled = readFileSync(join(root, 'supabase/functions/scheduled-tasks/index.ts'), 'utf8');
const notifyShared = readFileSync(join(root, 'supabase/functions/send-notification/shared.ts'), 'utf8');
const notify = readFileSync(join(root, 'supabase/functions/send-notification/index.ts'), 'utf8');

const quoteLink = [
  'Website booking from a quote link.',
  'Quote: c6a62842-1111-2222-3333-444444444444',
  'Car: Black Betty',
  'Occasion: wedding',
  'Duration: 2 hours',
  'Sales tax (10.25%): $51.25',
  'Quote total: $551.25',
  'Mileage fee: $0.00',
  'Deposit paid: $250.00',
  'Balance billed separately: $301.25',
  'Waiver accepted: Yes',
  'Vehicle reliability acknowledged: Yes',
].join('\n');

const expected = [
  'Website booking from a quote link.',
  'Quote: c6a62842-1111-2222-3333-444444444444',
  'Car: Black Betty',
  'Occasion: wedding',
  'Duration: 2 hours',
  'Waiver accepted: Yes',
  'Vehicle reliability acknowledged: Yes',
].join('\n');

assert.equal(driverFacingNotes(quoteLink), expected);
assert.equal(driverFacingNotes(quoteLink.replace(/\n/g, ' ')), expected);
assert.equal(driverFacingNotes(driverFacingNotes(quoteLink)), expected);

const flat = 'Website booking from a quote link. Quote: c6a62842-... Car: Black Betty Occasion: wedding Duration: 2 hours Sales tax (10.25%): $51.25 Quote total: $551.25 Mileage fee: $0.00 Deposit paid: $250.00 Balance billed separately: $301.25 Waiver accepted: Yes Vehicle reliability acknowledged: Yes';
const flatOut = driverFacingNotes(flat);
assert.match(flatOut, /Car: Black Betty/);
assert.match(flatOut, /Occasion: wedding/);
assert.match(flatOut, /Duration: 2 hours/);
assert.match(flatOut, /Waiver accepted: Yes/);
assert.match(flatOut, /Vehicle reliability acknowledged: Yes/);
assert.doesNotMatch(flatOut, /\$/);
assert.doesNotMatch(flatOut, /sales tax|quote total|mileage fee|deposit|balance/i);

assert.equal(
  driverFacingNotes('Meet at side door\nPrice: $880.00 ($200 due)\nBring hats'),
  'Meet at side door\nBring hats',
);
assert.equal(driverFacingNotes('Price: $100'), '');
assert.equal(driverFacingNotes('Price: $1,023.39'), '');
assert.equal(fromEmails, driverFacingNotes);

assert.equal(
  driverFacingNotes('Mileage: 25 miles from Benton to pickup, fee $0.00, billed with the balance.'),
  'Mileage: 25 miles from Benton to pickup.',
);
assert.equal(
  driverFacingNotes('Overnight driver hotel: $200.00 (75 miles from Benton, driver back about 2:15 AM the next day).'),
  'Overnight driver hotel: 75 miles from Benton, driver back about 2:15 AM the next day.',
);
assert.equal(
  driverFacingNotes('Meet at the north gate. Refunded $40 on Venmo for the tip.'),
  'Meet at the north gate.',
);
assert.equal(
  driverFacingNotes('Gate code 4412. Stripe balance was $301.25. Bring the spare key.'),
  'Gate code 4412. Bring the spare key.',
);
assert.match(driverFacingNotes('Tax exempt: parish school'), /Tax exempt: parish school/);
assert.equal(driverFacingNotes('Confirmed only after the $250 deposit is paid.'), '');
assert.equal(driverFacingNotes('Listing total: $500.00\nSubtotal: $500.00\nBooking total: $551.25'), '');
assert.doesNotMatch(driverFacingNotes('Customer sent $40 on Venmo. Side door.'), /\$|venmo/i);
assert.match(driverFacingNotes('Customer sent $40 on Venmo. Side door.'), /Side door/);

assert.match(html, /function driverFacingNotes/);
assert.match(html, /sanitizeDriverNotes/);
assert.match(html, /driver-notes\.mjs/);
assert.match(html, /bookings_for_session/);
assert.match(sw, /driver-notes\.mjs/);
assert.match(scheduled, /driverFacingNotes/);
assert.match(scheduled, /_shared\/driver-notes\.mjs/);
assert.doesNotMatch(scheduled, /function driverFacingNotes/);
assert.match(notifyShared, /driverFacingNotes\(b\.notes\)/);
assert.match(notify, /driverFacingNotes/);
