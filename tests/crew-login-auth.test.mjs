import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

import { allowCrewLogin, roleTokens, secretMatches } from '../supabase/functions/create-crew-login/access.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const crew = readFileSync(join(root, 'supabase/functions/create-crew-login/index.ts'), 'utf8');
const config = readFileSync(join(root, 'supabase/config.toml'), 'utf8');

assert.equal(secretMatches('same-value', 'same-value'), true);
assert.equal(secretMatches('same-value', 'same-valuE'), false);
assert.equal(secretMatches('', 'same-value'), false);
assert.equal(secretMatches('same-value', ''), false);
assert.deepEqual(roleTokens(' Admin, Driver '), ['admin', 'driver']);

assert.deepEqual(allowCrewLogin({ secretOk: true, roles: [] }), { ok: true, via: 'secret' });
assert.deepEqual(allowCrewLogin({ secretOk: false, roles: ['admin'], }), { ok: true, via: 'admin' });
assert.equal(allowCrewLogin({ secretOk: false, roles: 'admin,driver' }).via, 'admin');
assert.deepEqual(allowCrewLogin({ secretOk: false, roles: ['driver'] }), { ok: false, via: 'denied' });
assert.deepEqual(allowCrewLogin({ secretOk: false, roles: ['mechanic'] }), { ok: false, via: 'denied' });
assert.deepEqual(allowCrewLogin({ secretOk: false, roles: [] }), { ok: false, via: 'denied' });

assert.match(html, /const CREW_LOGIN_FN_URL = SUPABASE_URL \+ '\/functions\/v1\/create-crew-login'/);
assert.match(html, /function sessionBearerHeaders/);
assert.match(html, /headers:await sessionBearerHeaders\(\)/);
assert.doesNotMatch(html, /create-crew-login\?secret/);
assert.doesNotMatch(html, /\?secret=/);
assert.equal((html.match(/fetch\(CREW_LOGIN_FN_URL/g) || []).length, 1);

assert.match(crew, /x-crew-admin-secret/);
assert.match(crew, /secretMatches/);
assert.match(crew, /auth\.getUser/);
assert.match(crew, /from\("profiles"\)/);
assert.match(crew, /allowCrewLogin/);
assert.match(crew, /from "npm:@supabase\/supabase-js@2"/);
assert.doesNotMatch(crew, /esm\.sh\/@supabase\/supabase-js/);
assert.doesNotMatch(crew, /searchParams\.get\(["']secret["']\)/);
assert.match(crew, /ignored secret in the query string/);
assert.match(crew, /listUsers/);
assert.match(crew, /createUser/);
assert.match(crew, /must_change_pw: created/);

assert.match(config, /\[functions\.create-crew-login\]/);
assert.match(config, /verify_jwt = false/);

for (const rel of [
  'supabase/functions/send-notification/index.ts',
  'supabase/functions/quote-capture/index.ts',
  'supabase/functions/scheduled-tasks/index.ts',
]) {
  const src = readFileSync(join(root, rel), 'utf8');
  assert.match(src, /from "npm:@supabase\/supabase-js@2"/, rel);
  assert.doesNotMatch(src, /esm\.sh\/@supabase\/supabase-js/, rel);
}

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter((s) => s.trim());
for (const source of scripts) new vm.Script(source);

console.log('crew-login-auth tests passed');
