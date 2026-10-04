import express from 'express'
import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  fetchLatestWaWebVersion,
  Browsers,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const PORT = Number(process.env.PORT || 10000)
// On Render, use a mounted persistent disk path via WA_AUTH_DIR.
// Default remains local for development; set WA_AUTH_DIR=/var/data/whatsapp-auth in Render.
const AUTH_DIR = process.env.WA_AUTH_DIR || path.resolve('whatsapp-bot/auth_info')
const PHONE_NUMBER = String(process.env.WA_PHONE_NUMBER || '917350060071').replace(/\D/g, '')
const WA_API_SECRET = String(process.env.WA_API_SECRET || '')
const KAPSO_WEBHOOK_SECRET = String(process.env.KAPSO_WEBHOOK_SECRET || '')
const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://tfscvycomllamoubtlcf.supabase.co')
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
const WA_GROUP_JID = String(process.env.WA_GROUP_JID || '').trim()
const EVENT_POLL_MS = Number(process.env.WA_EVENT_POLL_MS || 5000)
const logger = pino({ level: process.env.WA_LOG_LEVEL || 'silent' })
let authSyncTimer = null
let authSyncInFlight = null
const app = express()

// Kapso WhatsApp webhook. Keep this route before express.json() so the raw
// request body is available for X-Webhook-Signature verification.
app.post('/webhooks/kapso', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '')
    const signature = String(req.get('x-webhook-signature') || '').trim()

    if (KAPSO_WEBHOOK_SECRET) {
      const digest = crypto.createHmac('sha256', KAPSO_WEBHOOK_SECRET).update(rawBody).digest('hex')
      const expected = signature.replace(/^sha256=/i, '')
      const valid = /^[a-f0-9]{64}$/i.test(expected) &&
        crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(digest, 'hex'))
      if (!valid) return res.status(401).json({ ok: false, error: 'Invalid Kapso webhook signature' })
    }

    const payload = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {}
    console.log('Kapso webhook received:', JSON.stringify(payload))
    return res.status(200).json({ ok: true, received: true })
  } catch (err) {
    console.error('Kapso webhook error:', err)
    return res.status(400).json({ ok: false, error: 'Invalid webhook payload' })
  }
})

app.use(express.json({ limit: '256kb' }))

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null

let sock = null
let status = 'starting'
let lastConnectionEvent = null
let lastQr = null
let pairingCode = null
let reconnecting = false
let eventPollerStarted = false
let eventProcessingInFlight = null
let pairingReady = false
let pairingRequestInFlight = null
const trackedWhatsAppMessages = new Map()
const INSTANCE_ID = String(process.env.RENDER_INSTANCE_ID || process.env.RENDER_SERVICE_ID || 'local') + ':' + crypto.randomUUID()
const WHATSAPP_LEASE_TTL_SECONDS = 45
const WHATSAPP_LEASE_RENEW_MS = 15000
let whatsappLeaseHeld = false
let whatsappLeaseRenewTimer = null

// Simple in-memory WhatsApp conversation flow.
// Conversation state is intentionally kept in memory; the actual complaint/customer
// record is persisted in Supabase as soon as the Service flow is completed.
const complaintSessions = new Map()

async function findOrCreateWhatsAppCustomer(phone, name, location) {
  const mobile = String(phone || '').replace(/\D/g, '')
  if (!mobile || !supabase) return null

  const existing = await supabaseRestRequest('/customers?select=id,name,mobile,company_name,address&mobile=eq.' + encodeURIComponent(mobile) + '&limit=1')
  if (Array.isArray(existing) && existing[0]?.id) {
    const current = existing[0]
    const patch = {}
    if (name && !current.name) patch.name = name
    if (location && !current.address) patch.address = location
    if (Object.keys(patch).length) {
      await supabaseRestRequest('/customers?id=eq.' + encodeURIComponent(current.id), {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(patch)
      })
    }
    return { ...current, ...patch }
  }

  const rows = await supabaseRestRequest('/customers', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name: name || 'WhatsApp Customer', mobile, address: location || null })
  })
  return Array.isArray(rows) ? rows[0] || null : null
}

async function createWhatsAppComplaint(session, from) {
  if (!supabase) throw new Error('Supabase event bridge is not configured')
  const phone = String(from || '').replace(/\D/g, '')
  const customer = await findOrCreateWhatsAppCustomer(phone, session.name, session.location)
  const ticket = 'UM-WA-' + Date.now().toString().slice(-8)
  const payload = {
    ticket_no: ticket,
    complaint_no: ticket,
    customer_id: customer?.id || null,
    category: 'WhatsApp Service Request',
    service_type: 'Service',
    title: session.problem,
    description: session.problem,
    priority: session.priority || 'normal',
    status: 'open',
    location_text: session.location,
    address: session.location,
    customer_name: session.name,
    customer_phone: phone,
    company_name: session.company_name || null
  }
  const rows = await supabaseRestRequest('/complaints', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  })
  const complaint = Array.isArray(rows) ? rows[0] || null : null
  if (!complaint?.id) throw new Error('Complaint was not created')
  return { complaint, customer, ticket }
}

function clearComplaintSession(jid) {
  complaintSessions.delete(jid)
}

fs.mkdirSync(AUTH_DIR, { recursive: true })

async function acquireWhatsAppLease() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return true
  try {
    const result = await supabase.rpc('acquire_whatsapp_bot_lease', {
      p_holder_id: INSTANCE_ID,
      p_ttl_seconds: WHATSAPP_LEASE_TTL_SECONDS
    })
    if (result.error) throw result.error
    whatsappLeaseHeld = result.data === true
    if (!whatsappLeaseHeld) {
      console.log('WhatsApp singleton lease is held by another instance; this instance will not connect.')
      return false
    }
    console.log('WhatsApp singleton lease acquired:', INSTANCE_ID)
    clearInterval(whatsappLeaseRenewTimer)
    whatsappLeaseRenewTimer = setInterval(async () => {
      if (!whatsappLeaseHeld) return
      try {
        const renewed = await supabase.rpc('renew_whatsapp_bot_lease', {
          p_holder_id: INSTANCE_ID,
          p_ttl_seconds: WHATSAPP_LEASE_TTL_SECONDS
        })
        if (renewed.error) throw renewed.error
        if (renewed.data !== true) {
          whatsappLeaseHeld = false
          clearInterval(whatsappLeaseRenewTimer)
          console.error('WhatsApp singleton lease lost; closing socket to prevent a second session.')
          if (sock) {
            try { sock.end(new Error('WhatsApp singleton lease lost')) } catch {}
            sock = null
          }
        }
      } catch (err) {
        console.error('WhatsApp singleton lease renew failed:', String(err?.message || err))
      }
    }, WHATSAPP_LEASE_RENEW_MS)
    return true
  } catch (err) {
    console.error('WhatsApp singleton lease acquire failed:', String(err?.message || err))
    return false
  }
}

async function releaseWhatsAppLease() {
  clearInterval(whatsappLeaseRenewTimer)
  whatsappLeaseRenewTimer = null
  if (!whatsappLeaseHeld || !SUPABASE_SERVICE_ROLE_KEY) return
  try {
    await supabase.rpc('release_whatsapp_bot_lease', { p_holder_id: INSTANCE_ID })
    console.log('WhatsApp singleton lease released')
  } catch (err) {
    console.error('WhatsApp singleton lease release failed:', String(err?.message || err))  } finally {
    whatsappLeaseHeld = false
  }
}

async function restoreAuthFromSupabase() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return false
  try {
    const rows = await supabaseRestRequest('/whatsapp_auth_sessions?select=file_name,data&order=file_name.asc')
    if (!Array.isArray(rows) || !rows.length) return false
    for (const row of rows) {
      if (!row?.file_name || typeof row.data !== 'string') continue
      const safeName = path.basename(row.file_name)
      if (safeName !== row.file_name) continue
      fs.writeFileSync(path.join(AUTH_DIR, safeName), Buffer.from(row.data, 'base64'))
    }
    console.log(`WhatsApp auth restored from Supabase: ${rows.length} file(s)`)
    return true
  } catch (err) {
    console.error('WhatsApp auth restore failed:', String(err?.message || err))
    return false
  }
}

async function syncAuthToSupabase() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return
  if (authSyncInFlight) return authSyncInFlight
  authSyncInFlight = (async () => {
    const files = fs.readdirSync(AUTH_DIR, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
    if (!files.length) throw new Error('WhatsApp auth directory is empty; refusing to overwrite persisted auth')
    let synced = 0
    for (const fileName of files) {
      let data
      try {
        data = fs.readFileSync(path.join(AUTH_DIR, fileName)).toString('base64')
      } catch (err) {
        if (err?.code === 'ENOENT') {
          console.warn('WhatsApp auth file changed during sync; will retry:', fileName)
          continue
        }
        throw err
      }
      await supabaseRestRequest('/whatsapp_auth_sessions?on_conflict=file_name', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ file_name: fileName, data, updated_at: new Date().toISOString() })
      })
      synced += 1
    }
    if (synced > 0) console.log(`WhatsApp auth synced to Supabase: ${synced}/${files.length} file(s)`)
  })().catch(err => {
    console.error('WhatsApp auth sync failed:', String(err?.message || err))
    throw err
  }).finally(() => { authSyncInFlight = null })
  return authSyncInFlight
}

function scheduleAuthSync() {
  clearTimeout(authSyncTimer)
  authSyncTimer = setTimeout(() => syncAuthToSupabase().catch(() => {}), 1500)
}

function authorized(req) {
  return !WA_API_SECRET || req.get('x-wa-api-key') === WA_API_SECRET
}

function recipientJid(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  return `${digits}@s.whatsapp.net`
}

async function resolveWhatsAppJid(jid) {
  const inputJid = String(jid || '').trim()
  if (!inputJid || !inputJid.endsWith('@s.whatsapp.net')) throw new Error('Invalid WhatsApp recipient')
  try {
    const result = await sock.onWhatsApp(inputJid)
    const contact = Array.isArray(result) ? result[0] : null
    const resolvedJid = String(contact?.jid || inputJid).trim()
    console.log('WhatsApp recipient check:', JSON.stringify({
      requestedJid: inputJid,
      resolvedJid,
      exists: contact?.exists ?? null
    }))
    if (contact?.exists === false) throw new Error('WhatsApp number is not registered: ' + inputJid)
    return resolvedJid
  } catch (err) {
    console.error('WhatsApp recipient check failed:', String(err?.message || err))
    if (String(err?.message || '').startsWith('WhatsApp number is not registered:')) throw err
    return inputJid
  }
}

async function sendText(jid, message) {
  if (status !== 'connected' || !sock) throw new Error('WhatsApp is not connected')
  const normalizedJid = await resolveWhatsAppJid(jid)
  const result = await sock.sendMessage(normalizedJid, { text: message })
  console.log('WhatsApp text send result:', JSON.stringify({
    to: normalizedJid,
    messageId: result?.key?.id || null,
    fromMe: result?.key?.fromMe ?? null,
    status: result?.status ?? null
  }))
  if (result?.key?.id) trackedWhatsAppMessages.set(result.key.id, { jid: normalizedJid, status: 'queued', statusCode: result?.status ?? null, updatedAt: new Date().toISOString() })
  return result
}

function pdfEscape(value) {
  return String(value ?? '').replaceAll('\\\\', '\\\\\\\\').replaceAll('(', '\\\\(').replaceAll(')', '\\\\)').replaceAll('\n', ' ')
}

function buildComplaintPdfBuffer(complaint, customer) {
  const rows = [
    ['Complaint No', complaint?.complaint_no || complaint?.ticket_no || complaint?.id || ''],
    ['Problem / Issue', complaint?.title || complaint?.description || ''],
    ['Category', complaint?.category || ''],
    ['Priority', complaint?.priority || ''],
    ['Status', complaint?.status || ''],
    ['Customer', customer?.name || complaint?.customer_name || ''],
    ['Mobile', customer?.mobile || complaint?.customer_phone || ''],
    ['Company', customer?.company_name || complaint?.company_name || ''],
    ['Service Address', customer?.address || complaint?.location_text || ''],
    ['Created', formatWhatsAppTime(complaint?.created_at)]
  ]

  // Branded one-page PDF receipt. Uses built-in Helvetica fonts so the PDF
  // remains portable on WhatsApp and does not depend on external font files.
  const contentLines = [
    'q',
    '0.95 0.97 1 rg',
    '0 760 595 82 re f',
    'Q',
    'BT',
    '/F1 20 Tf',
    '50 807 Td',
    '(' + pdfEscape('UNIQUE MARKET') + ') Tj',
    '/F1 10 Tf',
    '0 -18 Td',
    '(' + pdfEscape('CCTV | IT Security | Service & AMC') + ') Tj',
    '/F1 9 Tf',
    '0 -16 Td',
    '(' + pdfEscape('Station Road, Hotel Rajdoot, Ichalkaranji') + ') Tj',
    '0 -14 Td',
    '(' + pdfEscape('Contact: 7350060071') + ') Tj',
    'ET',
    'BT',
    '/F1 16 Tf',
    '50 725 Td',
    '(' + pdfEscape('SERVICE COMPLAINT RECEIPT') + ') Tj',
    '/F1 9 Tf',
    '0 -16 Td',
    '(' + pdfEscape('Thank you for contacting Unique Market. Your service request is registered.') + ') Tj',
    'ET'
  ]

  let y = 675
  rows.forEach(([key, value]) => {
    contentLines.push(
      'BT',
      '/F1 10 Tf',
      '50 ' + y + ' Td',
      '(' + pdfEscape(key + ':') + ') Tj',
      '170 0 Td',
      '(' + pdfEscape(String(value || '-')) + ') Tj',
      'ET'
    )
    y -= 43
  })

  contentLines.push(
    'BT',
    '/F1 9 Tf',
    '50 118 Td',
    '(' + pdfEscape('For service updates, please keep this complaint number for reference.') + ') Tj',
    'ET',
    'q',
    '0.95 0.97 1 rg',
    '0 0 595 76 re f',
    'Q',
    'BT',
    '/F1 10 Tf',
    '50 50 Td',
    '(' + pdfEscape('Unique Market | CCTV | IT Security | Service & AMC') + ') Tj',
    '/F1 9 Tf',
    '0 -16 Td',
    '(' + pdfEscape('7350060071  |  Station Road, Hotel Rajdoot, Ichalkaranji') + ') Tj',
    'ET'
  )

  const stream = contentLines.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length ' + Buffer.byteLength(stream, 'utf8') + ' >>\nstream\n' + stream + '\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((obj, i) => {
    offsets[i + 1] = Buffer.byteLength(pdf, 'utf8')
    pdf += (i + 1) + ' 0 obj\n' + obj + '\nendobj\n'
  })
  const xref = Buffer.byteLength(pdf, 'utf8')
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n'
  for (let i = 1; i <= objects.length; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n'
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n'
  return Buffer.from(pdf, 'utf8')
}
async function getComplaintAndCustomer(complaintId) {
  if (!complaintId) return { complaint: null, customer: null }
  const params = new URLSearchParams({
    select: '*,customer:customers(name,mobile,company_name,address)',    id: 'eq.' + complaintId,
    limit: '1'
  })
  const rows = await supabaseRestRequest('/complaints?' + params.toString())
  const complaint = rows?.[0] || null
  return { complaint, customer: complaint?.customer || null }
}

async function sendDocument(jid, pdf, fileName, caption) {
  if (status !== 'connected' || !sock) throw new Error('WhatsApp is not connected')
  if (!Buffer.isBuffer(pdf) || pdf.length < 100 || pdf.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('Invalid PDF buffer')
  }
  const resolvedJid = await resolveWhatsAppJid(jid)
  console.log('WhatsApp PDF sending:', JSON.stringify({ requestedJid: jid, to: resolvedJid, fileName, bytes: pdf.length }))
  const result = await sock.sendMessage(resolvedJid, {
    document: pdf,
    mimetype: 'application/pdf',
    fileName,
    caption
  })
  console.log('WhatsApp PDF send result:', JSON.stringify({
    to: resolvedJid,
    messageId: result?.key?.id || null,
    fromMe: result?.key?.fromMe ?? null,
    status: result?.status ?? null,
    bytes: pdf.length
  }))
  if (result?.key?.id) {
    trackedWhatsAppMessages.set(result.key.id, {
      jid: resolvedJid,
      type: 'document',
      status: 'queued',
      statusCode: result?.status ?? null,
      updatedAt: new Date().toISOString()
    })
  }
  return result
}

async function getProfile(userId) {
  if (!userId) return null
  try {
    const params = new URLSearchParams({ select: 'full_name,phone', id: 'eq.' + userId, limit: '1' })
    const rows = await supabaseRestRequest('/profiles?' + params.toString())
    return rows?.[0] || null
  } catch (err) { console.error('WhatsApp profile lookup failed:', String(err?.message || err)); return null }
}

function formatWhatsAppTime(value) {
  if (!value) return 'Just now'
  try { return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value)) }
  catch { return String(value) }
}

function formatWhatsAppBranding(message) {
  const body = String(message || '').trim()
  const header = '🔷 *UNIQUE MARKET*\n_CCTV | IT Security | Service & AMC_'
  const footer = '━━━━━━━━━━━━━━\n📍 *Station Road, Hotel Rajdoot, Ichalkaranji*\n📞 *7350060071*\n_Thank you for choosing Unique Market._'
  const withHeader = body.includes('UNIQUE MARKET') ? body : header + '\n\n' + body
  return withHeader.replace(/(?:\n)?━━━━━━━━━━━━━━[\\s\\S]*$/m, '').trim() + '\n\n' + footer
}

function formatServiceStatus(value) {
  const raw = String(value || '').toLowerCase().replaceAll('_', ' ').trim()
  const map = { pending: '🟡 Pending', open: '🔵 Open', assigned: '🟣 Assigned', accepted: '🟠 Accepted', in_progress: '🟠 In Progress', completed: '🟢 Completed', closed: '✅ Closed', cancelled: '🔴 Cancelled', rejected: '🔴 Rejected' }
  return map[raw.replaceAll(' ', '_')] || ('🔵 ' + (raw ? raw.replace(/\b\w/g, m => m.toUpperCase()) : 'Updated'))
}

function buildWhatsAppNotification(event, complaint, customer, recipientProfile) {
  const ticket = complaint?.complaint_no || complaint?.ticket_no || complaint?.id || '—'
  const issue = complaint?.title || complaint?.description || 'Service Request'
  const name = customer?.name || complaint?.customer_name || 'Customer'
  const location = customer?.address || complaint?.location_text || complaint?.address || 'Not provided'
  const statusText = formatServiceStatus(complaint?.status)
  const receivedAt = formatWhatsAppTime(complaint?.created_at || event?.created_at)
  if (event.event_type === 'assigned') return [
    '🔔 *UNIQUE MARKET | NEW ASSIGNMENT*', '',
    'Hello ' + (recipientProfile?.full_name || 'Team Member') + ',',
    'A new service complaint has been assigned to you.', '',
    '🎫 *Ticket:* ' + ticket,
    '👤 *Customer:* ' + name,
    '📞 *Mobile:* ' + (customer?.mobile || complaint?.customer_phone || '—'),
    '🛠️ *Issue:* ' + issue,
    '📍 *Location:* ' + location,
    '⚡ *Priority:* ' + (complaint?.priority || 'Normal'), '',
    '👉 Please open the Service Portal and update the ticket.', '',
    '━━━━━━━━━━━━━━', '📍 *Station Road, Hotel Rajdoot, Ichalkaranji*', '📞 *7350060071*', '_Unique Market | CCTV • IT Security • Service & AMC_'
  ].join('\n')
  if (event.event_type === 'status_changed') return [
    '🔄 *UNIQUE MARKET | SERVICE UPDATE*', '',
    'Hello ' + name + ' 👋,',
    'Your service request has been updated.', '',
    '🎫 *Ticket:* ' + ticket,
    '🛠️ *Issue:* ' + issue,
    '📊 *Status:* ' + statusText,
    '📍 *Location:* ' + location, '',
    'We will keep you updated on the next service step.',
    'For assistance, reply here or call us.', '',
    '━━━━━━━━━━━━━━', '📍 *Station Road, Hotel Rajdoot, Ichalkaranji*', '📞 *7350060071*', '_Unique Market | CCTV • IT Security • Service & AMC_'
  ].join('\n')
  return [
    '✅ *UNIQUE MARKET | SERVICE REQUEST RECEIVED*', '',
    'Hello ' + name + ' 👋,',
    'Your complaint has been registered successfully.', '',
    '🎫 *Ticket:* ' + ticket,
    '🛠️ *Issue:* ' + issue,
    '📍 *Location:* ' + location,
    '⚡ *Priority:* ' + (complaint?.priority || 'Normal'),
    '📊 *Status:* ' + statusText,
    '🕐 *Received:* ' + receivedAt, '',
    'Our service team will contact you shortly.',
    'Please keep this Ticket ID for future reference.', '',
    '— *Unique Market*', 'CCTV • IT Security • Service & AMC', '📞 7350060071'
  ].join('\n')
}

async function sendNotificationEvent(jid, event) {
  const marker = String(event.message || '').match(/\n?\[\[PDF_URL=(https?:\/\/[^\]]+)\]\]\s*$/i)
  const pdfUrl = marker?.[1] || null
  if (status !== 'connected' || !sock) throw new Error('WhatsApp is not connected')
  let complaint = null, customer = null, recipientProfile = null
  if (event.complaint_id) {
    const resolved = await getComplaintAndCustomer(event.complaint_id)
    complaint = resolved.complaint; customer = resolved.customer
    if (!complaint) throw new Error('Complaint not found: ' + event.complaint_id)
  }
  if (event.recipient_user_id) recipientProfile = await getProfile(event.recipient_user_id)
  if (pdfUrl) {
    const response = await fetch(pdfUrl, { redirect: 'follow' })
    if (!response.ok) throw new Error('PDF URL download failed: HTTP ' + response.status)
    const pdf = Buffer.from(await response.arrayBuffer())
    await sendDocument(jid, pdf, 'Unique-Market-' + (event.event_type || 'Complaint') + '-' + (event.complaint_id || 'Receipt') + '.pdf', '📄 *Unique Market* | Complaint Receipt')
  } else if (complaint) {
    const pdf = buildComplaintPdfBuffer(complaint, customer)
    const ticket = complaint.complaint_no || complaint.ticket_no || complaint.id
    await sendDocument(jid, pdf, 'Unique-Market-' + ticket + '-Receipt.pdf', '📄 *Unique Market* | Complaint Receipt')
  }
  await sendText(jid, buildWhatsAppNotification(event, complaint, customer, recipientProfile))
}

function describeSupabaseError(error) {
  if (!error) return 'unknown Supabase error'
  return JSON.stringify({
    name: error.name || null,
    message: error.message || null,
    code: error.code || null,
    details: error.details || null,
    hint: error.hint || null,
    status: error.status || null,
    statusCode: error.statusCode || null
  })
}

async function supabaseRestRequest(pathname, options = {}) {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase service role key is not configured')
  const baseUrl = 'https://tfscvycomllamoubtlcf.supabase.co/rest/v1'
  const response = await fetch(baseUrl + pathname, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })
  const raw = await response.text()
  let body = null
  try { body = raw ? JSON.parse(raw) : null } catch {}
  if (!response.ok) {
    const detail = body ? JSON.stringify(body) : raw.slice(0, 500)
    throw new Error(`Supabase REST ${response.status}: ${detail}`)
  }
  return body
}

async function processNotificationEvents() {
  if (!SUPABASE_SERVICE_ROLE_KEY || status !== 'connected' || !sock) return
  if (eventProcessingInFlight) return eventProcessingInFlight
  eventProcessingInFlight = (async () => {
  try {
    const params = new URLSearchParams({
      select: 'id,complaint_id,recipient_user_id,phone,customer_phone,event_type,message,status,created_at',
      status: 'eq.pending',
      order: 'created_at.asc',
      limit: '10'
    })
    const data = await supabaseRestRequest(`/whatsapp_notification_events?${params.toString()}`)

    if (data?.length) console.log(`WhatsApp outbox: ${data.length} pending event(s)`)

    const seenEventGroups = new Set()
    for (const event of data || []) {
      const groupKey = String(event.complaint_id || '') + ':' + String(event.event_type || '')
      if (seenEventGroups.has(groupKey)) {
        console.log('WhatsApp duplicate pending event skipped:', JSON.stringify({ eventId: event.id, complaintId: event.complaint_id, eventType: event.event_type }))
        try {
          await supabaseRestRequest(`/whatsapp_notification_events?id=eq.${encodeURIComponent(event.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'failed', error_message: 'Duplicate event skipped; same complaint/event type already queued' }) })
        } catch (dupErr) { console.error('WhatsApp duplicate event cleanup failed:', String(dupErr?.message || dupErr)) }
        continue
      }
      seenEventGroups.add(groupKey)
      let customerPhone = event.customer_phone || ''
      if (!customerPhone && event.complaint_id) {
        try {
          const resolved = await getComplaintAndCustomer(event.complaint_id)
          customerPhone = resolved.complaint?.customer_phone || resolved.customer?.mobile || ''
        } catch (err) {          console.error('WhatsApp customer lookup failed:', String(err?.message || err))
        }
      }
      const targets = []
      const officeJid = recipientJid(PHONE_NUMBER)
      if (officeJid) targets.push(officeJid)
      const customerJid = recipientJid(customerPhone || event.phone)
      if (customerJid && !targets.includes(customerJid)) targets.push(customerJid)
      if (WA_GROUP_JID && !targets.includes(WA_GROUP_JID)) targets.push(WA_GROUP_JID)

      if (!targets.length) {
        await supabaseRestRequest(`/whatsapp_notification_events?id=eq.${encodeURIComponent(event.id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            status: 'failed',
            error_message: 'No valid WhatsApp recipient configured'
          })
        })
        continue
      }

      try {
        console.log(`WhatsApp outbox sending ${event.id} (${event.event_type}) to ${targets.join(', ')}`)
        for (const target of targets) await sendNotificationEvent(target, event)
        await supabaseRestRequest(`/whatsapp_notification_events?id=eq.${encodeURIComponent(event.id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            status: 'sent',
            sent_at: new Date().toISOString(),
            error_message: null
          })
        })
      } catch (err) {
        console.error(`WhatsApp outbox send failed for ${event.id}:`, String(err?.message || err))
        try {
          await supabaseRestRequest(`/whatsapp_notification_events?id=eq.${encodeURIComponent(event.id)}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              status: 'failed',
              error_message: String(err?.message || err)
            })
          })
        } catch (updateErr) {
          console.error('WhatsApp outbox failure update failed:', String(updateErr?.message || updateErr))
        }
      }
    }
  } catch (err) {
    console.error('WhatsApp outbox query failed:', String(err?.message || err))
    logger.error({ error: String(err?.message || err) }, 'notification event query failed')
  }  })().finally(() => { eventProcessingInFlight = null })
  return eventProcessingInFlight
}

function startEventPoller() {
  if (eventPollerStarted) return
  eventPollerStarted = true
  setInterval(() => processNotificationEvents().catch(err => logger.error({ err: describeSupabaseError(err) }, 'event poll failed')), EVENT_POLL_MS)
}

async function startWhatsApp() {
  if (reconnecting && status === 'resetting') return
  const leaseAcquired = await acquireWhatsAppLease()
  if (!leaseAcquired) {
    status = 'waiting_for_singleton'
    setTimeout(() => startWhatsApp().catch(err => console.error('WhatsApp singleton retry failed:', err)), 10000)
    return
  }
  await restoreAuthFromSupabase()
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  pairingReady = false
  pairingRequestInFlight = null
  const { version } = await fetchLatestWaWebVersion()
  console.log(`WhatsApp Web version: ${version.join('.')} `)
  sock = makeWASocket({
    version,
    logger,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    browser: Browsers.macOS('Chrome'),
    markOnlineOnConnect: true,
    syncFullHistory: false,
    connectTimeoutMs: 120000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    qrTimeout: 180000
  })
  let saveCredsPromise = Promise.resolve()
  sock.ev.on('creds.update', () => {
    console.log('WhatsApp credentials updated')
    saveCredsPromise = Promise.resolve()
      .then(() => saveCreds())
      .then(() => syncAuthToSupabase())
      .catch(err => {
        console.error('WhatsApp credential save/sync failed:', String(err?.message || err))
        throw err
      })
    return saveCredsPromise
  })
  // Incoming WhatsApp messages: route customers through the service menu and persist
  // completed service requests directly into the same complaints table used by the app.
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages || []) {
      if (msg.key?.fromMe) continue
      const remoteJid = String(msg.key?.remoteJid || '').trim()
      // WhatsApp may deliver 1:1 incoming messages with an @lid JID.
      // Prefer every PN source available on the message, then fall back to
      // Baileys' persistent LID -> PN mapping store.
      const senderPn = String(msg.key?.senderPn || msg.key?.senderPN || '').trim()
      const remoteJidAlt = String(msg.key?.remoteJidAlt || '').trim()
      const participantAlt = String(msg.key?.participantAlt || '').trim()
      let from = remoteJid.endsWith('@s.whatsapp.net')
        ? remoteJid
        : (senderPn.endsWith('@s.whatsapp.net')
          ? senderPn
          : (remoteJidAlt.endsWith('@s.whatsapp.net')
            ? remoteJidAlt
            : (participantAlt.endsWith('@s.whatsapp.net') ? participantAlt : '')))
      if (!from && remoteJid.endsWith('@lid') && sock?.signalRepository?.lidMapping?.getPNForLID) {
        try {
          const mappedPn = await sock.signalRepository.lidMapping.getPNForLID(remoteJid)
          if (mappedPn) from = String(mappedPn).trim()
        } catch (err) {
          console.error('WhatsApp LID -> PN lookup failed:', String(err?.message || err))
        }
      }
      // Keep the LID as a last-resort conversation key, but never use it as
      // the outgoing recipient because sendText requires a phone-number JID.
      const conversationKey = from || remoteJid
      const text = String(msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim()
      console.log('WhatsApp incoming message:', JSON.stringify({
        from: from || null,
        conversationKey,
        remoteJid,
        senderPn: senderPn || null,
        remoteJidAlt: remoteJidAlt || null,
        participantAlt: participantAlt || null,
        text,
        messageId: msg.key?.id || null
      }))
      if (!text || !conversationKey || remoteJid.endsWith('@g.us')) continue

      const normalized = text.toLowerCase()
      let reply = null
      const active = complaintSessions.get(conversationKey)

      if (/^(cancel|stop|0|menu|back)$/i.test(normalized)) {
        clearComplaintSession(conversationKey)
        reply = '🔷 *UNIQUE MARKET*\n_CCTV | IT Security | Service & AMC_\n\n1️⃣ Service / Complaint\n2️⃣ CCTV / Sales\n3️⃣ AMC Service\n4️⃣ Payment Query\n\nKrupaya *1, 2, 3 kiwa 4* pathva.'
      } else if (active) {
        if (active.step === 'problem') {
          active.problem = text
          active.step = 'name'
          reply = '🛠️ *Problem noted.*\n\nAta *Customer / Company Name* pathva.'
        } else if (active.step === 'name') {
          active.name = text
          active.step = 'location'
          reply = '📍 Ata *Service Location / Area / Address* pathva.'
        } else if (active.step === 'location') {
          active.location = text
          active.step = 'priority'
          reply = '⚡ Problem chi priority pathva:\n\n1️⃣ Urgent\n2️⃣ Normal\n3️⃣ Low'
        } else if (active.step === 'priority') {
          const priorityMap = { '1': 'urgent', '2': 'normal', '3': 'low', urgent: 'urgent', normal: 'normal', low: 'low' }
          active.priority = priorityMap[normalized] || 'normal'
          try {
            const result = await createWhatsAppComplaint(active, from)
            clearComplaintSession(from)
            reply = '✅ *SERVICE REQUEST REGISTERED*\n\n🎫 *Complaint No:* ' + result.ticket + '\n👤 *Customer:* ' + active.name + '\n📍 *Location:* ' + active.location + '\n🛠️ *Problem:* ' + active.problem + '\n⚡ *Priority:* ' + active.priority + '\n\nOur team will contact you shortly.\n\nType *menu* for Main Menu.'
          } catch (err) {
            console.error('WhatsApp complaint creation failed:', String(err?.message || err))
            reply = '⚠️ Complaint register kartana temporary problem ala. Krupaya thodya velane punha try kara kiwa *7350060071* var contact kara.'
          }
        }
      } else if (/^(hi+|hello+|hey+|namaskar|नमस्कार)$/i.test(normalized)) {
        reply = '🔷 *UNIQUE MARKET*\n_CCTV | IT Security | Service & AMC_\n\nNamaskar! Aaple swagat aahe.\n\n1️⃣ Service / Complaint\n2️⃣ CCTV / Sales\n3️⃣ AMC Service\n4️⃣ Payment Query\n\nKrupaya *1, 2, 3 kiwa 4* pathva.'
      } else if (normalized === '1') {
        complaintSessions.set(conversationKey, { step: 'problem', problem: '', name: '', location: '', priority: 'normal' })
        reply = '🛠️ *SERVICE COMPLAINT*\n\nTumchya CCTV/IT system madhla problem short madhe type kara.\n\nExample: *Camera band aahe* / *DVR recording nahi* / *CCTV mobile var nahi.*'
      } else if (normalized === '2') {
        reply = '📷 *CCTV / SALES*\n\nCamera quantity, brand, model kiwa requirement pathva.\n\nAmhi quotation sathi tumchi enquiry note karu.\n\nType *menu* for Main Menu.'
      } else if (normalized === '3') {
        reply = '🔧 *AMC SERVICE*\n\nAMC service sathi Customer/Company Name + Location pathva.\n\nAmhi tumhala pudhil process sangto.\n\nType *menu* for Main Menu.'
      } else if (normalized === '4') {
        reply = '💳 *PAYMENT QUERY*\n\nInvoice Number kiwa Customer/Company Name pathva.\n\nOur office team payment status check karel.\n\n📞 7350060071'
      } else {
        reply = 'Krupaya *Hi* pathva kiwa menu madhun option select kara.\n\n1️⃣ Service / Complaint\n2️⃣ CCTV / Sales\n3️⃣ AMC Service\n4️⃣ Payment Query'
      }

      if (reply) {
        reply = formatWhatsAppBranding(reply)
        try {
          await sendText(from, reply)
          console.log('WhatsApp auto-reply sent:', JSON.stringify({ to: from, text: reply }))
        } catch (err) {
          console.error('WhatsApp auto-reply failed:', String(err?.message || err))
        }
      }
    }
  })

  sock.ev.on('messages.update', (updates) => {
    for (const update of updates || []) {
      const id = update?.key?.id || null
      if (!id) continue
      const statusCode = update?.update?.status ?? null
      const statusName = ({ 1: 'server_ack', 2: 'delivered', 3: 'read', 4: 'played' })[statusCode] || String(statusCode)
      console.log('WhatsApp message status:', JSON.stringify({ messageId: id, to: update?.key?.remoteJid || null, status: statusName, statusCode }))
      trackedWhatsAppMessages.set(id, { jid: update?.key?.remoteJid || null, status: statusName, statusCode, updatedAt: new Date().toISOString() })
      if (trackedWhatsAppMessages.size > 500) trackedWhatsAppMessages.delete(trackedWhatsAppMessages.keys().next().value)
    }
  })
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    const disconnectCode = lastDisconnect ? new Boom(lastDisconnect?.error)?.output?.statusCode || null : null
    lastConnectionEvent = { connection: connection || null, hasQr: Boolean(qr), at: new Date().toISOString(), code: disconnectCode }
    console.log(`WhatsApp connection update: ${connection || 'none'} | qr=${Boolean(qr)} | code=${disconnectCode ?? 'none'}`)
    if (connection === 'connecting' || qr) {
      pairingReady = true
      if (qr) { lastQr = qr; status = 'pairing_required'; console.log('WhatsApp QR generated') }
    }
    if (connection === 'open') {
      status = 'connected'; lastQr = null; pairingCode = null; reconnecting = false
      syncAuthToSupabase().catch(err => console.error('WhatsApp auth sync after open failed:', String(err?.message || err)))
      startEventPoller()
      setTimeout(() => processNotificationEvents().catch(err => logger.error({ err: describeSupabaseError(err) }, 'initial event processing failed')), 500)
      console.log('WhatsApp connected')
    }
    if (connection === 'close') {
      status = 'disconnected'
      const code = disconnectCode
      const isLoggedOut = code === DisconnectReason.loggedOut
      const isRestartRequired = code === DisconnectReason.restartRequired
      console.error(`WhatsApp connection closed. code=${code ?? 'unknown'} loggedOut=${isLoggedOut} restartRequired=${isRestartRequired}`)

      // 515 is WhatsApp's normal post-pairing restart signal. Persist credentials
      // first, then schedule a fresh socket outside the close-event handler.
      if (!isLoggedOut && !reconnecting) {
        reconnecting = true
        Promise.resolve(saveCredsPromise)
          .catch(err => console.error('WhatsApp credential flush before reconnect failed:', String(err?.message || err)))
          .finally(async () => {
            try {
              await releaseWhatsAppLease()
            } catch (err) {
              console.error('WhatsApp lease release before reconnect failed:', String(err?.message || err))
            }
            setTimeout(() => {
              reconnecting = false
              startWhatsApp().catch(err => {
                console.error('WhatsApp reconnect failed:', String(err?.message || err))
                setTimeout(() => startWhatsApp().catch(retryErr => console.error('WhatsApp delayed reconnect failed:', String(retryErr?.message || retryErr))), 3000)
              })
            }, 1000)
          })
      } else {
        await releaseWhatsAppLease()
      }
    }  })
}

app.get('/debug', (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' })
  res.json({ ok: true, status, hasQr: Boolean(lastQr), pairingReady, socket: Boolean(sock), lastConnectionEvent, authFiles: fs.existsSync(AUTH_DIR) ? fs.readdirSync(AUTH_DIR).slice(0, 10) : [], eventBridge: Boolean(supabase) })
})
app.get('/health', (_req, res) => res.json({ ok: true, service: 'unique-market-whatsapp', status }))

const pairingPage = (_req, res) => {
  res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unique Market WhatsApp QR</title><style>body{font-family:system-ui;max-width:520px;margin:40px auto;padding:20px;text-align:center}input,button{width:100%;padding:12px;margin:8px 0;box-sizing:border-box}button{cursor:pointer}.qr{display:block;width:280px;height:280px;margin:18px auto}.hint{color:#555}</style></head><body><h2>Unique Market WhatsApp QR Pairing</h2><p>WhatsApp number: <b>+91 7350060071</b></p><input id="secret" type="password" placeholder="WA_API_SECRET" autocomplete="off"><button id="btn">Show QR Code</button><button id="reset" type="button">Reset & Generate Fresh QR</button><p id="out" class="hint">Enter WA_API_SECRET and tap Show QR Code.</p><img id="qr" class="qr" style="display:none" alt="WhatsApp QR code"><script>const secret=()=>document.getElementById('secret').value;const out=document.getElementById('out');const qr=document.getElementById('qr');async function refresh(){try{const dbg=await fetch('/debug',{headers:{'x-wa-api-key':secret()}}).then(x=>x.json()).catch(()=>null);if(dbg)out.textContent='Status: '+dbg.status+' | Socket: '+dbg.socket+' | QR: '+dbg.hasQr+' | Pairing ready: '+dbg.pairingReady;const r=await fetch('/qr',{headers:{'x-wa-api-key':secret()}});const d=await r.json();if(d.qrDataUrl){qr.src=d.qrDataUrl;qr.style.display='block';out.textContent='WhatsApp → Linked Devices → Link a device → Scan this QR code.'}else if(d.connected){qr.style.display='none';out.textContent='WhatsApp is connected.'}else{qr.style.display='none';out.textContent=d.message||'Waiting for QR...'}}catch(e){out.textContent=String(e)}}document.getElementById('btn').onclick=async()=>{out.textContent='Checking QR...';await refresh()};document.getElementById('reset').onclick=async()=>{out.textContent='Resetting WhatsApp session...';try{const r=await fetch('/reset',{method:'POST',headers:{'x-wa-api-key':secret()}});const d=await r.json();out.textContent=d.message||d.error||'Reset complete. Wait a few seconds.';setTimeout(refresh,4000)}catch(e){out.textContent=String(e)}};setInterval(refresh,3000);</script></body></html>`)
}
app.get('/', pairingPage)
app.get('/pair', pairingPage)
app.post('/reset', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' })
  try {
    // Force a clean re-link even when the current WhatsApp session is connected.
    // Block the close handler from auto-reconnecting while the old session is being removed.
    reconnecting = true
    status = 'resetting'
    await releaseWhatsAppLease()
    if (sock) { try { sock.end(new Error('Reset requested')) } catch {} sock = null }
    lastQr = null; pairingCode = null; pairingReady = false
    fs.rmSync(AUTH_DIR, { recursive: true, force: true })
    fs.mkdirSync(AUTH_DIR, { recursive: true })
    // Clear the persisted Baileys auth state too; otherwise startWhatsApp()
    // restores the same corrupt Signal session from Supabase after every reset.
    if (SUPABASE_SERVICE_ROLE_KEY) {
      await supabaseRestRequest('/whatsapp_auth_sessions?file_name=not.is.null', {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      })
    }
    await startWhatsApp()
    return res.json({ ok: true, message: 'WhatsApp local + Supabase session reset. Wait for a fresh QR and scan it once.' })
  }
  catch (err) { return res.status(500).json({ ok: false, error: 'WhatsApp reset failed', detail: String(err?.message || err) }) }
})
app.get('/qr', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' })
  if (status === 'connected') return res.json({ ok: true, connected: true, qrDataUrl: null })
  if (!lastQr) return res.json({ ok: true, connected: false, qrDataUrl: null, message: 'QR is not ready yet. Wait a few seconds and try again.' })
  try { const QRCode = await import('qrcode'); const qrDataUrl = await QRCode.default.toDataURL(lastQr, { width: 280, margin: 2 }); return res.json({ ok: true, connected: false, qrDataUrl }) }
  catch (err) { return res.status(500).json({ ok: false, error: 'QR generation failed', detail: String(err?.message || err) }) }
})
app.get('/status', (req, res) => { if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' }); res.json({ ok: true, status, connected: status === 'connected', pairingRequired: status === 'pairing_required', pairingCode: pairingCode || null, hasQr: Boolean(lastQr), phoneConfigured: Boolean(PHONE_NUMBER), eventBridge: Boolean(supabase) }) })
app.post('/pair', async (req, res) => { if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' }); if (!sock) return res.status(503).json({ ok: false, error: 'WhatsApp socket is not ready' }); if (status === 'connected') return res.json({ ok: true, status: 'connected' }); if (!PHONE_NUMBER) return res.status(400).json({ ok: false, error: 'WhatsApp phone number is not configured' }); try { const deadline = Date.now() + 5000; while (!pairingReady && Date.now() < deadline && sock) await new Promise(resolve => setTimeout(resolve, 250)); if (!pairingReady) return res.status(503).json({ ok: false, error: 'WhatsApp socket is still connecting. Wait 2 seconds and try again.' }); if (pairingRequestInFlight) pairingCode = await pairingRequestInFlight; else { pairingRequestInFlight = sock.requestPairingCode(PHONE_NUMBER); try { pairingCode = await pairingRequestInFlight } finally { pairingRequestInFlight = null } } res.json({ ok: true, status: 'pairing_required', pairingCode }) } catch (err) { console.error('Pairing code request failed:', err); res.status(500).json({ ok: false, error: 'Pairing code request failed', detail: String(err?.message || err) }) } })
app.post('/send', async (req, res) => { if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' }); const digits = String(req.body?.phone || req.body?.to || '').replace(/\D/g, ''); const text = String(req.body?.message || '').trim(); if (!digits || !text) return res.status(400).json({ ok: false, error: 'phone/to and message are required' }); const jid = recipientJid(digits); if (!jid) return res.status(403).json({ ok: false, error: 'This WhatsApp recipient is blocked' }); try { const result = await sendText(jid, text); res.json({ ok: true, messageId: result?.key?.id || null }) } catch (err) { res.status(500).json({ ok: false, error: String(err?.message || err) }) } })
app.listen(PORT, '0.0.0.0', () => { console.log(`Unique Market WhatsApp bot listening on port ${PORT}`); if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) console.warn('Supabase event bridge is not configured'); (async () => { try { if (String(process.env.WA_FORCE_CLEAN_RESET || '').toLowerCase() === 'true') { console.log('WA_FORCE_CLEAN_RESET enabled: clearing WhatsApp local + Supabase auth state before startup'); fs.rmSync(AUTH_DIR, { recursive: true, force: true }); fs.mkdirSync(AUTH_DIR, { recursive: true }); if (SUPABASE_SERVICE_ROLE_KEY) await supabaseRestRequest('/whatsapp_auth_sessions?file_name=not.is.null', { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); console.log('WA_FORCE_CLEAN_RESET completed'); } await startWhatsApp() } catch (err) { status = 'error'; console.error('WhatsApp startup failed', err) } })() })