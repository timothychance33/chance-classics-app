// Vercel cron: Monday 13:00 UTC (~8am CDT / 7am CST).
// Proxies to the existing Supabase scheduled-tasks function so Resend
// stays in one place. Idempotency lives in rental.driver_weekly_digest_sends.
//
// Optional env (do not commit secrets):
//   CRON_SECRET            — Vercel sends Authorization: Bearer <CRON_SECRET>
//   WEEKLY_DIGEST_FN_URL   — override; defaults to the live scheduled-tasks URL
//   SCHEDULED_TASKS_SECRET — ?secret= if you later lock that function

const DEFAULT_FN =
  'https://ldhmwuhhejaabsvcyzdo.supabase.co/functions/v1/scheduled-tasks';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

  const cronSecret = process.env.CRON_SECRET || '';
  const auth = req.headers.authorization || '';
  const url = new URL(req.url, 'http://localhost');
  const querySecret = url.searchParams.get('secret') || '';
  // Stay dark until CRON_SECRET is set. That way merging this file does not
  // start a second Monday sender against the currently deployed function.
  if (!cronSecret) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      skipped: true,
      reason: 'CRON_SECRET is not set. Weekly digest keeps running from Supabase pg_cron. Set CRON_SECRET on Vercel only after deploying the updated scheduled-tasks function and rental.driver_weekly_digest_sends.',
    }));
    return;
  }
  if (auth !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  const fnUrl = process.env.WEEKLY_DIGEST_FN_URL || DEFAULT_FN;
  const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true';
  const dryRun = url.searchParams.get('dry_run') === '1';
  const secret = process.env.SCHEDULED_TASKS_SECRET || '';
  const target = secret ? `${fnUrl}${fnUrl.includes('?') ? '&' : '?'}secret=${encodeURIComponent(secret)}` : fnUrl;

  try {
    const r = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekly_only: true, force, dry_run: dryRun }),
    });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    res.statusCode = r.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  }
};
