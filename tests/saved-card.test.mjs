import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { balanceReminderMonday, reminderEventWindow } from '../supabase/functions/_shared/saved-card.mjs';
import {
  balanceEventDate,
  balanceFirstName,
  balancePayHtml,
  balancePaySubject,
} from '../supabase/functions/_shared/balance-pay-email.mjs';

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

assert.equal(balanceEventDate('2026-10-17'), 'Sat Oct 17');
assert.equal(balanceFirstName('Ada Lovelace'), 'Ada');
assert.equal(balanceFirstName(''), 'there');
assert.equal(balancePaySubject('2026-10-17'), 'Getting ready for your event on Sat Oct 17, balance due');
const payMail = balancePayHtml({
  firstName: 'Ada <b> Lovelace',
  eventDate: '2026-10-17',
  car: 'Brenda & Co',
  amount: 301.25,
  payUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
});
assert.match(payMail, /Hi Ada,/);
assert.match(payMail, /We're so excited to be a part of your event on Sat Oct 17!/);
assert.match(payMail, /Brenda &amp; Co is getting polished up and ready to roll\./);
assert.match(payMail, /Your remaining balance is \$301\.25 \(the booking total includes 10\.25% sales tax\), due the day before your event\. You can pay securely with the button below\./);
assert.match(payMail, />Pay the balance</);
assert.match(payMail, /href="https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_123"/);
assert.match(payMail, /If you have any questions at all, just reply to this email or give us a call at \(318\) 344-5001\./);
assert.match(payMail, /See you soon!<br>Tim Chance<br>Chance Classics/);
assert.doesNotMatch(payMail, /Ada <b>/);
assert.match(balancePayHtml({ firstName: 'Ada', eventDate: '2026-10-17', amount: 10, payUrl: 'https://checkout.stripe.com/x' }), /Your car is getting polished up and ready to roll\./);

assert.match(scheduled, /balancePaySubject/);
assert.match(scheduled, /balancePayHtml/);
assert.doesNotMatch(scheduled, /Balance due the day before your event/);

const notify = read('supabase/functions/send-notification/index.ts');
assert.match(notify, /type === "balance_pay"/);
assert.match(notify, /balancePayHtml/);
const payTypeAt = notify.indexOf('type === "balance_pay"');
const ownerCreatedAt = notify.indexOf('type === "booking_created"');
assert.ok(payTypeAt > 0 && payTypeAt < ownerCreatedAt, 'customer pay-link mail is its own send-notification type');

assert.match(charge, /mode === "pay_link"/);
assert.match(charge, /customer_email/);
assert.match(charge, /emailCustomerBalancePay/);
assert.match(charge, /status: "pending"/);
assert.match(charge, /stripe_checkout_session_id/);
assert.match(charge, /pay_url: payUrl/);
assert.match(charge, /balance_reminder_sent_at/);
assert.match(charge, /emailedTo/);
assert.match(charge, /reason: "pay_link"/);
assert.match(charge, /purpose: "charge"/);
assert.doesNotMatch(charge, /No card was saved on this booking\./);

assert.match(read('site/lib/owner-booking-notify.ts'), /type: "balance_pay"/);

assert.match(garage, /Send pay link/);
assert.match(garage, /mode:'pay_link'/);
assert.match(garage, /Send a pay link for \$/);
assert.match(garage, /function copyPayLink/);
assert.match(garage, />Copy</);
assert.match(garage, /Charge saved card stays off/);
const sendAt = garage.indexOf('async function sendBalancePayLink');
const sendFn = garage.slice(sendAt, garage.indexOf('function bookingDetail'));
assert.match(sendFn, /sessionBearerHeaders\(\)/);
assert.match(sendFn, /mode:'pay_link'/);
assert.match(sendFn, /confirm\(/);
assert.match(sendFn, /customer_email/);

const chargeWebhookAt = webhook.indexOf('purpose === "charge"');
const chargeWebhook = webhook.slice(chargeWebhookAt, webhook.indexOf('let savedCard'));
assert.match(chargeWebhook, /applySucceededCharge/);
assert.match(chargeWebhook, /source: "checkout"/);
assert.match(chargeWebhook, /emailOwnerAboutMoney/);
assert.match(chargeWebhook, /amountUsd: amount/);
assert.match(read('site/lib/booking-charge.ts'), /amount_paid_usd: next\.paid/);
assert.match(read('site/lib/booking-charge.ts'), /OPEN_CHARGE = \["pending"/);
assert.match(read('site/lib/stripe-booking-events.ts'), /source !== "off_session"/);

console.log('saved-card tests passed');
