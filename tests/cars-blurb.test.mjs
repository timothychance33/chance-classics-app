import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const blurb = 'Here are some photographs of the cars we currently have available. Click an image below for more pictures.';
const files = [
  'site/app/portfolio/page.tsx',
  'site/app/portfolio-collections/my-portfolio/page.tsx',
  'site/data/seo.json',
];

for (const file of files) {
  const text = readFileSync(join(root, file), 'utf8');
  assert.ok(text.includes(blurb), file);
  assert.doesNotMatch(text, /Tap a car to see details and book/);
}

const tile = readFileSync(join(root, 'site/components/CarTile.tsx'), 'utf8');
assert.match(tile, /href=\{galleryHref\}/);
assert.match(tile, /More pictures of/);
assert.match(tile, /href=\{bookHref\}/);
assert.match(tile, /href=\{meetHref\}/);

const home = readFileSync(join(root, 'site/app/page.tsx'), 'utf8');
assert.match(home, /galleryHref=\{galleryHref\}/);
assert.match(home, /car\.href/);

const grid = readFileSync(join(root, 'site/components/CarsGrid.tsx'), 'utf8');
assert.match(grid, /galleryHref=\{galleryHref\}/);
assert.match(grid, /portfolio-collections|car\.href/);

const gallery = readFileSync(join(root, 'site/app/portfolio-collections/my-portfolio/[slug]/page.tsx'), 'utf8');
assert.match(gallery, /LightboxGallery/);
assert.match(gallery, /Meet \{gallery\.title\}/);
assert.match(gallery, /#book/);

console.log('cars gallery tests passed');
