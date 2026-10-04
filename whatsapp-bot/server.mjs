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
const BLOCKED_PHONE = '918554887026'
const logger = pino({ level: process.env.WA_LOG_LEVEL || 'silent' })
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
let pairingReady = false
let pairingRequestInFlight = null

// Simple in-memory WhatsApp complaint flow.
const complaintSessions = new Map()

function clearComplaintSession(jid) {
  complaintSessions.delete(jid)
}

fs.mkdirSync(AUTH_DIR, { recursive: true })

function authorized(req) {
  return !WA_API_SECRET || req.get('x-wa-api-key') === WA_API_SECRET
}

function recipientJid(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits || digits === BLOCKED_PHONE) return null
  return `${digits}@s.whatsapp.net`
}

async function sendText(jid, message) {
  if (status !== 'connected' || !sock) throw new Error('WhatsApp is not connected')
  return sock.sendMessage(jid, { text: message })
}

function pdfEscape(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\\(/g, '\\\\(').replace(/\\)/g, '\\\\)').replace(/\r?\n/g, ' ')
}

function buildComplaintPdfBuffer(complaint, customer) {
  const rows = [
    ['Complaint No', complaint?.complaint_no || complaint?.ticket_no || complaint?.id || ''],
    ['Problem', complaint?.title || complaint?.description || ''],
    ['Category', complaint?.category || ''],
    ['Priority', complaint?.priority || ''],
    ['Status', complaint?.status || ''],
    ['Customer', customer?.name || complaint?.customer_name || ''],
    ['Mobile', customer?.mobile || complaint?.customer_phone || ''],
    ['Company', customer?.company_name || complaint?.company_name || ''],
    ['Service Address', customer?.address || complaint?.location_text || ''],
    ['Created', complaint?.created_at || '']
  ]
  const lines = ['Unique Market - Complaint Receipt', '', ...rows.map(([k,v]) => k + ': ' + v)]
  const contentLines = ['BT', '/F1 16 Tf', '50 800 Td']
  lines.forEach((line, index) => {
    if (index === 1) contentLines.push('0 -28 Td')
    else if (index > 1) contentLines.push('0 -20 Td')
    contentLines.push('(' + pdfEscape(line) + ') Tj')
  })
  contentLines.push('ET')
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
    select: '*,customer:customers(name,mobile,company_name,address)',
    id: 'eq.' + complaintId,
    limit: '1'
  })
  const rows = await supabaseRestRequest('/complaints?' + params.toString())
  const complaint = rows?.[0] || null
  return { complaint, customer: complaint?.customer || null }
}

async function sendNotificationEvent(jid, event) {
  const marker = String(event.message || '').match(/\n?\[\[PDF_URL=(https?:\/\/[^\]]+)\]\]\s*$/i)
  const pdfUrl = marker?.[1] || null
  const text = String(event.message || '').replace(/\n?\[\[PDF_URL=https?:\/\/[^\]]+\]\]\s*$/i, '').trim()
  if (text) await sendText(jid, text)
  if (status !== 'connected' || !sock) throw new Error('WhatsApp is not connected')
  if (pdfUrl) {
    await sock.sendMessage(jid, {
      document: { url: pdfUrl },
      mimetype: 'application/pdf',
      fileName: 'Unique-Market-' + (event.event_type || 'Complaint') + '-' + (event.complaint_id || 'Receipt') + '.pdf',
      caption: '📄 Unique Market Complaint Receipt'
    })
  } else if (event.complaint_id) {
    const { complaint, customer } = await getComplaintAndCustomer(event.complaint_id)
    if (!complaint) throw new Error('Complaint not found for PDF: ' + event.complaint_id)
    const pdf = buildComplaintPdfBuffer(complaint, customer)
    const ticket = complaint.complaint_no || complaint.ticket_no || complaint.id
    await sock.sendMessage(jid, {
      document: pdf,
      mimetype: 'application/pdf',
      fileName: 'Unique-Market-' + ticket + '-Receipt.pdf',
      caption: '📄 Unique Market Complaint Receipt'
    })
  }
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

  try {
    const params = new URLSearchParams({
      select: 'id,phone,customer_phone,event_type,message,status,created_at',
      status: 'eq.pending',
      order: 'created_at.asc',
      limit: '10'
    })
    const data = await supabaseRestRequest(`/whatsapp_notification_events?${params.toString()}`)

    if (data?.length) console.log(`WhatsApp outbox: ${data.length} pending event(s)`)

    for (const event of data || []) {
      let customerPhone = event.customer_phone || ''
      if (!customerPhone && event.complaint_id) {
        try {
          const resolved = await getComplaintAndCustomer(event.complaint_id)
          customerPhone = resolved.customer?.mobile || resolved.complaint?.customer_phone || ''
        } catch (err) {
          console.error('WhatsApp customer lookup failed:', String(err?.message || err))
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
            error_message: 'No WhatsApp recipient configured or recipient is blocked'
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
  }
}

function startEventPoller() {
  if (eventPollerStarted) return
  eventPollerStarted = true
  setInterval(() => processNotificationEvents().catch(err => logger.error({ err: describeSupabaseError(err) }, 'event poll failed')), EVENT_POLL_MS)
}

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  pairingReady = false
  pairingRequestInFlight = null
  const { version } = await fetchLatestWaWebVersion()
  console.log(`WhatsApp Web version: ${version.join('.')} `)
  sock = makeWASocket({
    version,
    logger,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    connectTimeoutMs: 120000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    qrTimeout: 180000
  })
  let saveCredsPromise = Promise.resolve()
  sock.ev.on('creds.update', () => {
    console.log('WhatsApp credentials updated')
    saveCredsPromise = Promise.resolve(saveCreds()).catch(err => console.error('WhatsApp credential save failed:', err))
    return saveCredsPromise
  })
  // Incoming WhatsApp messages: log them so the bot can verify and route received chats.
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages || []) {
      if (msg.key?.fromMe) continue
      const from = msg.key?.remoteJid || ''
      const text = String(msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim()
      console.log('WhatsApp incoming message:', JSON.stringify({ from, text, messageId: msg.key?.id || null }))
      if (!text || !from || from.endsWith('@g.us')) continue
      const normalized = text.toLowerCase()
      let reply = null
      const activeComplaint = complaintSessions.get(from)

      if (/^(cancel|stop|0|menu|back)$/i.test(normalized)) {
        clearComplaintSession(from)
        reply = 'Main menu:\\n\\n1️⃣ Service / Complaint\\n2️⃣ Sales / CCTV\\n3️⃣ AMC\\n4️⃣ Payment\\n\\nKrupaya 1, 2, 3 kiwa 4 pathva.'
      } else if (activeComplaint) {
        if (activeComplaint.step === 'problem') {
          activeComplaint.problem = text
          activeComplaint.step = 'name'
          reply = 'Problem noted. Ata customer/company name pathva.'
        } else if (activeComplaint.step === 'name') {
          activeComplaint.name = text
          activeComplaint.step = 'location'
          reply = 'Thanks. Ata service location / area pathva.'
        } else if (activeComplaint.step === 'location') {
          activeComplaint.location = text
          const ticketRef = `WA-${Date.now().toString().slice(-6)}`
          const officeJid = recipientJid(PHONE_NUMBER)
          const summary = [
            '🚨 *New WhatsApp Service Complaint*',
            '',
            `Ticket: ${ticketRef}`,
            `Customer: ${activeComplaint.name}`,
            `Phone: +${from.replace('@s.whatsapp.net', '')}`,
            `Location: ${activeComplaint.location}`,
            `Problem: ${activeComplaint.problem}`
          ].join('\\n')

          if (officeJid && officeJid !== from) {
            try {
              await sendText(officeJid, summary)
              console.log('WhatsApp complaint forwarded to office:', ticketRef)
            } catch (err) {
              console.error('WhatsApp complaint office forward failed:', String(err?.message || err))
            }
          }

          clearComplaintSession(from)
          reply = `✅ Complaint received.\\n\\nTicket ID: ${ticketRef}\\nOur team will contact you shortly.\\n\\nFor another request, type *menu*.`
        }
      } else if (/^(hi+|hello+|hey+|namaskar|नमस्कार)$/i.test(normalized)) {
        reply = 'Namaskar! *Unique Market WhatsApp Service* madhe aaple swagat aahe.\\n\\n1️⃣ Service / Complaint\\n2️⃣ Sales / CCTV\\n3️⃣ AMC\\n4️⃣ Payment\\n\\nKrupaya 1, 2, 3 kiwa 4 pathva.'
      } else if (normalized === '1') {
        complaintSessions.set(from, { step: 'problem', problem: '', name: '', location: '' })
        reply = '🛠️ *Service Complaint*\\n\\nTumchya CCTV/IT system madhla problem short madhe type kara.\\n\\nUdaharan: *Camera band aahe* / *DVR recording nahi* / *CCTV mobile var nahi.*'
      } else if (normalized === '2') {
        reply = '📷 *CCTV / Sales*\\n\\nProduct name, camera quantity kiwa requirement pathva. Amhi tumhala quotation sathi guide karu.'
      } else if (normalized === '3') {
        reply = '🔧 *AMC Service*\\n\\nCustomer/company name ani location pathva. Amhi AMC details share karu.'
      } else if (normalized === '4') {
        reply = '💳 *Payment Query*\\n\\nInvoice number kiwa customer/company name pathva.'
      } else {
        reply = 'Krupaya *Hi* pathva menu sathi.\\n\\n1️⃣ Service / Complaint\\n2️⃣ Sales / CCTV\\n3️⃣ AMC\\n4️⃣ Payment'
      }
      if (reply) {
        try { await sendText(from, reply); console.log('WhatsApp auto-reply sent:', JSON.stringify({ to: from, text: reply })) }
        catch (err) { console.error('WhatsApp auto-reply failed:', String(err?.message || err)) }
      }
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
      startEventPoller()
      setTimeout(() => processNotificationEvents().catch(err => logger.error({ err: describeSupabaseError(err) }, 'initial event processing failed')), 500)
      console.log('WhatsApp connected')
    }
    if (connection === 'close') {
      status = 'disconnected'
      const code = disconnectCode
      console.error(`WhatsApp connection closed. code=${code ?? 'unknown'} loggedOut=${code === DisconnectReason.loggedOut}`)
      if (code !== DisconnectReason.loggedOut && !reconnecting) {
        reconnecting = true
        try { await saveCredsPromise; await startWhatsApp() }
        catch (err) { console.error('WhatsApp reconnect failed', err); reconnecting = false; setTimeout(() => startWhatsApp().catch(() => { reconnecting = false }), 3000) }
      }
    }
  })
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
  if (status === 'connected') return res.status(409).json({ ok: false, error: 'WhatsApp is already connected' })
  try { if (sock) { try { sock.end(new Error('Reset requested')) } catch {} sock = null }; lastQr = null; pairingCode = null; pairingReady = false; reconnecting = false; fs.rmSync(AUTH_DIR, { recursive: true, force: true }); fs.mkdirSync(AUTH_DIR, { recursive: true }); await startWhatsApp(); return res.json({ ok: true, message: 'WhatsApp session reset. Wait a few seconds and request a new QR.' }) }
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
app.listen(PORT, '0.0.0.0', () => { console.log(`Unique Market WhatsApp bot listening on port ${PORT}`); if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) console.warn('Supabase event bridge is not configured'); startWhatsApp().catch(err => { status = 'error'; console.error('WhatsApp startup failed', err) }) })
