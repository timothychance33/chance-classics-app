import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { imageSize } from './og-image-size.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const content = read('site/lib/content.ts');
const layout = read('site/app/layout.tsx');
const servicePage = read('site/app/service-page/[slug]/page.tsx');
const galleryPage = read('site/app/portfolio-collections/my-portfolio/[slug]/page.tsx');
const calendarPage = read('site/app/booking-calendar/[slug]/page.tsx');
const home = read('site/app/page.tsx');

assert.match(content, /OG_CHOICE: ShareCar = "phyllis"/);
assert.match(content, /src: "\/images\/og-phyllis\.jpg"/);
assert.match(content, /src: "\/images\/og-brenda\.jpg"/);
assert.match(content, /src: "\/images\/og-elsa\.jpg"/);
assert.match(content, /url: `\$\{SITE_URL\}\$\{OG_IMAGE\}`/);
assert.match(content, /width: OG_IMAGE_WIDTH/);
assert.match(content, /height: OG_IMAGE_HEIGHT/);
assert.match(content, /alt: OG_IMAGE_ALT/);
assert.match(content, /const share = customImage \? \{ url: customImage, alt: imageAlt \} : defaultShareImage\(\)/);
assert.doesNotMatch(content, /OG_IMAGE = "\/images\/home_main_02\.webp"/);

assert.match(layout, /images: \[defaultShareImage\(\)\]/);
assert.match(layout, /card: "summary_large_image"/);
assert.match(layout, /images: \[`\$\{SITE_URL\}\$\{OG_IMAGE\}`\]/);

assert.match(servicePage, /image: service\.image\.src/);
assert.match(galleryPage, /image: gallery\.hero\?\.src/);
assert.match(calendarPage, /image: service\.image\.src/);
assert.doesNotMatch(home, /image:/);

for (const name of ['og-phyllis.jpg', 'og-brenda.jpg', 'og-elsa.jpg']) {
  const file = join(root, 'site/public/images', name);
  const { width, height } = imageSize(readFileSync(file));
  assert.equal(width, 1200, name);
  assert.equal(height, 630, name);
  assert.ok(readFileSync(file).length < 300 * 1024, `${name} is under 300 KB`);
}

console.log('og-image tests passed');
