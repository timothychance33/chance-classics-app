// Chance Classics — wix-booking-audit (daily safety net, REPORT ONLY)
//
// Compares confirmed Wix bookings for the next 90 days with rental.bookings and
// emails tim@2ndchancemotors.com + chanceclassics@gmail.com only if one is missing.
// It never inserts, edits or deletes bookings.
//
// A missing Wix key, a Wix API error, or any other exception emails the owners
// "Wix booking audit could not run: <reason>" before the function returns non-200.
//
// Called by pg_cron (jobs chance-classics-wix-audit-cdt / -cst) through pg_net.
// Auth: verify_jwt = true (cron sends the public anon key from Vault) AND the
// x-cron-secret header, checked by public.verify_wix_audit_secret (Vault secret
// wix_audit_cron_secret). Wix API key: Vault secret wix_api_key, read with
// public.get_wix_api_key() (service_role only). No secret is stored in source.
//
// Body options: { dry_run: true } returns the email instead of sending;
// { test: true } sends a [TEST] email to chanceclassics@gmail.com only.
// Requires RESEND_API_KEY / FROM_EMAIL (same project secrets as send-notification).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { DEFAULT_FROM_EMAIL, htmlToPlainText } from '../_shared/email-plain.mjs'
import { handleRequest } from './audit.mjs'

const SITE_ID = '75a32490-0f0e-4e59-8164-3add4463eed2'
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? DEFAULT_FROM_EMAIL
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const rental = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'rental' } })

const deps = {
  async verifySecret(candidate: string) {
    const { data, error } = await supabase.rpc('verify_wix_audit_secret', { candidate })
    if (error) { console.error('auth check failed:', error.message); return false }
    return data === true
  },
  async getWixKey() {
    const { data, error } = await supabase.rpc('get_wix_api_key')
    if (error) throw new Error('get_wix_api_key: ' + error.message)
    return (data as string | null) || Deno.env.get('WIX_API_KEY') || null
  },
  async fetchWixBookings(key: string, fromIso: string, toIso: string) {
    const all: any[] = []
    let cursor: string | null = null
    for (let page = 0; page < 20; page++) {
      const query: any = cursor
        ? { cursorPaging: { limit: 100, cursor } }
        : { filter: { $and: [{ startDate: { $gte: fromIso } }, { startDate: { $lte: toIso } }] }, cursorPaging: { limit: 100 } }
      const res = await fetch('https://www.wixapis.com/bookings/bookings-reader/v2/extended-bookings/query', {
        method: 'POST',
        headers: { Authorization: key, 'wix-site-id': SITE_ID, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(25000),
      })
      const raw = await res.text()
      if (!res.ok) throw new Error(`Wix ${res.status}: ${raw.slice(0, 300)}`)
      const d = JSON.parse(raw)
      all.push(...(d.extendedBookings || []))
      cursor = d.pagingMetadata?.cursors?.next || null
      if (!cursor || !d.pagingMetadata?.hasNext) break
    }
    return all
  },
  async getAppBookings(fromDate: string) {
    const { data, error } = await rental.from('bookings')
      .select('id,wix_booking_id,customer_name,customer_email,event_date,status')
      .gte('event_date', fromDate).limit(5000)
    if (error) throw new Error('bookings query: ' + error.message)
    return data || []
  },
  async sendEmail(m: { to: string[]; subject: string; text: string; html: string; idempotencyKey: string }) {
    const key = Deno.env.get('RESEND_API_KEY') || ''
    if (!key) throw new Error('RESEND_API_KEY is not set')
    const plain = String(m.text || '').trim() || htmlToPlainText(m.html) || m.subject
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': m.idempotencyKey },
      body: JSON.stringify({
        from: `Chance Classics <${FROM_EMAIL}>`,
        to: m.to,
        subject: m.subject,
        text: plain,
        html: m.html,
      }),
      signal: AbortSignal.timeout(15000),
    })
    const raw = await res.text()
    if (!res.ok) throw new Error(`Resend ${res.status}: ${raw}`)
    try { return JSON.parse(raw).id as string } catch { return undefined }
  },
}

Deno.serve(async (req) => {
  const res = await handleRequest(req, deps)
  console.log('wix-booking-audit:', res.status)
  return res
})
