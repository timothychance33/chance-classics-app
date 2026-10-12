import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const agreements = JSON.parse(readFileSync(join(root, 'site/data/agreements.json'), 'utf8'));
const page = readFileSync(join(root, 'site/app/rental-terms/page.tsx'), 'utf8');

const expected = "NO alcohol is allowed. Chance Classics never supplies alcohol. If the CLIENT or any member of the CLIENT’s party is under 21 years of age, then Alcohol is not allowed in the vintage vehicle.";

const cars = Object.entries(agreements);
assert.ok(cars.length > 0, 'agreements are present');

for (const [slug, agreement] of cars) {
  const blocks = agreement.blocks.filter((block) => block.type === 'p' && /alcohol/i.test(block.text) && block.text.startsWith('(d)'));
  assert.equal(blocks.length, 1, `${slug} has one alcohol rule`);
  assert.equal(blocks[0].text, `(d) ${expected}`);
  assert.doesNotMatch(blocks[0].text, /provided by Company|liquor service|except for alcohol|bookings with alcohol/i);
  assert.match(blocks[0].text, /under 21 years of age/);
  assert.match(blocks[0].text, /never supplies alcohol/);
}

assert.match(page, /sharedTerms\(\)/, 'rental terms page shows the shared agreement');
assert.match(page, /listing price on the car/);
assert.match(page, /Additional consecutive hours requested on the day of the event are \$\{EXTRA_HOUR_USD\} per hour/);
assert.match(page, /Listing price by car/);
assert.doesNotMatch(page, /captured client agreement|moved onto each car page|until that difference is decided|\$200 for each additional consecutive hour/);
assert.doesNotMatch(JSON.stringify(agreements), /provided by Company|liquor service|except for alcohol/i);
assert.doesNotMatch(JSON.stringify(agreements), /fourteen \(14\) days|14 days/);

const balance = 'Balance must be paid by the day before the booked event';
const clauseQ = 'The rental balance is due by the day before the booked event';
for (const [slug, agreement] of cars) {
  const blocks = agreement.blocks.filter((block) => block.type === 'p');
  const balanceBlocks = blocks.filter((block) => block.text === balance);
  assert.equal(balanceBlocks.length, 1, `${slug} states the balance is due the day before`);
  const q = blocks.filter((block) => block.text.startsWith('(q)'));
  assert.equal(q.length, 1, `${slug} has one clause (q)`);
  assert.ok(q[0].text.includes(clauseQ), `${slug} clause (q) uses the day-before balance deadline`);
}

for (const [slug, agreement] of cars) {
  const hours = agreement.blocks.filter((block) => block.type === 'p' && block.text.startsWith('(h)'));
  assert.equal(hours.length, 1, `${slug} has one day-of hours clause`);
  assert.match(hours[0].text, /additional hours on the day of the CLIENT/);
  assert.match(hours[0].text, /an applicable rental fee of \$100 per hour for each additional consecutive hour/);
  assert.doesNotMatch(hours[0].text, /\$200 per hour/);
}

console.log('rental-terms alcohol tests passed');
