import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { htmlToPlainText } from '../supabase/functions/_shared/email-plain.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const functionsDir = join(root, 'supabase/functions');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|mjs|js)$/.test(name)) out.push(path);
  }
  return out;
}

const resendFiles = walk(functionsDir)
  .filter((path) => readFileSync(path, 'utf8').includes('api.resend.com/emails'))
  .map((path) => relative(root, path))
  .sort();

assert.deepEqual(resendFiles, [
  'supabase/functions/quote-capture/index.ts',
  'supabase/functions/scheduled-tasks/index.ts',
  'supabase/functions/send-followups-next/index.ts',
  'supabase/functions/send-followups/index.ts',
  'supabase/functions/send-notification/shared.ts',
]);

const read = (rel) => readFileSync(join(root, rel), 'utf8');

for (const rel of resendFiles) {
  const src = read(rel);
  assert.doesNotMatch(src, /classics@2ndchancespeedshop\.com/, rel);
  assert.doesNotMatch(src, /function htmlToPlainText/, rel);
  assert.match(src, /text:\s*plain|subject,\s*text\b/, rel);
}

const followups = read('supabase/functions/send-followups/index.ts');
assert.match(followups, /FROM_EMAIL = Deno\.env\.get\("FROM_EMAIL"\) \?\? DEFAULT_FROM_EMAIL/);
assert.match(followups, /from: `Chance Classics <\$\{FROM_EMAIL\}>`/);
assert.match(followups, /from "\.\.\/_shared\/email-plain\.mjs"/);
assert.match(followups, /htmlToPlainText/);
assert.match(followups, /sendViaResend\(b\.customer_email, tpl\.subject, tpl\.html\)/);
assert.match(followups, /It was an honor to be part of your day/);
assert.match(followups, /https:\/\/g\.page\/r\/CagTWW5ZROCWEAE\/review/);
assert.match(followups, /reply_to: REPLY_TO/);

const reviewHtml = `
  <p>Hey Ada,</p>
  <p style="text-align:center;margin:28px 0;">
    <a href="https://g.page/r/CagTWW5ZROCWEAE/review">Leave us a Google review</a>
  </p>
  <p>Thanks so much!</p>`;
const reviewText = htmlToPlainText(reviewHtml);
assert.match(reviewText, /Hey Ada,/);
assert.match(reviewText, /Leave us a Google review\nhttps:\/\/g\.page\/r\/CagTWW5ZROCWEAE\/review/);
assert.doesNotMatch(reviewText, /<a |<p>/);

const next = read('supabase/functions/send-followups-next/index.ts');
assert.match(next, /FROM_EMAIL = Deno\.env\.get\("FROM_EMAIL"\) \?\? DEFAULT_FROM_EMAIL/);
assert.match(next, /"Tim Chance \| Chance Classics" <\$\{FROM_EMAIL\}>/);
assert.match(next, /JSON\.stringify\(\{ from: FROM, reply_to: REPLY_TO, to, subject, text \}\)/);
assert.match(next, /sendViaResend\(b\.customer_email!\.trim\(\), tpl\.subject, tpl\.text, `\$\{kind\}-\$\{b\.id\}`\)/);
assert.match(next, /sendViaResend\(TEST_TO, subject, r\.text\)/);
assert.doesNotMatch(next, /html:/);

const scheduled = read('supabase/functions/scheduled-tasks/index.ts');
const shared = read('supabase/functions/send-notification/shared.ts');
for (const src of [scheduled, shared]) {
  assert.match(src, /FROM_EMAIL = Deno\.env\.get\("FROM_EMAIL"\) \?\? DEFAULT_FROM_EMAIL/);
  assert.match(src, /from: `Chance Classics <\$\{FROM_EMAIL\}>`/);
  assert.match(src, /htmlToPlainText/);
}

const capture = read('supabase/functions/quote-capture/index.ts');
assert.match(capture, /from: `Chance Classics <\$\{FROM_EMAIL\}>`/);
assert.match(capture, /Deno\.env\.get\("FROM_EMAIL"\)/);
assert.match(capture, /await sendEmail\(OWNER_EMAIL, subject, html\)/);

console.log('resend-deliverability tests passed');
