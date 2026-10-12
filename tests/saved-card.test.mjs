import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { balanceReminderMonday, reminderEventWindow } from '../supabase/functions/_shared/saved-card.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

assert.equal(balanceReminderMonday('2026-10-14'), '2026-10-12');
assert.equal(balanceReminderMonday('2026-10-18'), '2026-10-12');
assert.equal(balanceReminderMonday('2026-10-17'), '2026-10-12');
assert.equal(balanceReminderMonday('2026-10-12'), '2026-10-05');
assert.equal(balanceReminderMonday('2026-10-13'), '2026-10-05');
assert.equal(balanceReminderMonday('2026-10-20'), '2026-10-12');
assert.deepEqual(reminderEventWindow('2026-10-12'), { from: '2026-10-14', to: '2026-10-20' });

const bookings = read('site/app/api/bookings/route.ts');
const quoteBook = read('site/app/api/quotes/book/route.ts');
const saveCard = read('site/lib/saved-card.ts');
assert.match(saveCard, /customer_creation:\s*"always"/);
assert.match(saveCard, /setup_future_usage:\s*"off_session"/);
assert.match(bookings, /depositCheckoutSaveCard\(\{[\s\S]*booking_id: bookingId/);
assert.match(quoteBook, /depositCheckoutSaveCard\(\{[\s\S]*quote_id: quote\.id/);
assert.match(read('site/components/BookingForm.tsx'), /CARD_SAVE_TEXT/);
assert.match(read('site/components/QuoteCheckout.tsx'), /CARD_SAVE_TEXT/);
assert.match(read('site/lib/booking-rules.ts'), /extra hours, mileage overages, and damage/);

const webhook = read('site/app/api/stripe/webhook/route.ts');
assert.match(webhook, /stripe_customer_id/);
assert.match(webhook, /stripe_payment_method_id/);
assert.match(webhook, /purpose === "charge"/);
assert.match(webhook, /applySucceededCharge/);
assert.match(webhook, /emailOwnerAboutMoney/);
assert.match(webhook, /charge\.refunded/);
assert.match(webhook, /reason: "deposit"/);

const charge = read('site/app/api/bookings/charge/route.ts');
assert.match(charge, /off_session:\s*true/);
assert.match(charge, /confirm:\s*true/);
assert.match(charge, /authentication_required/);
assert.match(charge, /payUrl/);
assert.match(charge, /authorizeCharge/);
assert.match(charge, /source: "off_session"/);
assert.match(charge, /emailOwnerAboutMoney/);
assert.match(charge, /failedChargeNoticeIds/);

const migration = read('supabase/migrations/20261012203000_saved_card_and_charges.sql');
assert.match(migration, /stripe_customer_id/);
assert.match(migration, /stripe_payment_method_id/);
assert.match(migration, /balance_reminder_sent_at/);
assert.match(migration, /rental\.booking_charges/);
assert.match(migration, /enable row level security/);
assert.match(migration, /'balance', 'overage', 'damage'/);
const notices = read('supabase/migrations/20261012220000_owner_money_notices.sql');
assert.match(notices, /rental\.owner_money_notices/);
assert.match(notices, /rental\.booking_refunds/);
assert.match(notices, /refunded_usd/);
assert.match(notices, /enable row level security/);

const scheduled = read('supabase/functions/scheduled-tasks/index.ts');
assert.match(scheduled, /balanceReminderMonday/);
assert.match(scheduled, /balance_reminder_sent_at/);
assert.match(scheduled, /The balance is due the day before the event/);
assert.match(scheduled, /10\.25% sales tax/);
assert.match(scheduled, /metadata\[purpose\]", "charge"/);
assert.doesNotMatch(scheduled, /service_role/);

const garage = read('index.html');
assert.match(garage, /Charge saved card/);
assert.match(garage, /api\/bookings\/charge/);
assert.match(garage, /authentication_required/);
assert.match(garage, /value="balance"/);
assert.match(garage, /value="overage"/);
assert.match(garage, /value="damage"/);

console.log('saved-card tests passed');
