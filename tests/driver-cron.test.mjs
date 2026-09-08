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

function mockRes(){
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v){ this.headers[k]=v; },
    end(s){ this.body=s; },
  };
}

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const handler = require(join(root, 'api/cron/weekly-driver-digest.js'));

{
  const res = mockRes();
  delete process.env.CRON_SECRET;
  await handler({ method: 'GET', headers: {}, url: '/api/cron/weekly-driver-digest' }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(JSON.parse(res.body).skipped, true);
}

{
  const res = mockRes();
  process.env.CRON_SECRET = 'test-cron-secret';
  await handler({ method: 'GET', headers: {}, url: '/api/cron/weekly-driver-digest' }, res);
  assert.equal(res.statusCode, 401);
}

{
  const res = mockRes();
  await handler({ method: 'PUT', headers: {}, url: '/api/cron/weekly-driver-digest' }, res);
  assert.equal(res.statusCode, 405);
}

delete process.env.CRON_SECRET;

console.log('driver-cron tests passed');
