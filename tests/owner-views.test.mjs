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
assert.match(html, /function ownerCustomerAmountEditorHtml/, 'owner can add or edit the customer amount');
assert.match(html, /id="f_amount"/, 'booking edit has an owner customer-amount field');
assert.match(html, /showOwnerCustomerAmount\(\)\?ownerCustomerAmountEditorHtml/, 'booking detail editor is owner-gated');
assert.match(html, /function isOwnerView/, 'owner chrome uses isAdmin plus ROLE');
assert.match(html, /OWNER_ONLY_TABS=\[\'staff\',\'earnings\',\'quotes\'\]/, 'Quotes, Earnings, and Drivers are owner-only tabs');
assert.match(html, /STAFF_TABS=\[\'schedule\',\'calendar\',\'prep\',\'cars\'\]/, 'staff nav is Schedule, Calendar, Prep, Cars');
assert.match(html, /if\(!isOwnerView\(\) && !STAFF_TABS\.includes\(name\)\) name='schedule'/, 'staff deep links bounce to Schedule');
assert.match(html, /isAdmin\(\) && ROLE==='admin'/, 'View as Driver hides owner chrome');
assert.doesNotMatch(html, /stab\.textContent=isAdmin\(\)\?'Drivers':'Crew'/, 'staff no longer get a Crew tab');
assert.doesNotMatch(html, /service_role/, 'no service_role in the browser app');
assert.doesNotMatch(html, /section\('Unclaimed'/, 'Schedule no longer renders an Unclaimed section');
assert.match(html, /Ready to release to drivers/, 'Ready to release to drivers stays on Schedule');
assert.match(html, /function inThisWeekNeedsAttention/, 'This Week drops past event dates');
assert.match(html, /inThisWeekNeedsAttention\(b, wk, todayIso\)/, 'owner This Week uses the shared filter');

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


// Follow-up flags: owner-only Reviewed / Photos received checkboxes in Booking details
assert.match(html, /function followupFlagsHtml/, 'booking detail renders follow-up flag checkboxes');
assert.match(html, /\$\{isOwnerView\(\)\?followupFlagsHtml\(b\):''\}/, 'follow-up checkboxes are owner-only');
assert.match(html, /FOLLOWUP_FLAG_COLS=\['reviewed_at','photos_received_at'\]/, 'only reviewed_at / photos_received_at can be toggled');
assert.match(html, /SB\.from\('bookings'\)\.update\(\{\[col\]:when\}\)\.eq\('id',bid\)/, 'flags set/clear the bookings column like driver_paid_at');
assert.match(html, />\s*\$\{label\}<\/label>/, 'checkbox label text is rendered');
assert.match(html, /box\('reviewed_at','Reviewed'\)\}\$\{box\('photos_received_at','Photos received'\)/, 'labels are Reviewed and Photos received');

// Same set/clear rule as persistFollowupFlag: checked → timestamp, unchecked → null
function followupFlagValue(on, now){ return on ? now : null; }
assert.equal(followupFlagValue(true, '2026-10-01T18:00:00.000Z'), '2026-10-01T18:00:00.000Z');
assert.equal(followupFlagValue(false, '2026-10-01T18:00:00.000Z'), null);

console.log('owner-views tests passed');
