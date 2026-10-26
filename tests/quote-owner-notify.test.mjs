import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import {
  matchCar,
  ownerQuoteRequestHtml,
  ownerQuoteRequestRows,
  ownerQuoteRequestSubject,
  quoteFromWixPayload,
  webhookAuthorized,
} from '../supabase/functions/_shared/owner-quote-email.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const capture = readFileSync(join(root, 'supabase/functions/quote-capture/index.ts'), 'utf8');
const config = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
const notify = readFileSync(join(root, 'supabase/functions/send-notification/index.ts'), 'utf8');
const siteQuotes = readFileSync(join(root, 'site/app/api/quotes/route.ts'), 'utf8');

const wixBody = {
  data: {
    fields: [
      { label: 'First name', value: 'Ada' },
      { label: 'Last name', value: 'Lovelace' },
      { label: 'Email', value: 'ada@example.com' },
      { label: 'Phone', value: '318-555-0100' },
      { label: 'Select a service', value: 'Elsa - 1954 Packard' },
      { label: 'Type of event', value: 'Wedding' },
      { label: 'Event date and time', value: '2026-10-04 2:30 PM' },
      { label: 'Event location', value: 'Bossier City' },
      { label: 'Give us more details', value: 'Arrive early & set up <stage>' },
      { label: 'Event planner', value: 'Yes' },
    ],
  },
};

const parsed = quoteFromWixPayload(wixBody);
assert.equal(parsed.customer_name, 'Ada Lovelace');
assert.equal(parsed.customer_email, 'ada@example.com');
assert.equal(parsed.customer_phone, '318-555-0100');
assert.equal(parsed.service_name, 'Elsa - 1954 Packard');
assert.equal(parsed.event_type, 'Wedding');
assert.equal(parsed.event_date, '2026-10-04');
assert.equal(parsed.event_time, '2:30 PM');
assert.equal(parsed.event_location, 'Bossier City');
assert.equal(parsed.details, 'Arrive early & set up <stage>');
assert.equal(parsed.planner, 'Yes');
assert.equal(parsed.dropoff, null);

const withDropoffField = quoteFromWixPayload({
  data: {
    fields: [
      { label: 'Drop-off location', value: '200 Crockett St' },
      { label: 'Event location', value: 'Bossier City' },
    ],
  },
});
assert.equal(withDropoffField.event_location, 'Bossier City');
assert.equal(withDropoffField.dropoff, '200 Crockett St');
const photoOnly = quoteFromWixPayload({
  data: { fields: [{ label: 'Event location', value: 'Studio' }, { label: 'Type of event', value: 'Photo Session' }] },
});
assert.equal(photoOnly.dropoff, null);
assert.equal(photoOnly.event_location, 'Studio');

const cars = [
  { id: 'packard', name: 'Packard' },
  { id: 'elsa', name: 'Elsa' },
];
assert.equal(matchCar(parsed.service_name, cars).id, 'elsa');
assert.equal(matchCar(null, cars), null);
assert.equal(matchCar('Unknown heap', cars), null);

const quote = { ...parsed, car_name: 'Elsa' };
assert.equal(
  ownerQuoteRequestSubject(quote),
  'New price quote request — Ada Lovelace / 2026-10-04',
);
assert.equal(ownerQuoteRequestSubject({ customer_name: 'Ada' }), 'New price quote request — Ada');
assert.equal(ownerQuoteRequestSubject({ event_date: '2026-10-04' }), 'New price quote request — 2026-10-04');
assert.equal(ownerQuoteRequestSubject({}), 'New price quote request');
assert.equal(
  ownerQuoteRequestSubject({ customer_name: 'Ada\nBcc: evil@example.com' }),
  'New price quote request — Ada Bcc: evil@example.com',
);

const labels = ownerQuoteRequestRows(quote).map(([label]) => label);
assert.deepEqual(labels, [
  'Customer', 'Email', 'Phone', 'Service / car', 'Car', 'Event', 'Date', 'Time', 'Location', 'Details', 'Event planner',
]);
const withDropoff = ownerQuoteRequestRows({
  ...quote,
  id: 'q-100',
  dropoff_location: '200 Crockett St',
});
assert.equal(withDropoff[0][0], 'Request id');
assert.equal(withDropoff.find(([label]) => label === 'Drop-off')[1], '200 Crockett St');

const html = ownerQuoteRequestHtml(quote, 'https://app.chanceclassics.com');
assert.match(html, /Ada Lovelace/);
assert.match(html, /ada@example.com/);
assert.match(html, /318-555-0100/);
assert.match(html, /Elsa - 1954 Packard/);
assert.match(html, /2026-10-04/);
assert.match(html, /2:30 PM/);
assert.match(html, /Bossier City/);
assert.match(html, /Arrive early &amp; set up &lt;stage&gt;/);
assert.doesNotMatch(html, /<stage>/);
assert.match(html, /Open the app/);

const sparse = ownerQuoteRequestHtml({ customer_name: 'Ada' }, '');
assert.match(sparse, /Customer/);
assert.doesNotMatch(sparse, /Email/);
assert.doesNotMatch(sparse, /Phone/);
assert.doesNotMatch(sparse, /TBD/);
assert.doesNotMatch(sparse, />there</);

const blank = quoteFromWixPayload({});
assert.equal(blank.customer_name, null);
assert.equal(blank.customer_email, null);
assert.equal(blank.event_date, null);
const blankHtml = ownerQuoteRequestHtml(blank, 'https://app.chanceclassics.com');
assert.equal(ownerQuoteRequestRows(blank).length, 0);
assert.doesNotMatch(blankHtml, /Customer/);
assert.doesNotMatch(blankHtml, /example\.com/);

assert.equal(webhookAuthorized('', 'anything'), false);
assert.equal(webhookAuthorized(undefined, 'anything'), false);
assert.equal(webhookAuthorized('correct-horse', ''), false);
assert.equal(webhookAuthorized('correct-horse', 'nope'), false);
assert.equal(webhookAuthorized('correct-horse', 'correct-horse'), true);

assert.match(capture, /WIX_SYNC_SECRET/);
assert.match(capture, /webhookAuthorized\(SECRET, provided\)/);
assert.match(capture, /x-secret/);
assert.match(capture, /searchParams\.get\("secret"\)/);
assert.match(capture, /WIX_SYNC_SECRET is not set/);
assert.match(capture, /server misconfigured/);
assert.match(capture, /from "npm:@supabase\/supabase-js@2"/);
assert.doesNotMatch(capture, /esm\.sh\/@supabase\/supabase-js/);
assert.doesNotMatch(capture, /WIX_SYNC_SECRET"\)\s*\?\?\s*"[^"]+"/);
assert.doesNotMatch(capture, /secret=[A-Za-z0-9]/);

assert.match(capture, /RESEND_API_KEY/);
assert.match(capture, /OWNER_EMAIL/);
assert.match(capture, /chanceclassics@gmail\.com/);
assert.match(capture, /FROM_EMAIL/);
assert.match(capture, /htmlToPlainText/);
assert.match(capture, /\.\.\/_shared\/email-plain\.mjs/);
assert.match(capture, /const plain = htmlToPlainText\(html\) \|\| subject/);
assert.match(capture, /text: plain/);
assert.doesNotMatch(capture, /function htmlToPlainText/);
assert.match(capture, /await sendEmail\(OWNER_EMAIL,/);
assert.equal((capture.match(/await sendEmail\(/g) || []).length, 1);
assert.doesNotMatch(capture, /sendEmail\(\s*(parsed\.customer_email|customer_email|email)\b/);

const insertAt = capture.indexOf('.insert(rec)');
const emailAt = capture.indexOf('await emailOwner(');
assert.ok(insertAt > 0 && emailAt > insertAt, 'owner email runs only after the insert');
const recBlock = capture.slice(capture.indexOf('const rec'), capture.indexOf('let inserted'));
assert.match(recBlock, /status: "new"/);
assert.doesNotMatch(recBlock, /event_date_raw/);
assert.match(capture, /if \(dropoff\) rec\.dropoff_location = dropoff/);
assert.match(capture, /dropoff_location\/i\.test/);
assert.match(capture, /dropoff_location: dropoff/);
assert.match(capture, /owner_notified = false/);
assert.match(capture, /quote-capture owner notify failed/);

assert.match(config, /\[functions\.quote-capture\]/);
assert.match(config, /verify_jwt = false/);

const siteInsert = siteQuotes.lastIndexOf('.insert(');
const siteMail = siteQuotes.indexOf('await emailOwnerAboutQuote');
assert.ok(siteInsert > 0 && siteMail > siteInsert, 'site quote email runs only after the insert');
assert.match(siteQuotes, /dropoff_location/);
assert.match(siteQuotes, /quoteDropoffError/);
assert.doesNotMatch(siteQuotes, /Enter the drop-off address/);
assert.match(siteQuotes, /car_name/);
assert.doesNotMatch(siteQuotes, /sendEmail\(/);

assert.match(notify, /type === "quote_request"/);
assert.match(notify, /quote_request requires a quote/);
const quoteTypeAt = notify.indexOf('type === "quote_request"');
const quoteBranch = notify.slice(quoteTypeAt, notify.indexOf('unknown type', quoteTypeAt));
assert.match(quoteBranch, /sendEmail\(OWNER_EMAIL, subject, html\)/);
assert.match(quoteBranch, /ownerQuoteRequestHtml/);
assert.doesNotMatch(quoteBranch, /body\.to/);
assert.doesNotMatch(quoteBranch, /sendEmail\(\s*(q\.customer_email|body\.to)/);

console.log('quote-owner-notify tests passed');
