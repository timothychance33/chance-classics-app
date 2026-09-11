import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

assert.match(html, /function inThisWeekNeedsAttention/, 'This Week uses a shared past-date helper');
assert.match(html, /inThisWeekNeedsAttention\(b, wk, todayIso\)/, 'owner This Week / needs-attention uses the helper');
assert.match(html, /const todayIso=chicagoToday\(\)\.iso;/, 'today is America/Chicago, not UTC');
assert.match(html, /b\.event_date>=week\.start && b\.event_date<=week\.end && b\.event_date>=todayIso/,
  'This Week keeps the week window and requires event_date >= Chicago today');
assert.doesNotMatch(html, /const thisWeek=all\.filter\(b=>b\.event_date && b\.event_date>=wk\.start && b\.event_date<=wk\.end\);/,
  'This Week is no longer the raw week window');
assert.match(html, /function weekBounds\(\)/, 'week window helper is unchanged');
assert.match(html, /needs your attention/, 'owner kicker still says needs your attention');

// Same helper the app uses: week window ∩ today-or-later (America/Chicago iso).
function inThisWeekNeedsAttention(b, week, todayIso){
  if(!b || !b.event_date || !week || !todayIso) return false;
  return b.event_date>=week.start && b.event_date<=week.end && b.event_date>=todayIso;
}

const week={start:'2026-09-07', end:'2026-09-13'};
const today='2026-09-11';

const treyanna={id:'b-trey', customer_name:'Treyanna Robinson', event_date:'2026-09-09',
  payment_status:'deposit', driver_paid_at:null, status:'confirmed'};
const charity={id:'b-tim', customer_name:'Tim Chance', event_date:'2026-09-10',
  payment_status:'unpaid', status:'confirmed'};
const sophie={id:'b-sophie', customer_name:'Sophie Barksdale', event_date:'2026-09-12',
  payment_status:'paid', status:'new'};
const todayJob={id:'b-today', customer_name:'Today Wedding', event_date:'2026-09-11', status:'confirmed'};
const nextWeek={id:'b-later', customer_name:'Next week', event_date:'2026-09-14', status:'confirmed'};
const noDate={id:'b-nodate', customer_name:'No date', event_date:null, status:'confirmed'};

assert.equal(inThisWeekNeedsAttention(treyanna, week, today), false, 'Sep 9 drops after the event');
assert.equal(inThisWeekNeedsAttention(charity, week, today), false, 'Sep 10 drops even if unpaid');
assert.equal(inThisWeekNeedsAttention(todayJob, week, today), true, 'today stays in This Week');
assert.equal(inThisWeekNeedsAttention(sophie, week, today), true, 'later this week stays');
assert.equal(inThisWeekNeedsAttention(nextWeek, week, today), false, 'outside the week window stays out');
assert.equal(inThisWeekNeedsAttention(noDate, week, today), false, 'missing event_date is not This Week');
assert.equal(inThisWeekNeedsAttention(null, week, today), false);

const thisWeek=[treyanna, charity, todayJob, sophie, nextWeek, noDate]
  .filter(b=>inThisWeekNeedsAttention(b, week, today));
assert.deepEqual(thisWeek.map(b=>b.id), ['b-today', 'b-sophie']);

// Staff schedule: same Chicago today cutoff (flat upcoming list, no This Week section).
assert.match(html, /let list=\[\.\.\.DATA\.bookings\]\.filter\(b=>b\.status!=='cancelled' && \(!b\.event_date \|\| b\.event_date>=todayIso\)\);/,
  'staff schedule uses the same Chicago today cutoff');

console.log('schedule-this-week tests passed');
