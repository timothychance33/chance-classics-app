// Chance Classics — wix-booking-audit: comparison + email + request logic.
// Plain JS so it runs in the edge function (Deno) and in local tests.
// REPORT ONLY: this never inserts, edits or deletes bookings.

export const TZ = 'America/Chicago'
export const ALERT_TO = ['tim@2ndchancemotors.com', 'chanceclassics@gmail.com']
export const TEST_TO = ['chanceclassics@gmail.com']
export const DEFAULT_DAYS = 90
export const APP_URL = 'https://app.chanceclassics.com'

function plainSpaces(s) { return String(s).replace(/[\u202f\u00a0]/g, ' ') }

export function chicagoDate(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  return p // YYYY-MM-DD
}
export function chicagoHour(d) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(d))
}
export function formatWhen(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'Unknown date'
  return plainSpaces(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(d)) + ' CT'
}
export function normName(s) { return String(s ?? '').toLowerCase().replace(/[^a-z]/g, '') }

// Wix extendedBookings[] -> flat rows
export function normalizeWix(extended) {
  const out = []
  for (const e of extended || []) {
    const b = e && e.booking ? e.booking : e
    if (!b || !b.id) continue
    const be = b.bookedEntity || {}
    const slot = be.slot || {}
    const c = b.contactDetails || {}
    const start = b.startDate || slot.startDate
    out.push({
      id: String(b.id),
      status: String(b.status || ''),
      payment: String(b.paymentStatus || ''),
      name: [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || '(no name)',
      email: c.email || null,
      start,
      date: chicagoDate(start),
      car: (slot.resource && slot.resource.name) || null,
      service: be.title || null,
    })
  }
  return out
}

// wix: normalized rows; app: rental.bookings rows {id,wix_booking_id,customer_name,customer_email,event_date}
export function findMissing(wix, app, { statuses = ['CONFIRMED'] } = {}) {
  const live = wix
    .map((w) => ({ ...w, date: w.date || chicagoDate(w.start), name: String(w.name || '(no name)').replace(/\s+/g, ' ').trim() }))
    .filter((w) => statuses.includes(String(w.status || '').toUpperCase()))
  const claimed = new Set()
  const byWixId = new Map()
  for (const r of app) if (r.wix_booking_id) byWixId.set(String(r.wix_booking_id), r)
  const missing = []
  const matched = []
  const unresolved = []
  for (const w of live) {
    const r = byWixId.get(w.id)
    if (r) { claimed.add(r.id); matched.push({ wix: w, app: r, how: 'wix_id' }) } else unresolved.push(w)
  }
  for (const w of unresolved) {
    const wn = normName(w.name)
    const we = String(w.email || '').toLowerCase().trim()
    const hit = app.find((r) => {
      if (claimed.has(r.id)) return false
      const wid = r.wix_booking_id ? String(r.wix_booking_id) : ''
      if (wid && !wid.startsWith('import')) return false // tied to a different Wix booking
      if (String(r.event_date) !== w.date) return false
      const sameName = wn && normName(r.customer_name) === wn
      const sameEmail = we && String(r.customer_email || '').toLowerCase().trim() === we
      return sameName || sameEmail
    })
    if (hit) { claimed.add(hit.id); matched.push({ wix: w, app: hit, how: 'name_date' }) } else missing.push(w)
  }
  missing.sort((a, b) => String(a.start).localeCompare(String(b.start)))
  return { checked: live.length, matched, missing }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

export function buildEmail({ missing, checked, days, test = false, runDate }) {
  const n = missing.length
  const prefix = test ? '[TEST] ' : ''
  const subject = n
    ? `${prefix}${n} Wix booking${n === 1 ? '' : 's'} missing from the Chance Classics app`
    : `${prefix}Wix booking check: nothing missing`
  const carLine = (m) => [m.car, m.service && m.service !== m.car ? `(${m.service})` : null].filter(Boolean).join(' ') || 'Unknown car'
  const lines = []
  if (test) lines.push('[TEST] This is a test of the daily Wix booking check. No action needed for the test itself.', '')
  lines.push(n
    ? `These confirmed Wix bookings in the next ${days} days are not in the Chance Classics app:`
    : `All ${checked} confirmed Wix bookings in the next ${days} days are in the Chance Classics app.`)
  lines.push('')
  missing.forEach((m, i) => {
    lines.push(`${i + 1}. ${m.name} — ${formatWhen(m.start)} — ${carLine(m)}`)
    lines.push(`   Wix status: ${m.status}${m.payment ? ', ' + m.payment : ''} · Wix booking id: ${m.id}`)
  })
  if (n) {
    lines.push('', 'Nothing was added automatically. Please add these in the app if they are real bookings.')
  }
  lines.push('', `Checked ${checked} confirmed Wix booking${checked === 1 ? '' : 's'} on ${runDate}.`, `App: ${APP_URL}`)
  const text = lines.join('\n')
  const rows = missing.map((m) =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5ddd0"><b>${esc(m.name)}</b></td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #e5ddd0">${esc(formatWhen(m.start))}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #e5ddd0">${esc(carLine(m))}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #e5ddd0;color:#6b6052;font-size:12px">${esc(m.status)}${m.payment ? ', ' + esc(m.payment) : ''}<br>${esc(m.id)}</td></tr>`).join('')
  const html = `<div style="font-family:Arial,sans-serif;max-width:680px;color:#21130f">` +
    (test ? `<p style="background:#fff3cd;padding:8px 12px"><b>[TEST]</b> This is a test of the daily Wix booking check.</p>` : '') +
    `<h2 style="color:#6e1d1a">${esc(subject.replace(/^\[TEST\] /, ''))}</h2>` +
    `<p>${esc(lines[test ? 2 : 0])}</p>` +
    (n ? `<table style="border-collapse:collapse;font-size:14px"><tr style="text-align:left;background:#f4efe6"><th style="padding:6px 10px">Name</th><th style="padding:6px 10px">Date</th><th style="padding:6px 10px">Car / service</th><th style="padding:6px 10px">Wix</th></tr>${rows}</table>` +
      `<p>Nothing was added automatically. Please add these in the app if they are real bookings.</p>` : '') +
    `<p style="color:#6b6052;font-size:12px">Checked ${checked} confirmed Wix bookings on ${esc(runDate)}. <a href="${APP_URL}">Open the app</a></p></div>`
  return { subject, text, html }
}

export function couldNotRunText(reason) {
  const detail = String(reason || 'unknown error').replace(/\s+/g, ' ').trim() || 'unknown error'
  return `Wix booking audit could not run: ${detail}`
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Owners still hear about a failed run. A send failure is logged and does not hide the original error.
async function notifyCouldNotRun(deps, reason, runDate) {
  const text = couldNotRunText(reason)
  try {
    await deps.sendEmail({
      to: ALERT_TO,
      subject: text,
      text,
      html: `<p>${esc(text)}</p>`,
      idempotencyKey: `wix-booking-audit-failed-${runDate}`,
    })
  } catch (e2) {
    console.error('failure notice not sent:', e2 instanceof Error ? e2.message : String(e2))
  }
}

// deps: verifySecret(c), getWixKey(), fetchWixBookings(key, fromIso, toIso) -> extendedBookings[],
//       getAppBookings(fromDate) -> rows, sendEmail({to,subject,text,html,idempotencyKey}) -> id, now?()
export async function handleRequest(req, deps) {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const provided = req.headers.get('x-cron-secret') || ''
  let ok = false
  try { ok = provided ? (await deps.verifySecret(provided)) === true : false } catch { ok = false }
  if (!ok) return json({ error: 'unauthorized' }, 401)

  let body = {}
  try { body = await req.json() } catch { body = {} }
  const now = deps.now ? deps.now() : new Date()
  const test = body.test === true
  const dryRun = body.dry_run === true
  const days = Math.min(Math.max(Number(body.days) || DEFAULT_DAYS, 1), 365)

  // Two cron entries (13:00 and 14:00 UTC) cover CDT and CST; only the one that
  // lands on 8 AM Chicago time does the work.
  if (body.only_at_chicago_hour != null && chicagoHour(now) !== Number(body.only_at_chicago_hour)) {
    return json({ skipped: 'not the scheduled Chicago hour', chicago_hour: chicagoHour(now) })
  }

  const runDate = chicagoDate(now.toISOString())
  const fromIso = now.toISOString()
  const toIso = new Date(now.getTime() + days * 86400000).toISOString()
  try {
    let wixRows
    if (test && Array.isArray(body.test_wix_bookings)) {
      wixRows = body.test_wix_bookings // already-normalized rows supplied for a test run
    } else {
      const key = await deps.getWixKey()
      if (!key) {
        const reason = 'Wix API key not configured (Vault secret wix_api_key)'
        await notifyCouldNotRun(deps, reason, runDate)
        return json({ error: reason }, 503)
      }
      wixRows = normalizeWix(await deps.fetchWixBookings(key, fromIso, toIso))
    }
    const yesterday = chicagoDate(new Date(now.getTime() - 86400000).toISOString())
    const app = await deps.getAppBookings(yesterday)
    const { checked, missing, matched } = findMissing(wixRows, app)
    const summary = {
      checked, matched: matched.length, missing: missing.map((m) => ({ name: m.name, when: formatWhen(m.start), car: m.car, service: m.service, id: m.id })),
    }
    if (!missing.length && !test) return json({ sent: false, reason: 'nothing missing', ...summary })
    const email = buildEmail({ missing, checked, days, test, runDate })
    const to = test ? TEST_TO : ALERT_TO
    if (dryRun) return json({ dry_run: true, to, ...email, ...summary })
    const id = await deps.sendEmail({
      to, subject: email.subject, text: email.text, html: email.html,
      idempotencyKey: test ? `wix-booking-audit-test-${now.getTime()}` : `wix-booking-audit-${runDate}`,
    })
    return json({ sent: true, to, resend_id: id || null, ...summary })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('wix-booking-audit failed:', msg)
    await notifyCouldNotRun(deps, msg, runDate)
    return json({ error: msg }, 500)
  }
}
