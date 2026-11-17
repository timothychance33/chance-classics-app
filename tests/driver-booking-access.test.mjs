import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const html = read('index.html');
const sql = read('supabase/migrations/20261117203000_driver_booking_select_grants.sql');
const earlier = read('supabase/migrations/20261117120000_driver_safe_booking_notes.sql');
const rentalDb = read('site/lib/rental-db.ts');

assert.match(sql, /NOT APPLIED/);
assert.match(sql, /grant execute on function rental\.sanitize_driver_notes\(text\) to authenticated, service_role/);
assert.match(sql, /revoke all on function rental\.sanitize_driver_notes\(text\) from public, anon/);
assert.doesNotMatch(sql, /revoke all on function rental\.sanitize_driver_notes\(text\) from public, anon, authenticated/);
assert.match(sql, /revoke select on table rental\.bookings from authenticated, anon/);
assert.match(sql, /grant select \(' \|\| safe_list \|\| '\) on table rental\.bookings to authenticated/);
assert.doesNotMatch(sql, /grant select \([^)]*\) on table rental\.bookings to anon/i);
assert.doesNotMatch(sql, /to anon, authenticated/);
for (const column of ['notes', 'payment_status', 'total_usd', 'amount_paid_usd', 'balance_due_usd', 'mileage_fee_usd', 'hotel_fee_usd', 'stripe_customer_id', 'wix_order_number']) {
  assert.match(sql, new RegExp(`'${column}'`));
}
assert.match(sql, /read_quote_requests/);
assert.match(sql, /using \(rental\.is_admin\(\)\)/);
assert.match(sql, /bookings_for_session/);
assert.match(earlier, /revoke all on function rental\.sanitize_driver_notes\(text\) from public/);
assert.match(earlier, /from anon, authenticated/);

const loader = html.slice(html.indexOf('async function loadBookingRows'), html.indexOf('function normTime'));
assert.ok(loader.includes('async function loadBookingRows'), 'loader was sliced');
assert.match(loader, /bookings_for_session/);
assert.match(loader, /if\(!isOwnerView\(\)\)/);
const guard = loader.indexOf('if(!isOwnerView())');
const thrown = loader.indexOf('throw new Error', guard);
assert.ok(guard > 0 && thrown > guard);
assert.doesNotMatch(loader.slice(guard, thrown), /select\('\*'\)/, 'a non-owner load does not fall back to select *');
assert.match(loader.slice(thrown), /from\('bookings'\)\.select\('\*'\)/, 'owner fallback remains only after the non-owner throw');

const offer = html.slice(html.indexOf('async function advanceOfferPast'), html.indexOf('async function releaseOffersICannotTake'));
assert.match(offer, /\.select\('id'\)/);
assert.doesNotMatch(offer, /\.select\(\)/);
assert.doesNotMatch(offer, /\.select\('\*'\)/);
assert.match(html, /insert\(rec\)\.select\('id'\)/);
assert.doesNotMatch(html, /from\('bookings'\)\.insert\([^)]*\)\.select\(\)/);
assert.doesNotMatch(html, /\.channel\(/);
assert.doesNotMatch(html, /postgres_changes/);

assert.match(rentalDb, /SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(read('site/app/api/bookings/route.ts'), /createClient/);
assert.doesNotMatch(read('site/app/api/bookings/charge/route.ts'), /SUPABASE_ANON/);
assert.match(read('supabase/functions/claim-booking/index.ts'), /SERVICE_KEY/);
assert.match(read('supabase/functions/claim-booking/index.ts'), /\.select\("id"\)/);
