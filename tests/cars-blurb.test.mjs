import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'site/app/portfolio/page.tsx',
  'site/app/portfolio-collections/my-portfolio/page.tsx',
  'site/data/seo.json',
];
const next = 'Here are the cars we currently have available. Tap a car to see details and book.';
const old = /Click an image below for more pictures|photographs of the cars we currently have available/;

for (const file of files) {
  const text = readFileSync(join(root, file), 'utf8');
  assert.ok(text.includes(next), file);
  assert.doesNotMatch(text, old, file);
}

console.log('cars blurb tests passed');
