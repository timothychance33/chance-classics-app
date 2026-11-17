import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {
  balanceCheckoutIsStale,
  bookingIsTaxExempt,
  customerAmountUpdate,
  splitTaxInclusiveTotal,
} from '../site/lib/customer-amount.mjs';
import {
  balanceCheckoutIsStale as edgeStale,
  customerAmountUpdate as edgeUpdate,
  splitTaxInclusiveTotal as edgeSplit,
} from '../supabase/functions/_shared/customer-amount.mjs';
import { reminderBalanceUsd } from '../supabase/functions/_shared/saved-card.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

function taxCents(subtotalCents) {
  return Math.round(subtotalCents * 0.1025);
}

for (let cents = 0; cents <= 200000; cents += 1) {
  const totalCents = cents + taxCents(cents);
  const split = splitTaxInclusiveTotal(totalCents / 100, false);
  assert.equal(Math.round((split.subtotal + split.tax) * 100), totalCents);
  assert.equal(Math.round(split.tax * 100), taxCents(Math.round(split.subtotal * 100)));
  assert.equal(edgeSplit(totalCents / 100, false).tax, split.tax);
}

assert.deepEqual(splitTaxInclusiveTotal(551.25, false), { total: 551.25, subtotal: 500, tax: 51.25 });
assert.deepEqual(splitTaxInclusiveTotal(660, false), { total: 660, subtotal: 598.64, tax: 61.36 });
assert.deepEqual(splitTaxInclusiveTotal(660, true), { total: 660, subtotal: 660, tax: 0 });
assert.equal(edgeSplit(660, false).tax, 61.36);

const meiganNotes = [
  'Website booking from a quote link.',
  'Quote: c6a62842-3dfa-4418-9252-1068c593d05a',
  'Car: Black Betty',
  'Occasion: wedding',
  'Duration: 2 hours',
  'Sales tax (10.25%): $51.25',
  'Quote total: $551.25',
  'Mileage fee: $0.00',
  'Deposit paid: $250.00',
  'Balance billed separately: $301.25',
  'Waiver accepted: Yes',
  'Price: $660.00',
].join('\n');

const updated = customerAmountUpdate({
  amount: 660,
  paid: 250,
  taxExempt: false,
  notes: meiganNotes,
});
assert.equal(updated.total, 660);
assert.equal(updated.subtotal, 598.64);
assert.equal(updated.tax, 61.36);
assert.equal(updated.balance, 410);
assert.equal(updated.paymentStatus, 'deposit');
assert.match(updated.notes, /Sales tax \(10\.25%\): \$61\.36/);
assert.match(updated.notes, /Balance billed separately: \$410\.00/);
assert.match(updated.notes, /Price: \$660\.00 \(\$410\.00 due\)/);
assert.match(updated.notes, /Quote total: \$551\.25/);
assert.match(updated.notes, /Deposit paid: \$250\.00/);
assert.equal(edgeUpdate({ amount: 660, paid: 250, taxExempt: false, notes: meiganNotes }).balance, 410);

const exempt = customerAmountUpdate({
  amount: 660,
  paid: 250,
  taxExempt: true,
  notes: 'Tax exempt: CERT-1\nSales tax (10.25%): $51.25\nPrice: $551.25',
});
assert.equal(exempt.tax, 0);
assert.equal(exempt.total, 660);
assert.equal(exempt.balance, 410);
assert.match(exempt.notes, /Sales tax \(10\.25%\): \$0\.00/);
assert.equal(bookingIsTaxExempt({ tax_exempt: true, notes: '' }), true);
assert.equal(bookingIsTaxExempt({ notes: meiganNotes }), false);
assert.equal(bookingIsTaxExempt({ notes: 'Tax exempt: parish' }), true);

const covered = customerAmountUpdate({ amount: 250, paid: 250, taxExempt: false, notes: 'Price: $551.25' });
assert.equal(covered.balance, 0);
assert.equal(covered.paymentStatus, 'paid');
assert.match(covered.notes, /Price: \$250\.00 \(\$0\.00 due\)/);

assert.equal(customerAmountUpdate({ amount: -1, paid: 0, notes: '' }).error, 'Enter the customer amount.');

assert.equal(balanceCheckoutIsStale({
  reason: 'balance',
  amountUsd: 301.25,
  metadataTotalUsd: null,
  currentTotalUsd: 660,
  currentBalanceUsd: 410,
}), true);
assert.equal(balanceCheckoutIsStale({
  reason: 'balance',
  amountUsd: 410,
  metadataTotalUsd: null,
  currentTotalUsd: 660,
  currentBalanceUsd: 410,
}), false);
assert.equal(balanceCheckoutIsStale({
  reason: 'balance',
  amountUsd: 100,
  metadataTotalUsd: '660.00',
  currentTotalUsd: 660,
  currentBalanceUsd: 410,
}), false);
assert.equal(balanceCheckoutIsStale({
  reason: 'balance',
  amountUsd: 301.25,
  metadataTotalUsd: '551.25',
  currentTotalUsd: 660,
  currentBalanceUsd: 410,
}), true);
assert.equal(balanceCheckoutIsStale({
  reason: 'overage',
  amountUsd: 301.25,
  metadataTotalUsd: null,
  currentTotalUsd: 660,
  currentBalanceUsd: 410,
}), false);
assert.equal(edgeStale({
  reason: 'balance',
  amountUsd: 301.25,
  currentTotalUsd: 660,
  currentBalanceUsd: 410,
}), true);

assert.equal(reminderBalanceUsd({
  total_usd: 660,
  amount_paid_usd: 250,
  balance_due_usd: 410,
}), 410);
assert.equal(reminderBalanceUsd({
  total_usd: 660,
  amount_paid_usd: 660,
  balance_due_usd: 301.25,
}), 0);

const garage = read('index.html');
const saveAt = garage.indexOf('async function saveOwnerCustomerAmount');
const saveFn = garage.slice(saveAt, garage.indexOf('async function saveEarnBookingAmount'));
assert.match(saveFn, /syncCustomerAmount/);
assert.match(saveFn, /applyCustomerAmountResult/);
assert.match(saveFn, /notifyOwnerBookingChanged/);
assert.doesNotMatch(saveFn, /update\(\{notes\}\)/);
assert.match(garage, /CUSTOMER_AMOUNT_API_URL = '\/api\/bookings\/customer-amount\/'/);
const balanceAt = garage.indexOf('function bookingBalanceDue');
const balanceFn = garage.slice(balanceAt, garage.indexOf('function chargeSavedCardHtml'));
assert.ok(balanceFn.indexOf('total_usd') < balanceFn.indexOf('balance_due_usd'));
assert.match(balanceFn, /paid<total/);

const scheduled = read('supabase/functions/scheduled-tasks/index.ts');
assert.match(scheduled, /reminderBalanceUsd/);
assert.match(scheduled, /metadata\[total_usd\]/);
assert.match(scheduled, /checkout\/sessions\/\$\{id\}\/expire/);
assert.match(scheduled, /totalUsd: b\.total_usd/);
assert.match(read('site/app/api/bookings/customer-amount/route.ts'), /total_usd: next\.total/);
assert.match(read('site/app/api/bookings/customer-amount/route.ts'), /supersedeStaleBalanceLinks/);
assert.doesNotMatch(read('site/app/api/bookings/customer-amount/route.ts'), /balance_due_usd:/);
assert.match(read('site/app/api/stripe/webhook/route.ts'), /balanceCheckoutIsStale/);
assert.match(read('site/app/api/stripe/webhook/route.ts'), /refundStaleBalanceCheckout/);
assert.match(read('site/lib/balance-reminder.ts'), /supersedeStaleBalanceLinks/);
assert.match(read('site/app/api/bookings/charge/route.ts'), /supersedeStaleBalanceLinks/);

console.log('customer-amount tests passed');
