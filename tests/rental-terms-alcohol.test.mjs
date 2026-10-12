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
assert.doesNotMatch(JSON.stringify(agreements), /provided by Company|liquor service|except for alcohol/i);

console.log('rental-terms alcohol tests passed');
