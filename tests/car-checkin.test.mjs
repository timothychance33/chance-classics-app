import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

import { allowNotify } from '../supabase/functions/send-notification/access.mjs';
import {
  CHECKIN_REQUIRED_FROM,
  DRIVER_NUDGE_CAP,
  bookingEndMs,
  checkinDriverNudgeMail,
  checkinNoticePlan,
  checkinOwnerMail,
  checkinOwnerMissingMail,
  driverNudgeSlot,
  ownerMissingDue,
} from '../supabase/functions/_shared/car-checkin.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const migration = readFileSync(join(root, 'supabase/migrations/20261031220000_car_checkin.sql'), 'utf8');
const cutoffMigration = readFileSync(join(root, 'supabase/migrations/20261101161000_checkin_required_from.sql'), 'utf8');
const scheduled = readFileSync(join(root, 'supabase/functions/scheduled-tasks/index.ts'), 'utf8');
const notify = readFileSync(join(root, 'supabase/functions/send-notification/index.ts'), 'utf8');
const shared = readFileSync(join(root, 'supabase/functions/_shared/car-checkin.mjs'), 'utf8');

assert.equal(new Date(bookingEndMs('2026-06-15', '14:00', '18:00')).toISOString(), '2026-06-15T23:00:00.000Z');
assert.equal(new Date(bookingEndMs('2026-12-15', '14:00', '18:00')).toISOString(), '2026-12-16T00:00:00.000Z');
assert.equal(new Date(bookingEndMs('2026-06-15', '23:00', '01:00')).toISOString(), '2026-06-16T06:00:00.000Z');
assert.equal(new Date(bookingEndMs('2026-12-15', '23:00', '01:00')).toISOString(), '2026-12-16T07:00:00.000Z');
assert.equal(new Date(bookingEndMs('2026-06-15', '18:00', '18:00')).toISOString(), '2026-06-16T23:00:00.000Z');
assert.equal(new Date(bookingEndMs('2026-06-15', '14:00', null)).toISOString(), '2026-06-16T04:59:00.000Z');
assert.equal(bookingEndMs(null, '14:00', '18:00'), null);

const overnight = bookingEndMs('2026-06-15', '23:00', '01:00');
const sameEvening = bookingEndMs('2026-06-15', '18:00', '23:30');
assert.ok(overnight > sameEvening);
assert.equal(driverNudgeSlot(overnight, overnight + 30 * 60 * 1000), null);
assert.equal(driverNudgeSlot(overnight, overnight + 60 * 60 * 1000), 1);

const end = bookingEndMs('2026-06-15', '14:00', '18:00');
assert.equal(driverNudgeSlot(end, end + 59 * 60 * 1000), null);
assert.equal(driverNudgeSlot(end, end + 60 * 60 * 1000), 1);
assert.equal(driverNudgeSlot(end, end + 4 * 60 * 60 * 1000 - 1), 1);
assert.equal(driverNudgeSlot(end, end + 4 * 60 * 60 * 1000), 2);
assert.equal(driverNudgeSlot(end, end + 10 * 60 * 60 * 1000), DRIVER_NUDGE_CAP);
assert.equal(driverNudgeSlot(end, end + 13 * 60 * 60 * 1000), null);
assert.equal(ownerMissingDue(end, end + 4 * 60 * 60 * 1000 - 1), false);
assert.equal(ownerMissingDue(end, end + 4 * 60 * 60 * 1000), true);

const booking = {
  id: 'b1',
  driver_id: 'd1',
  status: 'confirmed',
  event_date: '2026-06-15',
  start_time: '23:00',
  end_time: '01:00',
  customer_name: 'June Wedding',
};
assert.deepEqual(checkinNoticePlan(booking, true, overnight + 2 * 60 * 60 * 1000), {
  endMs: null, driverSlot: null, owner: false,
});
assert.equal(checkinNoticePlan({ ...booking, status: 'cancelled' }, false, overnight + 5 * 60 * 60 * 1000).driverSlot, null);
assert.equal(CHECKIN_REQUIRED_FROM, Date.parse('2026-11-01T16:05:00Z'));
assert.deepEqual(checkinNoticePlan(booking, false, overnight + 5 * 60 * 60 * 1000), {
  endMs: null, driverSlot: null, owner: false,
});

const required = {
  ...booking,
  event_date: '2026-11-01',
  start_time: '09:00',
  end_time: '10:05',
};
const requiredEnd = bookingEndMs(required.event_date, required.start_time, required.end_time);
assert.equal(requiredEnd, CHECKIN_REQUIRED_FROM);
const due = checkinNoticePlan(required, false, requiredEnd + 5 * 60 * 60 * 1000);
assert.equal(due.endMs, requiredEnd);
assert.equal(due.driverSlot, 2);
assert.equal(due.owner, true);
const justBefore = { ...required, end_time: '10:04' };
const justBeforeEnd = bookingEndMs(justBefore.event_date, justBefore.start_time, justBefore.end_time);
assert.ok(justBeforeEnd < CHECKIN_REQUIRED_FROM);
assert.deepEqual(checkinNoticePlan(justBefore, false, justBeforeEnd + 5 * 60 * 60 * 1000), {
  endMs: null, driverSlot: null, owner: false,
});

const ownerMail = checkinOwnerMail({
  appUrl: 'https://app.chanceclassics.com',
  carName: 'Phyllis',
  driverName: 'Alex',
  booking,
  checkin: {
    parked_at: '2026-06-16T06:10:00.000Z',
    fuel_level: '1/2',
    has_issues: true,
    severity: 'needs_fix',
    notes: 'Soft brake pedal',
  },
  photoUrls: ['https://example.com/photo'],
  photoCount: 2,
});
assert.match(ownerMail.subject, /needs a fix/);
assert.match(ownerMail.text, /Fuel: 1\/2/);
assert.match(ownerMail.text, /Needs fix before next booking/);
assert.match(ownerMail.text, /Soft brake pedal/);
assert.match(ownerMail.html, /https:\/\/example\.com\/photo/);
assert.doesNotMatch(ownerMail.subject + ownerMail.html + ownerMail.text, /mileage/i);

const nudge = checkinDriverNudgeMail({
  appUrl: 'https://app.chanceclassics.com',
  carName: 'Phyllis',
  driverName: 'Alex',
  booking,
  bookingId: 'b1',
  slot: 1,
});
assert.match(nudge.html, /#checkin=b1/);
assert.match(nudge.text, /https:\/\/app\.chanceclassics\.com\/#checkin=b1/);
const ownerMissing = checkinOwnerMissingMail({
  appUrl: 'https://app.chanceclassics.com',
  carName: 'Phyllis',
  driverName: 'Alex',
  booking,
  bookingId: 'b1',
});
assert.match(ownerMissing.text, /Driver pay stays locked/);

assert.equal(allowNotify({ secretOk: false, roles: ['driver'], type: 'car_checkin' }).ok, true);
assert.equal(allowNotify({ secretOk: false, roles: ['mechanic'], type: 'car_checkin' }).ok, false);
assert.equal(allowNotify({ secretOk: false, roles: ['driver'], type: 'quote' }).ok, false);

assert.match(migration, /enable row level security/);
assert.match(migration, /grant select, insert on table rental\.car_checkins to authenticated/);
assert.match(migration, /grant select, insert, update on table rental\.car_checkins to service_role/);
assert.match(migration, /grant select, insert, delete on table rental\.car_checkin_nudges to service_role/);
assert.match(migration, /revoke all on table rental\.car_checkin_nudges from public, anon, authenticated/);
assert.match(migration, /fuel_level in \('empty', '1\/4', '1\/2', '3\/4', 'full'\)/);
assert.match(migration, /p_end <= p_start/);
assert.match(migration, /America\/Chicago/);
assert.match(migration, /Car check-in is required before this driver can be marked paid/);
assert.match(migration, /bucket_id = 'car-checkins'/);
assert.match(migration, /public = false/);
assert.doesNotMatch(migration, /ending_mileage/);
assert.match(cutoffMigration, /NOT APPLIED/);
assert.match(cutoffMigration, /create or replace function rental\.guard_driver_paid/);
assert.match(cutoffMigration, /CHECKIN_REQUIRED_FROM constant timestamptz := timestamptz '2026-11-01T16:05:00Z'/);
assert.match(cutoffMigration, /rental\.booking_end_at\(new\.event_date, new\.start_time, new\.end_time\) < CHECKIN_REQUIRED_FROM/);
assert.match(cutoffMigration, /Car check-in is required before this driver can be marked paid/);
assert.doesNotMatch(cutoffMigration, /balance_reminder|drop table|drop trigger/i);

assert.match(scheduled, /runCarCheckinMail/);
assert.match(scheduled, /car_checkin_nudges/);
assert.match(scheduled, /owner_notified_at/);
assert.match(scheduled, /checkinDriverNudgeMail/);
assert.match(scheduled, /checkinOwnerMissingMail/);
assert.match(scheduled, /Email only — no SMS sender/);
assert.match(notify, /type === "car_checkin"/);
assert.match(notify, /from\("car_checkins"\)/);
assert.match(notify, /createSignedUrls/);
assert.match(notify, /owner_notified_at: null/);
assert.doesNotMatch(shared, /ending_mileage/);

assert.match(html, /id="ci_fuel"/);
assert.match(html, /class="ci-pill"/);
assert.match(html, /name="ci_issues" value="no"/);
assert.match(html, /name="ci_issues" value="yes"/);
const checkinForm = html.slice(html.indexOf('id="ci_fuel"'), html.indexOf('id="ci_submit"'));
const issueBox = checkinForm.indexOf('id="ci_issue_box"');
const photos = checkinForm.indexOf('id="ci_photos" type="file" accept="image/*" multiple');
const notes = checkinForm.indexOf('id="ci_notes"');
const severity = checkinForm.indexOf('name="ci_severity" value="needs_fix"');
assert.ok(issueBox > 0 && notes > issueBox && severity > issueBox && photos > issueBox, 'issue details sit inside the Yes section');
assert.ok(checkinForm.indexOf('id="ci_photos"') < checkinForm.lastIndexOf('ci_issue_box') || checkinForm.includes('id="ci_issue_box"'), 'photos follow the Yes choice');
assert.match(html, /Needs fix before next booking/);
assert.match(html, /Car check-in is required before this driver can be marked paid/);
assert.match(html, /function overrideDriverPaid/);
assert.match(html, /function submitCarCheckin/);
assert.match(html, /type:'car_checkin'/);
assert.match(html, /storage\.from\('car-checkins'\)/);
assert.match(html, /class="fixbadge">Needs fix/);
assert.match(html, /function carFixWarningHtml/);
assert.match(html, /#checkin=/);
assert.match(html, /endMin<=startMin/);
assert.doesNotMatch(html, /ending_mileage|ending mileage/i);
assert.doesNotMatch(html, /service_role/);
assert.equal((html.match(/fetch\(NOTIFY_FN_URL/g) || []).length, 1);
assert.equal((html.match(/2026-11-01T16:05:00Z/g) || []).length, 1);
assert.equal((shared.match(/2026-11-01T16:05:00Z/g) || []).length, 1);
assert.match(html, /const CHECKIN_REQUIRED_FROM=Date\.parse\('2026-11-01T16:05:00Z'\)/);

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter((s) => s.trim());
for (const source of scripts) new vm.Script(source);

const garageStart = html.indexOf('const CHECKIN_UI_MS');
const garageEnd = html.indexOf('function fuelLabel');
assert.ok(garageStart > 0 && garageEnd > garageStart);
let nowMs = Date.parse('2026-11-02T18:00:00.000Z');
const RealDate = Date;
function Clock(value) {
  if (arguments.length === 0) return new RealDate(nowMs);
  return new RealDate(value);
}
Clock.now = () => nowMs;
Clock.parse = RealDate.parse;
Clock.UTC = RealDate.UTC;
Clock.prototype = RealDate.prototype;
const garage = {
  DATA: { checkinReady: true, checkins: [] },
  Date: Clock,
  Intl,
};
vm.createContext(garage);
vm.runInContext(html.slice(garageStart, garageEnd), garage);

const beforeCutoff = {
  id: 'before',
  driver_id: 'd1',
  status: 'confirmed',
  event_date: '2026-11-01',
  start_time: '09:00',
  end_time: '10:04',
};
const atCutoff = { ...beforeCutoff, id: 'at', end_time: '10:05' };
const afterCutoff = { ...beforeCutoff, id: 'after', end_time: '18:00' };
assert.equal(garage.missingCheckin(beforeCutoff), false);
assert.equal(garage.payBlockedReason(beforeCutoff), '');
assert.equal(garage.missingCheckin(atCutoff), true);
assert.equal(garage.payBlockedReason(atCutoff), 'Car check-in is required before this driver can be marked paid.');
assert.equal(garage.missingCheckin(afterCutoff), true);
garage.DATA.checkins = [{ booking_id: 'at' }];
assert.equal(garage.missingCheckin(atCutoff), false);
assert.equal(garage.payBlockedReason(atCutoff), '');
garage.DATA.checkins = [];
nowMs = Date.parse('2026-11-01T16:00:00.000Z');
assert.equal(garage.missingCheckin(beforeCutoff), false);
assert.equal(garage.payBlockedReason(beforeCutoff), '');
assert.equal(garage.missingCheckin(atCutoff), false);
assert.equal(garage.payBlockedReason(atCutoff), 'Driver pay waits for the car check-in, which opens after the booking ends.');
assert.equal(garage.payBlockedReason({ ...atCutoff, driver_paid_at: '2026-11-01T16:10:00.000Z' }), '');

const panelStart = html.indexOf('function checkinPanelHtml');
const panelEnd = html.indexOf('async function paintCheckinPhotos');
assert.ok(panelStart > 0 && panelEnd > panelStart);
const panel = {
  DATA: { checkinReady: true, checkins: [] },
  checkinFor() { return null; },
  canSubmitCheckin() { return false; },
  isOwnerView() { return true; },
  myStaffId() { return 'd1'; },
  bookingHasEnded() { return true; },
  bookingEndMs,
  CHECKIN_REQUIRED_FROM,
  esc(value) { return String(value ?? ''); },
  fmtChicagoStamp() { return ''; },
  fuelLabel(level) { return level; },
};
vm.createContext(panel);
vm.runInContext(html.slice(panelStart, panelEnd), panel);
assert.equal(panel.checkinPanelHtml(beforeCutoff), '');
assert.match(panel.checkinPanelHtml(atCutoff), /class="payblock"/);
assert.match(panel.checkinPanelHtml(atCutoff), /Car check-in is required before this driver can be marked paid/);

console.log('car-checkin tests passed');
