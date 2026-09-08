import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const cron = readFileSync(join(root, 'api/cron/weekly-driver-digest.js'), 'utf8');
const scheduled = readFileSync(join(root, 'supabase/functions/scheduled-tasks/index.ts'), 'utf8');
const notify = readFileSync(join(root, 'supabase/functions/send-notification/index.ts'), 'utf8');
const migration = readFileSync(join(root, 'supabase/migrations/20260908190000_driver_weekly_digest_sends.sql'), 'utf8');

assert.equal(vercel.crons.length, 1);
assert.equal(vercel.crons[0].path, '/api/cron/weekly-driver-digest');
assert.equal(vercel.crons[0].schedule, '0 13 * * 1');

assert.match(cron, /weekly_only:\s*true/);
assert.match(cron, /CRON_SECRET is not set/);
assert.match(cron, /scheduled-tasks/);
assert.doesNotMatch(cron, /service_role/);
assert.doesNotMatch(cron, /re_[A-Za-z0-9]/);

assert.match(scheduled, /Your Chance Classics bookings this week/);
assert.match(scheduled, /driver_weekly_digest_sends/);
assert.match(scheduled, /America\/Chicago/);
assert.match(scheduled, /weekly_only/);
assert.match(scheduled, /skipped_empty/);
assert.doesNotMatch(scheduled, /service_role/);

assert.match(notify, /booking_updated/);
assert.match(notify, /booking_assigned/);
assert.match(notify, /booking_unassigned/);
assert.match(notify, /RESEND_API_KEY/);
assert.doesNotMatch(notify, /service_role/);

assert.match(migration, /rental\.driver_weekly_digest_sends/);
assert.match(migration, /primary key \(staff_id, week_start\)/);
assert.match(migration, /enable row level security/);

console.log('driver-cron tests passed');
