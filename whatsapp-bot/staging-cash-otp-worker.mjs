import fs from 'node:fs'

const SUPABASE_URL = String(process.env.STAGING_SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '').trim()
const OPENWA_URL = String(process.env.OPENWA_URL || 'http://openwa-api:2785').replace(/\/$/, '')
const OPENWA_API_KEY_FILE = String(process.env.OPENWA_DATA_KEY_FILE || '/openwa-data/.api-key')
const OPENWA_API_KEY_ENV = String(process.env.OPENWA_API_KEY || '').trim()
const OPENWA_SESSION_ID_ENV = String(process.env.OPENWA_SESSION_ID || '').trim()
const OPENWA_SESSION_NAME = String(process.env.OPENWA_SESSION_NAME || 'unique-market-7350060071')
const WA_ADMIN_PHONE = String(process.env.WA_ADMIN_PHONE || '').replace(/\D/g, '')
const POLL_MS = Math.max(3000, Number(process.env.STAGING_OTP_POLL_MS || 5000))
const MAX_AGE_HOURS = Math.max(1, Number(process.env.STAGING_OTP_MAX_AGE_HOURS || 1))

let apiKey = OPENWA_API_KEY_ENV
let sessionId = OPENWA_SESSION_ID_ENV
let busy = false

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !WA_ADMIN_PHONE || WA_ADMIN_PHONE.length < 10) {
  throw new Error('Set STAGING_SUPABASE_URL, STAGING_SUPABASE_SERVICE_ROLE_KEY, and WA_ADMIN_PHONE. This worker is intentionally admin-only.')
}

async function readApiKey() {
  if (apiKey) return apiKey
  try { apiKey = fs.readFileSync(OPENWA_API_KEY_FILE, 'utf8').trim() } catch {}
  if (!apiKey) throw new Error('OpenWA API key is unavailable')
  return apiKey
}

async function openwa(path, options = {}) {
  const key = await readApiKey()
  const response = await fetch(OPENWA_URL + path, {
    ...options,
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const raw = await response.text()
  let data
  try { data = raw ? JSON.parse(raw) : null } catch { data = raw }
  if (!response.ok) throw new Error('OpenWA ' + response.status + ': ' + String(typeof data === 'string' ? data : JSON.stringify(data)).slice(0, 400))
  return data
}

async function supabase(path, options = {}) {
  const response = await fetch(SUPABASE_URL + '/rest/v1' + path, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const raw = await response.text()
  let data
  try { data = raw ? JSON.parse(raw) : null } catch { data = raw }
  if (!response.ok) throw new Error('Supabase ' + response.status + ': ' + String(typeof data === 'string' ? data : JSON.stringify(data)).slice(0, 400))
  return data
}

async function getSessionId() {
  if (sessionId) return sessionId
  const sessions = await openwa('/api/sessions?name=' + encodeURIComponent(OPENWA_SESSION_NAME))
  const session = Array.isArray(sessions) ? sessions.find(item => item?.id && ['ready', 'connected', 'authenticated'].includes(String(item.status || '').toLowerCase())) : null
  if (!session?.id) throw new Error('Existing OpenWA session is not connected; refusing to create or pair a session')
  sessionId = String(session.id)
  return sessionId
}

async function sendAdminOnly(message) {
  const id = await getSessionId()
  const chatId = WA_ADMIN_PHONE + '@c.us'
  await openwa('/api/sessions/' + encodeURIComponent(id) + '/messages/send-text', {
    method: 'POST',
    body: JSON.stringify({ chatId, text: String(message || '') }),
  })
}

async function poll() {
  if (busy) return
  busy = true
  try {
    const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000).toISOString()
    const events = await supabase(
      '/whatsapp_notification_events?select=id,event_type,message,created_at,status' +
      '&status=eq.pending&event_type=like.cash_payment_otp_*&created_at=gte.' +
      encodeURIComponent(cutoff) + '&order=created_at.asc&limit=10'
    )
    for (const event of events || []) {
      try {
        // Never send staging OTPs to complaint.customer_phone; this worker sends to the admin test inbox only.
        await sendAdminOnly('[STAGING TEST — NOT A CUSTOMER PAYMENT NOTICE]\n\n' + String(event.message || 'Cash OTP event without a message'))
        await supabase('/whatsapp_notification_events?id=eq.' + encodeURIComponent(event.id) + '&status=eq.pending', {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString(), error_message: 'STAGING OTP routed to admin test inbox only' }),
        })
        console.log(JSON.stringify({ event: 'staging_otp_sent_to_admin_only', id: event.id }))
      } catch (error) {
        const message = String(error?.message || error).slice(0, 400)
        await supabase('/whatsapp_notification_events?id=eq.' + encodeURIComponent(event.id) + '&status=eq.pending', {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'failed', error_message: message }),
        }).catch(() => {})
        console.error('Staging OTP delivery failed for event ' + event.id + ': ' + message)
      }
    }
  } catch (error) {
    console.error('Staging OTP queue poll failed:', String(error?.message || error))
  } finally {
    busy = false
  }
}

console.log('Staging cash OTP worker started in ADMIN-ONLY mode; no customer numbers will be contacted.')
poll()
setInterval(poll, POLL_MS)
