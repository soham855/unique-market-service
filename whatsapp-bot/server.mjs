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
import { createClient } from '@supabase/supabase-js'

const PORT = Number(process.env.PORT || 10000)
const AUTH_DIR = process.env.WA_AUTH_DIR || path.resolve('whatsapp-bot/auth_info')
const PHONE_NUMBER = String(process.env.WA_PHONE_NUMBER || '917350060071').replace(/\D/g, '')
const WA_API_SECRET = String(process.env.WA_API_SECRET || '')
const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://tfscvycomllamoubtlcf.supabase.co')
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
const WA_GROUP_JID = String(process.env.WA_GROUP_JID || '').trim()
const EVENT_POLL_MS = Number(process.env.WA_EVENT_POLL_MS || 5000)
const BLOCKED_PHONE = '918554887026'
const logger = pino({ level: process.env.WA_LOG_LEVEL || 'silent' })
const app = express()
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

async function processNotificationEvents() {
  if (!supabase || status !== 'connected' || !sock) return

  const { data, error } = await supabase
    .from('whatsapp_notification_events')
    .select('id, phone, customer_phone, event_type, message, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10)

  if (error) {
    const detail = describeSupabaseError(error)
    console.error('WhatsApp outbox query failed:', detail)
    logger.error({ error: detail }, 'notification event query failed')
    return
  }

  if (data?.length) console.log(`WhatsApp outbox: ${data.length} pending event(s)`)

  for (const event of data || []) {
    const targets = []
    const officeJid = recipientJid(PHONE_NUMBER)
    if (officeJid) targets.push(officeJid)
    const customerJid = recipientJid(event.customer_phone || event.phone)
    if (customerJid && !targets.includes(customerJid)) targets.push(customerJid)
    if (WA_GROUP_JID && !targets.includes(WA_GROUP_JID)) targets.push(WA_GROUP_JID)

    if (!targets.length) {
      await supabase.from('whatsapp_notification_events').update({
        status: 'failed',
        error_message: 'No WhatsApp recipient configured or recipient is blocked'
      }).eq('id', event.id)
      continue
    }

    try {
      console.log(`WhatsApp outbox sending ${event.id} (${event.event_type}) to ${targets.join(', ')}`)
      for (const target of targets) await sendText(target, event.message)
      const { error: updateError } = await supabase.from('whatsapp_notification_events').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        error_message: null
      }).eq('id', event.id)
      if (updateError) console.error('WhatsApp outbox status update failed:', describeSupabaseError(updateError))
    } catch (err) {
      console.error(`WhatsApp outbox send failed for ${event.id}:`, String(err?.message || err))
      const { error: updateError } = await supabase.from('whatsapp_notification_events').update({
        status: 'failed',
        error_message: String(err?.message || err)
      }).eq('id', event.id)
      if (updateError) console.error('WhatsApp outbox failure update failed:', describeSupabaseError(updateError))
    }
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
