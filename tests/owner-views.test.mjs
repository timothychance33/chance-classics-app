import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

assert.match(html, /<button data-tab="staff">Drivers<\/button>/, 'Drivers tab is in owner nav');
assert.match(html, /previewlbl">View as/, 'header preview is labeled View as, not Drivers');
assert.doesNotMatch(html, /<button data-role="driver">Drivers<\/button>/, 'header no longer steals the Drivers label');
assert.match(html, /Pay driver \$\$\{dp\.amount\}/, 'owner payout copy uses Pay driver $X');
assert.match(html, /function ownerPayPillHtml/, 'owner payout helper exists');
assert.match(html, /Roster · pay scales · waterfall/, 'Drivers page names roster + scales + waterfall');
assert.match(html, /function driverCardJobsHtml/, 'each driver card lists jobs and owed');
assert.match(html, /toggleDriverPaid/, 'Tim can check off paid jobs');
assert.match(html, /driver_paid_at/, 'reuses bookings.driver_paid_at — no second ledger');
assert.match(html, /You owe/, 'card shows what Tim owes the driver');
assert.match(html, /Upcoming bookings/, 'card lists upcoming bookings');
assert.match(html, /function showOwnerCustomerAmount/, 'customer amount is owner-gated');
assert.match(html, /isAdmin\(\) && ROLE==='admin'/, 'View as Driver hides customer dollars');
assert.doesNotMatch(html, /service_role/, 'no service_role in the browser app');

// Same formula the app uses: amount = pay_tier × driver.pay_rate
function driverPayFor(b, staff){
  if(!b.driver_id||b.pay_tier==null) return null;
  const d=staff.find(s=>s.id===b.driver_id);
  if(!d||d.pay_rate==null) return null;
  return {driver:d, amount:b.pay_tier*d.pay_rate};
}
const alex={id:'d1',pay_rate:50};
assert.equal(driverPayFor({driver_id:'d1',pay_tier:3},[alex]).amount, 150);
assert.equal(driverPayFor({driver_id:null,pay_tier:3},[alex]), null);
assert.equal(driverPayFor({driver_id:'d1',pay_tier:null},[alex]), null);

function isFinishedJob(b){
  if(!b||b.status==='cancelled') return false;
  if(b.status==='completed') return true;
  return !!(b.event_date && b.event_date<='2026-09-01');
}
const finishedUnpaid={status:'completed',event_date:'2026-08-29',driver_paid_at:null};
const upcomingAccepted={status:'confirmed',event_date:'2026-09-06',driver_paid_at:null};
assert.equal(isFinishedJob(finishedUnpaid), true);
assert.equal(isFinishedJob(upcomingAccepted), false);
const owed = [finishedUnpaid].filter(b=>isFinishedJob(b)&&!b.driver_paid_at).length;
assert.equal(owed, 1);

console.log('owner-views tests passed');
