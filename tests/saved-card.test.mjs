import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { balanceReminderMonday, reminderEventWindow } from '../supabase/functions/_shared/saved-card.mjs';
import {
  MONDAY_DRIVER_LINE,
  balanceEventDate,
  balanceFirstName,
  balancePayHtml,
  balancePaySubject,
  balancePayText,
} from '../supabase/functions/_shared/balance-pay-email.mjs';
import { htmlToPlainText } from '../supabase/functions/_shared/email-plain.mjs';

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
assert.doesNotMatch(saveCard, /payment_method_types\s*:/);
assert.doesNotMatch(bookings, /payment_method_types\s*:/);
assert.doesNotMatch(quoteBook, /payment_method_types\s*:/);
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
assert.doesNotMatch(scheduled, /payment_method_types\s*[:=]/);
assert.doesNotMatch(scheduled, /service_role/);

const garage = read('index.html');
assert.match(garage, /Charge saved card/);
assert.match(garage, /const CHARGE_API_URL = '\/api\/bookings\/charge\/'/);
assert.doesNotMatch(garage, /CHARGE_API_URL = 'https:\/\//);
const garageVercel = JSON.parse(read('vercel.json'));
assert.equal(garageVercel.trailingSlash, undefined);
const bookingRewrites = garageVercel.rewrites.filter((rule) => String(rule.source).startsWith('/api/bookings'));
assert.deepEqual(bookingRewrites.map((rule) => [rule.source, rule.destination]), [
  ['/api/bookings/', 'https://chanceclassics.com/api/bookings/'],
  ['/api/bookings/:path+/', 'https://chanceclassics.com/api/bookings/:path+/'],
  ['/api/bookings/:path+', 'https://chanceclassics.com/api/bookings/:path+/'],
]);
assert.match(read('site/next.config.ts'), /trailingSlash:\s*true/);
assert.doesNotMatch(read('site/next.config.ts'), /skipTrailingSlashRedirect/);
assert.match(garage, /authentication_required/);
assert.match(garage, /value="balance"/);
assert.match(garage, /value="overage"/);
assert.match(garage, /value="damage"/);

assert.equal(balanceEventDate('2026-10-17'), 'Sat Oct 17');
assert.equal(balanceFirstName('Ada Lovelace'), 'Ada');
assert.equal(balanceFirstName(''), 'there');
assert.equal(balancePaySubject('2026-10-17'), 'Your Sat Oct 17 Chance Classics booking: final details');
assert.equal(balancePaySubject(''), 'Your Chance Classics booking: final details');
const payInput = {
  firstName: 'Ada <b> Lovelace',
  eventDate: '2026-10-17',
  eventType: 'Wedding',
  startTime: '14:00',
  endTime: '18:00',
  car: 'Brenda & Co',
  pickup: 'Chapel',
  dropoff: 'Hall',
  amount: 301.25,
  payUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
};
const payMail = balancePayHtml(payInput);
assert.match(payMail, /Hi Ada,/);
assert.match(payMail, /We're so excited to be a part of your event on Sat Oct 17!/);
assert.match(payMail, /Brenda &amp; Co is getting polished up and ready to roll\./);
assert.match(payMail, /Your remaining balance is \$301\.25 \(the booking total includes 10\.25% sales tax\), due the day before your event\. You can pay securely with the button below\./);
assert.doesNotMatch(payMail, /Tax exempt/);
const exemptMail = balancePayHtml({ ...payInput, taxExempt: true });
const exemptText = balancePayText({ ...payInput, taxExempt: true });
assert.match(exemptMail, /Tax exempt/);
assert.match(exemptText, /Tax exempt/);
assert.doesNotMatch(exemptMail, /10\.25%/);
assert.doesNotMatch(exemptText, /10\.25%/);
assert.match(payMail, />Pay the balance</);
assert.match(payMail, /href="https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_123"/);
const buttonAt = payMail.indexOf('>Pay the balance<');
const detailsAt = payMail.indexOf('>Date<');
const writtenLinkAt = payMail.lastIndexOf('https://checkout.stripe.com/c/pay/cs_test_123');
assert.ok(buttonAt > 0 && buttonAt < detailsAt && detailsAt < writtenLinkAt, 'booking details and the full pay link sit below the button');
assert.match(payMail, />Time</);
assert.match(payMail, /2:00PM – 6:00PM/);
assert.match(payMail, />Event</);
assert.match(payMail, />Wedding</);
assert.match(payMail, />Car</);
assert.match(payMail, />Pickup</);
assert.match(payMail, />Chapel</);
assert.match(payMail, />Drop-off</);
assert.match(payMail, />Hall</);
assert.match(payMail, />Balance</);
assert.match(payMail, /If you have any questions at all, just reply to this email or give us a call at \(318\) 344-5001\./);
assert.match(payMail, /See you soon!<br>Tim Chance<br>Chance Classics/);
assert.doesNotMatch(payMail, /Ada <b>/);
assert.match(balancePayHtml({ firstName: 'Ada', eventDate: '2026-10-17', amount: 10, payUrl: 'https://checkout.stripe.com/x' }), /Your car is getting polished up and ready to roll\./);
const payText = balancePayText(payInput);
assert.match(payText, /Hi Ada,/);
assert.match(payText, /We're so excited to be a part of your event on Sat Oct 17!/);
assert.match(payText, /Brenda & Co is getting polished up and ready to roll\./);
assert.match(payText, /Date: Sat Oct 17/);
assert.match(payText, /Time: 2:00PM – 6:00PM/);
assert.match(payText, /Balance: \$301\.25/);
assert.match(payText, /https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_123/);
assert.doesNotMatch(payText, /<a |<p>/);
assert.doesNotMatch(payMail, /You'll get your driver's name/);
assert.doesNotMatch(payText, /You'll get your driver's name/);
const mondayHtml = balancePayHtml({ ...payInput, mondayReminder: true });
const mondayText = balancePayText({ ...payInput, mondayReminder: true });
assert.equal(mondayHtml.split(MONDAY_DRIVER_LINE).length, 2);
assert.equal(mondayText.split(MONDAY_DRIVER_LINE).length, 2);
const questionsAt = mondayHtml.indexOf('If you have any questions at all');
assert.ok(mondayHtml.indexOf(MONDAY_DRIVER_LINE) < questionsAt, 'the driver line sits above the existing questions line');
assert.equal(
  htmlToPlainText('<p>Hi <b>Ada</b>,</p><p><a href="https://pay.example/abc">Pay</a></p>'),
  'Hi Ada,\n\nPay\nhttps://pay.example/abc',
);

assert.match(scheduled, /balancePaySubject/);
assert.match(scheduled, /balancePayHtml/);
assert.match(scheduled, /balancePayText/);
assert.match(scheduled, /mondayReminder: true/);
assert.match(scheduled, /reply_to: CUSTOMER_REPLY_TO/);
assert.match(scheduled, /text: plain/);
assert.match(scheduled, /FROM_EMAIL = Deno\.env\.get\("FROM_EMAIL"\) \?\? DEFAULT_FROM_EMAIL/);
assert.doesNotMatch(scheduled, /Balance due the day before your event/);

const notify = read('supabase/functions/send-notification/index.ts');
assert.match(notify, /type === "balance_pay"/);
assert.match(notify, /balancePayHtml/);
assert.match(notify, /balancePayText\(payMail\)/);
assert.doesNotMatch(notify, /mondayReminder/);
const sharedMail = read('supabase/functions/send-notification/shared.ts');
assert.match(sharedMail, /FROM_EMAIL = Deno\.env\.get\("FROM_EMAIL"\) \?\? DEFAULT_FROM_EMAIL/);
assert.match(sharedMail, /reply_to: REPLY_TO/);
assert.match(sharedMail, /text: plain/);
assert.match(read('supabase/functions/_shared/email-plain.mjs'), /bookings@chanceclassics\.com/);
assert.match(read('supabase/functions/_shared/email-plain.mjs'), /chanceclassics@gmail\.com/);
const payTypeAt = notify.indexOf('type === "balance_pay"');
const ownerCreatedAt = notify.indexOf('type === "booking_created"');
assert.ok(payTypeAt > 0 && payTypeAt < ownerCreatedAt, 'customer pay-link mail is its own send-notification type');

assert.match(charge, /mode === "pay_link"/);
assert.match(charge, /customer_email/);
assert.match(charge, /emailCustomerBalancePay/);
assert.match(charge, /resend_message_id: resendMessageId/);
assert.match(charge, /resendMessageId: mailed\.resendMessageId/);
assert.match(charge, /if \(mailed\.ok\)/);
assert.match(charge, /status: "pending"/);
assert.match(charge, /stripe_checkout_session_id/);
assert.match(charge, /pay_url: payUrl/);
assert.match(charge, /balance_reminder_sent_at/);
assert.match(charge, /emailedTo/);
assert.match(charge, /reason: "pay_link"/);
assert.match(charge, /purpose: "charge"/);
assert.doesNotMatch(charge, /payment_method_types\s*:/);
assert.doesNotMatch(charge, /No card was saved on this booking\./);

assert.match(read('site/lib/owner-booking-notify.ts'), /type: "balance_pay"/);
assert.match(read('site/lib/owner-booking-notify.ts'), /resendMessageId: resendMessageIdFromNotify\(payload\)/);
const messageIdMigration = read('supabase/migrations/20261014170000_booking_charges_resend_message_id.sql');
assert.match(messageIdMigration, /alter table rental\.booking_charges/);
assert.match(messageIdMigration, /add column if not exists resend_message_id text/);
assert.match(messageIdMigration, /It is not applied by this pull request/);

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
assert.match(sendFn, /readChargeBody/);
assert.match(sendFn, /networkErrorDetail/);
const chargeAt = garage.indexOf('async function chargeSavedCard');
const chargeFn = garage.slice(chargeAt, sendAt);
assert.match(chargeFn, /readChargeBody/);
assert.match(chargeFn, /networkErrorDetail/);
assert.match(garage, /Network error: /);
assert.match(garage, /Session token: present/);
assert.match(garage, /Session token: missing/);
assert.match(garage, /'HTTP '\+status/);

const sw = read('sw.js');
const methodAt = sw.indexOf("req.method !== 'GET'");
const originAt = sw.indexOf('url.origin !== self.location.origin');
const respondAt = sw.indexOf('e.respondWith');
assert.ok(methodAt > 0 && methodAt < respondAt, 'service worker skips non-GET before respondWith');
assert.ok(originAt > 0 && originAt < respondAt, 'service worker skips cross-origin before respondWith');
assert.match(garage, /updateViaCache:'none'/);

assert.match(charge, /console\.error\("bookings\/charge POST failed"/);
assert.match(charge, /return json\(request, \{ error: failureText\(error\) \}, 500\)/);
assert.match(charge, /if \(!auth\.ok\) return json\(request, \{ error: auth\.error \}, auth\.status\)/);
const auth = read('site/lib/charge-auth.ts');
assert.match(auth, /The session token is not a Supabase access token/);
assert.match(auth, /console\.error\("authorizeCharge failed"/);
assert.match(auth, /isAccessJwt/);
assert.match(auth, /Access-Control-Max-Age", "86400"/);
assert.match(auth, /Access-Control-Allow-Origin/);
assert.match(charge, /export async function OPTIONS/);
assert.match(charge, /headers: chargeCors\(request\)/);
assert.match(garage, /'Authorization':'Bearer '\+token/);

const chargeWebhookAt = webhook.indexOf('purpose === "charge"');
const chargeWebhook = webhook.slice(chargeWebhookAt, webhook.indexOf('let savedCard'));
assert.match(chargeWebhook, /applySucceededCharge/);
assert.match(chargeWebhook, /source: "checkout"/);
assert.match(chargeWebhook, /emailOwnerAboutMoney/);
assert.match(chargeWebhook, /amountUsd: amount/);
assert.match(read('site/lib/booking-charge.ts'), /amount_paid_usd: next\.paid/);
assert.match(read('site/lib/booking-charge.ts'), /OPEN_CHARGE = \["pending"/);
assert.match(read('site/lib/stripe-booking-events.ts'), /source !== "off_session"/);

const { createRequire } = await import('node:module');
const { chicagoPayLinkTime, payLinkSentNote, isNewPayLinkRow } = createRequire(import.meta.url)('../pay-link-note.js');
assert.equal(chicagoPayLinkTime('2026-10-13T15:51:00.000Z'), 'Oct 13, 10:51 AM');
assert.equal(chicagoPayLinkTime('2026-01-13T16:51:00.000Z'), 'Jan 13, 10:51 AM');
assert.equal(payLinkSentNote({
  email: 'blh8426@gmail.com',
  sentAt: '2026-10-13T15:51:00.000Z',
  amount: '296.25',
  status: 'pending',
}), 'Pay link sent Oct 13, 10:51 AM to blh8426@gmail.com ($296.25)');
assert.equal(payLinkSentNote({
  email: 'blh8426@gmail.com',
  sentAt: '2026-10-13T15:51:00.000Z',
  amount: 296.25,
  status: 'succeeded',
}), 'Pay link sent Oct 13, 10:51 AM to blh8426@gmail.com ($296.25) · Paid');
assert.equal(payLinkSentNote({ sentAt: '' }), '');
assert.equal(isNewPayLinkRow({ known: true, id: '' }, { id: 'new', created_at: '2026-10-13T15:51:00.000Z' }, Date.parse('2026-10-13T15:51:00.000Z')), true);
assert.equal(isNewPayLinkRow({ known: true, id: 'same' }, { id: 'same', created_at: '2026-10-13T15:51:00.000Z' }, Date.parse('2026-10-13T15:52:00.000Z')), false);
assert.equal(isNewPayLinkRow({ known: false, id: '' }, { id: 'old', created_at: '2026-10-13T15:00:00.000Z' }, Date.parse('2026-10-13T15:51:00.000Z')), false);
assert.equal(isNewPayLinkRow({ known: false, id: '' }, { id: 'new', created_at: '2026-10-13T15:51:05.000Z' }, Date.parse('2026-10-13T15:51:00.000Z')), true);

assert.match(garage, /pay-link-note\.js/);
assert.match(garage, /id="payLinkNote-/);
assert.match(garage, /balance_reminder_sent_at/);
assert.match(garage, /from\('booking_charges'\)/);
assert.match(garage, /\.not\('pay_url','is',null\)/);
assert.match(garage, /loadPayLinkNote\(b\.id\)/);
assert.match(sendFn, /fetchLatestPayLink/);
assert.match(sendFn, /isNewPayLinkRow/);
assert.match(sendFn, /await loadPayLinkNote\(bid\)/);
const adminRead = read('supabase/migrations/20261013160000_booking_charges_admin_read.sql');
assert.match(adminRead, /grant select on table rental\.booking_charges to authenticated/);
assert.match(adminRead, /booking_charges_admin_read/);
assert.match(adminRead, /using \(rental\.is_admin\(\)\)/);
assert.doesNotMatch(adminRead, /to anon/);

console.log('saved-card tests passed');
