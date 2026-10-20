import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { CANONICAL_CAR_LABELS, carLabelFor } from '../supabase/functions/_shared/car-label.mjs';
import {
  BUSINESS_PHONE,
  DAY_BEFORE_STATUSES,
  NO_DRIVER_LINE,
  balanceDue,
  clientNoteFields,
  dayBeforeSkipReason,
  dayBeforeWindow,
  renderDayBeforeEmail,
  tripDetails,
} from '../supabase/functions/_shared/day-before-email.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const { dayBeforeSentNote } = createRequire(import.meta.url)('../pay-link-note.js');

const facts = read('site/data/carFacts.ts');
const found = [...facts.matchAll(/car:\s*"([^"]+)"[\s\S]*?year:\s*(\d+|null),\n\s*make:\s*(?:"([^"]*)"|null),\n\s*model:\s*(?:"([^"]*)"|null),/g)];
assert.equal(found.length, Object.keys(CANONICAL_CAR_LABELS).length);
for (const [, name, year, make, model] of found) {
  const label = [year === 'null' ? '' : year, make || '', model || ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  assert.equal(CANONICAL_CAR_LABELS[name], label, name);
}
assert.equal(
  carLabelFor({ name: 'Phyllis', year: 1941, make: 'Buick', model: 'Super 56C' }),
  'Phyllis — 1941 Buick Super',
);
assert.equal(
  carLabelFor({ name: 'Elvira', year: 2000, make: 'Lincoln', model: 'Limo' }),
  'Elvira — 2000 Lincoln Limo',
);

assert.deepEqual(dayBeforeWindow({ date: '2026-10-20', hour: 9 }), {
  ok: false,
  reason: 'before 10:00 AM in America/Chicago (hour 9)',
  eventDate: '',
});
assert.deepEqual(dayBeforeWindow({ date: '2026-10-20', hour: 10 }), {
  ok: true,
  eventDate: '2026-10-21',
});
assert.equal(dayBeforeWindow({ date: '2026-10-20', hour: 15 }).eventDate, '2026-10-21');

const confirmed = {
  status: 'confirmed',
  customer_email: 'ada@example.com',
  source: 'manual',
};
assert.equal(dayBeforeSkipReason(confirmed), '');
assert.equal(dayBeforeSkipReason({ ...confirmed, status: 'prepping' }), '');
assert.equal(dayBeforeSkipReason({ ...confirmed, status: 'cancelled' }), 'cancelled');
assert.equal(dayBeforeSkipReason({ ...confirmed, status: 'declined' }), 'declined');
assert.equal(dayBeforeSkipReason({ ...confirmed, status: 'new' }), 'unconfirmed');
assert.equal(dayBeforeSkipReason({ ...confirmed, status: 'hold' }), 'unconfirmed');
assert.equal(dayBeforeSkipReason({ ...confirmed, customer_email: '  ' }), 'no_email');
assert.equal(dayBeforeSkipReason({ ...confirmed, replied_at: '2026-10-01T00:00:00Z' }), 'suppressed');
assert.equal(dayBeforeSkipReason({ ...confirmed, reviewed_at: '2026-10-01T00:00:00Z' }), '');
assert.equal(dayBeforeSkipReason({ ...confirmed, photos_received_at: '2026-10-01T00:00:00Z' }), '');
assert.equal(dayBeforeSkipReason({ ...confirmed, source: 'site-test' }), 'test');
assert.equal(dayBeforeSkipReason({ ...confirmed, day_before_email_sent_at: '2026-10-20T15:00:00Z' }), 'already_sent');
assert.ok(DAY_BEFORE_STATUSES.includes('confirmed'));
assert.ok(!DAY_BEFORE_STATUSES.includes('new'));

const wixNotes = [
  'Event Location: Sainte Terre',
  'Drop off location (If being chauffeured): Remington Hotel',
  'Additional Notes: 10:30 pm park at the venue',
  '11:00 pm pictures',
  'Rental Period: 2 hr (minimum) (600 USD)',
  'Price: $655.50 ($405.50 due)',
].join('\n');
const wix = tripDetails({
  event_date: '2026-10-21',
  start_time: '21:30:00',
  end_time: '23:30:00',
  event_type: 'Rental: 1941 Buick Convertible',
  pickup_location: '',
  return_location: '',
  notes: wixNotes,
}, { name: 'Phyllis', year: 1941, make: 'Buick', model: 'Super 56C' }, null);
assert.equal(wix.car, 'Phyllis — 1941 Buick Super');
assert.equal(wix.date, 'Wed Oct 21');
assert.equal(wix.pickupTime, '9:30 PM');
assert.equal(wix.pickup, 'Sainte Terre');
assert.equal(wix.stops, 'Remington Hotel\n10:30 pm park at the venue\n11:00 pm pictures');
assert.equal(wix.hours, '2 hours');
assert.equal(wix.occasion, '');
assert.equal(clientNoteFields(wixNotes).additional.includes('11:00 pm pictures'), true);

const overnight = tripDetails({
  event_date: '2026-10-21',
  start_time: '22:00:00',
  end_time: '00:00:00',
  event_type: 'Wedding',
  pickup_location: '601 Spring St',
  return_location: '601 Spring St',
  notes: 'Website booking.\nOccasion: Wedding\nDuration: 2 hours',
}, { name: 'Elsa' }, null);
assert.equal(overnight.hours, '2 hours');
assert.equal(overnight.occasion, 'Wedding');
assert.equal(overnight.stops, '601 Spring St');
assert.equal(overnight.car, 'Elsa — 1954 Packard Caribbean');

assert.equal(balanceDue({ balance_due_usd: '411.50', payment_status: 'deposit' }), 411.5);
assert.equal(balanceDue({ total_usd: 661.5, amount_paid_usd: 250 }), 411.5);
assert.equal(balanceDue({ payment_status: 'paid' }), 0);
assert.equal(balanceDue({ notes: 'Price: $655.50 ($405.50 due)', payment_status: 'deposit' }), 405.5);
assert.equal(balanceDue({ notes: 'Balance billed separately: $1023.39' }), 1023.39);
assert.equal(balanceDue({ payment_status: 'deposit', notes: 'Price: $546.25' }), null);

const balanceMail = renderDayBeforeEmail({
  booking: {
    status: 'confirmed',
    customer_name: 'Ada <b> Lovelace',
    customer_email: 'ada@example.com',
    event_date: '2026-10-21',
    start_time: '20:30:00',
    end_time: '22:30:00',
    event_type: 'Wedding',
    pickup_location: '601 Spring St',
    return_location: 'Remington Hotel',
    balance_due_usd: 411.5,
    payment_status: 'deposit',
  },
  car: { name: 'Phyllis', model: 'Super 56C' },
  payUrl: 'https://checkout.stripe.com/c/pay/cs_test_day',
});
assert.equal(balanceMail.subject, 'Tomorrow: your Chance Classics booking');
assert.equal(balanceMail.needsPayLink, true);
assert.match(balanceMail.html, /Hi Ada,/);
assert.match(balanceMail.html, /Your booking for tomorrow is confirmed/);
assert.match(balanceMail.html, /Phyllis — 1941 Buick Super/);
assert.match(balanceMail.html, />Confirmed</);
assert.match(balanceMail.html, /8:30 PM/);
assert.match(balanceMail.html, /601 Spring St/);
assert.match(balanceMail.html, /Remington Hotel/);
assert.match(balanceMail.html, /2 hours/);
assert.match(balanceMail.html, />Wedding</);
assert.match(balanceMail.html, /Balance remaining \$411\.50/);
assert.match(balanceMail.html, /The balance is due the day before your event/);
assert.match(balanceMail.html, /href="https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_day"/);
assert.match(balanceMail.html, />Pay the balance</);
assert.match(balanceMail.html, new RegExp(NO_DRIVER_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(balanceMail.html, /318-344-5001/);
assert.match(balanceMail.html, /tel:3183445001/);
assert.doesNotMatch(balanceMail.html, /Questions\? Call/);
assert.match(balanceMail.html, /max-width:560px/);
assert.match(balanceMail.html, /font-size:16px/);
assert.doesNotMatch(balanceMail.html, /Ada <b>/);
assert.doesNotMatch(balanceMail.html, /Price:/);
assert.match(balanceMail.text, /Car: Phyllis — 1941 Buick Super/);
assert.match(balanceMail.text, /Pay the balance/);
assert.match(balanceMail.text, /https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_day/);
assert.equal(balanceMail.payUrl, 'https://checkout.stripe.com/c/pay/cs_test_day');

const paidMail = renderDayBeforeEmail({
  booking: {
    status: 'confirmed',
    customer_name: 'Sam',
    event_date: '2026-10-21',
    start_time: '13:00:00',
    end_time: '15:00:00',
    event_type: 'Parade',
    pickup_location: 'Benton',
    return_location: 'Bossier',
    payment_status: 'paid',
    balance_due_usd: 0,
  },
  car: { name: 'Phyllis' },
  driver: { name: 'Jordan <Lee>', phone: '318-555-0148' },
  payUrl: 'https://checkout.stripe.com/should-not-appear',
});
assert.equal(paidMail.needsPayLink, false);
assert.match(paidMail.html, /Paid in full/);
assert.match(paidMail.html, /Jordan &lt;Lee&gt;/);
assert.match(paidMail.html, /318-555-0148/);
assert.match(paidMail.html, /tel:3185550148/);
assert.doesNotMatch(paidMail.html, /Pay the balance/);
assert.doesNotMatch(paidMail.html, /should-not-appear/);
assert.doesNotMatch(paidMail.html, /Your driver will be confirmed shortly/);
assert.ok(paidMail.text.includes(BUSINESS_PHONE));
assert.match(paidMail.html, /Questions\? Call/);

const unsafe = renderDayBeforeEmail({
  booking: { customer_name: 'Ada', balance_due_usd: 10, event_type: 'Wedding' },
  payUrl: 'javascript:alert(1)',
});
assert.equal(unsafe.payUrl, '');
assert.doesNotMatch(unsafe.html, /javascript:/);

assert.equal(dayBeforeSentNote('2026-10-20T15:00:00.000Z'), 'Day-before email sent Oct 20, 10:00 AM');
assert.equal(dayBeforeSentNote(''), '');

const scheduled = read('supabase/functions/scheduled-tasks/index.ts');
assert.match(scheduled, /day_before_email_sent_at/);
assert.match(scheduled, /dayBeforeWindow/);
assert.match(scheduled, /renderDayBeforeEmail/);
assert.match(scheduled, /DAY_BEFORE_STATUSES/);
assert.match(scheduled, /balancePayLink/);
assert.match(scheduled, /day_before_email_sent_at: null/);
assert.match(scheduled, /Apply the day-before email migration/);
assert.doesNotMatch(scheduled, /service_role/);
assert.doesNotMatch(scheduled, /payment_method_types\s*[:=]/);

const garage = read('index.html');
assert.match(garage, /function dayBeforeEmailLine/);
assert.match(garage, /dayBeforeSentNote\(b&&b\.day_before_email_sent_at\)/);
assert.match(read('pay-link-note.js'), /Day-before email sent /);
const migration = read('supabase/migrations/20261020230000_bookings_day_before_email_sent_at.sql');
assert.match(migration, /add column if not exists day_before_email_sent_at timestamptz/);
assert.match(migration, /It is not applied by this pull request/);
assert.match(migration, /enable row level security|already has row level security/i);
assert.match(migration, /grant select \(day_before_email_sent_at\) on table rental\.bookings to authenticated/);
assert.match(migration, /grant select \(day_before_email_sent_at\), update \(day_before_email_sent_at\) on table rental\.bookings to service_role/);
assert.doesNotMatch(migration, /create table/i);

console.log('day-before email tests passed');
