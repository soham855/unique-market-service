import express from 'express'
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  Browsers
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
const SUPABASE_URL = String(process.env.SUPABASE_URL || '')
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

const botStartedAt = new Date().toISOString()
let sock = null
let status = 'starting'
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

async function processNotificationEvents() {
  if (!supabase || status !== 'connected' || !sock) return

  const { data, error } = await supabase
    .from('whatsapp_notification_events')
    .select('id, phone, customer_phone, event_type, message, status, created_at')
    .eq('status', 'pending')
    .gt('created_at', botStartedAt)
    .order('created_at', { ascending: true })
    .limit(10)

  if (error) {
    logger.error({ error }, 'notification event query failed')
    return
  }

  for (const event of data || []) {
    const targets = []
    const jid = recipientJid(event.customer_phone || event.phone)
    if (jid) targets.push(jid)
    if (WA_GROUP_JID && !targets.includes(WA_GROUP_JID)) targets.push(WA_GROUP_JID)

    if (!targets.length) {
      await supabase.from('whatsapp_notification_events').update({
        status: 'failed',
        error_message: 'No WhatsApp recipient configured or recipient is blocked'
      }).eq('id', event.id)
      continue
    }

    try {
      for (const target of targets) await sendText(target, event.message)
      await supabase.from('whatsapp_notification_events').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        error_message: null
      }).eq('id', event.id)
    } catch (err) {
      await supabase.from('whatsapp_notification_events').update({
        status: 'failed',
        error_message: String(err?.message || err)
      }).eq('id', event.id)
    }
  }
}

function startEventPoller() {
  if (eventPollerStarted) return
  eventPollerStarted = true
  setInterval(() => processNotificationEvents().catch(err => logger.error({ err }, 'event poll failed')), EVENT_POLL_MS)
}

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  pairingReady = false
  pairingRequestInFlight = null

  sock = makeWASocket({
    version,
    logger,
    browser: Browsers.macOS('Chrome'),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    markOnlineOnConnect: false,
    syncFullHistory: false
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (connection === 'connecting' || qr) {
      pairingReady = true
      if (qr) {
        lastQr = qr
        status = 'pairing_required'
      }
    }

    if (connection === 'open') {
      status = 'connected'
      lastQr = null
      pairingCode = null
      reconnecting = false
      startEventPoller()
      console.log('WhatsApp connected')
    }

    if (connection === 'close') {
      status = 'disconnected'
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode
      if (code !== DisconnectReason.loggedOut && !reconnecting) {
        reconnecting = true
        setTimeout(() => startWhatsApp().catch(err => {
          console.error('WhatsApp reconnect failed', err)
          reconnecting = false
        }), 3000)
      }
    }
  })
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'unique-market-whatsapp', status }))

const pairingPage = (_req, res) => {
  res.type('html').send(`<!doctype html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unique Market WhatsApp Pairing</title>
<style>body{font-family:system-ui;max-width:520px;margin:40px auto;padding:20px}input,button{width:100%;padding:12px;margin:8px 0;box-sizing:border-box}button{cursor:pointer}.code{font-size:28px;font-weight:700;letter-spacing:3px}</style></head>
<body>
<h2>Unique Market WhatsApp Pairing</h2>
<p>WhatsApp number: <b>+91 7350060071</b></p>
<input id="secret" type="password" placeholder="WA_API_SECRET" autocomplete="off">
<button id="btn">Get pairing code</button>
<pre id="out"></pre>
<script>
document.getElementById('btn').onclick=async()=>{
  const out=document.getElementById('out'); out.textContent='Loading...';
  try{
    const r=await fetch('/pair',{method:'POST',headers:{'Content-Type':'application/json','x-wa-api-key':document.getElementById('secret').value},body:'{}'});
    const d=await r.json();
    out.innerHTML=d.pairingCode ? '<div class="code">'+d.pairingCode+'</div><p>WhatsApp → Linked Devices → Link with phone number instead</p>' : JSON.stringify(d,null,2);
  }catch(e){out.textContent=String(e)}
};
</script>
</body></html>`)
}

app.get('/', pairingPage)
app.get('/pair', pairingPage)

/* PAIRING_PAGE_ROUTES */
/* OLD_PAIRING_PAGE_BODY */

app.get('/status', (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' })
  res.json({
    ok: true, status, connected: status === 'connected',
    pairingRequired: status === 'pairing_required',
    pairingCode: pairingCode || null, hasQr: Boolean(lastQr),
    phoneConfigured: Boolean(PHONE_NUMBER), eventBridge: Boolean(supabase)
  })
})

app.post('/pair', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' })
  if (!sock) return res.status(503).json({ ok: false, error: 'WhatsApp socket is not ready' })
  if (status === 'connected') return res.json({ ok: true, status: 'connected' })
  if (!PHONE_NUMBER) return res.status(400).json({ ok: false, error: 'WhatsApp phone number is not configured' })

  try {
    const deadline = Date.now() + 15000
    while (!pairingReady && Date.now() < deadline && sock) {
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    if (!pairingReady) {
      return res.status(503).json({
        ok: false,
        error: 'WhatsApp socket is still connecting. Wait 2 seconds and try again.'
      })
    }

    if (pairingRequestInFlight) {
      pairingCode = await pairingRequestInFlight
    } else {
      pairingRequestInFlight = sock.requestPairingCode(PHONE_NUMBER)
      try {
        pairingCode = await pairingRequestInFlight
      } finally {
        pairingRequestInFlight = null
      }
    }

    res.json({ ok: true, status: 'pairing_required', pairingCode })
  } catch (err) {
    console.error('Pairing code request failed:', err)
    const message = String(err?.message || err)
    res.status(500).json({
      ok: false,
      error: 'Pairing code request failed',
      detail: message
    })
  }
})

app.post('/send', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' })
  const digits = String(req.body?.phone || '').replace(/\D/g, '')
  const text = String(req.body?.message || '').trim()
  if (!digits || !text) return res.status(400).json({ ok: false, error: 'phone and message are required' })
  const jid = recipientJid(digits)
  if (!jid) return res.status(403).json({ ok: false, error: 'This WhatsApp recipient is blocked' })
  try {
    const result = await sendText(jid, text)
    res.json({ ok: true, messageId: result?.key?.id || null })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) })
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Unique Market WhatsApp bot listening on port ${PORT}`)
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) console.warn('Supabase event bridge is not configured')
  startWhatsApp().catch(err => { status = 'error'; console.error('WhatsApp startup failed', err) })
})
