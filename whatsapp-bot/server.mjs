import express from 'express'
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import fs from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.PORT || 10000)
const AUTH_DIR = process.env.WA_AUTH_DIR || path.resolve('whatsapp-bot/auth_info')
const PHONE_NUMBER = String(process.env.WA_PHONE_NUMBER || '').replace(/\\D/g, '')
const logger = pino({ level: process.env.WA_LOG_LEVEL || 'silent' })
const app = express()
app.use(express.json({ limit: '256kb' }))

let sock = null
let status = 'starting'
let lastQr = null
let pairingCode = null
let reconnecting = false

fs.mkdirSync(AUTH_DIR, { recursive: true })

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    markOnlineOnConnect: false,
    syncFullHistory: false
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      lastQr = qr
      status = 'pairing_required'

      if (PHONE_NUMBER && !sock.authState?.creds?.registered && !pairingCode) {
        try {
          pairingCode = await sock.requestPairingCode(PHONE_NUMBER)
        } catch (err) {
          logger.error({ err }, 'pairing code request failed')
        }
      }
    }

    if (connection === 'open') {
      status = 'connected'
      lastQr = null
      pairingCode = null
      reconnecting = false
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

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'unique-market-whatsapp', status })
})

app.get('/status', (_req, res) => {
  res.json({
    ok: true,
    status,
    connected: status === 'connected',
    pairingRequired: status === 'pairing_required',
    pairingCode: pairingCode || null,
    hasQr: Boolean(lastQr),
    phoneConfigured: Boolean(PHONE_NUMBER)
  })
})

app.post('/pair', async (_req, res) => {
  if (!sock) return res.status(503).json({ ok: false, error: 'WhatsApp socket is not ready' })
  if (status === 'connected') return res.json({ ok: true, status: 'connected' })
  if (!PHONE_NUMBER) {
    return res.status(400).json({
      ok: false,
      error: 'Set WA_PHONE_NUMBER in Render environment variables, digits only with country code'
    })
  }

  try {
    pairingCode = await sock.requestPairingCode(PHONE_NUMBER)
    res.json({ ok: true, status: 'pairing_required', pairingCode })
  } catch (err) {
    console.error('Pairing failed', err)
    res.status(500).json({ ok: false, error: 'Pairing code request failed' })
  }
})

app.post('/send', async (req, res) => {
  const { phone, message } = req.body || {}
  const digits = String(phone || '').replace(/\\D/g, '')
  const text = String(message || '').trim()

  if (status !== 'connected' || !sock) {
    return res.status(503).json({ ok: false, error: 'WhatsApp is not connected' })
  }
  if (!digits || !text) {
    return res.status(400).json({ ok: false, error: 'phone and message are required' })
  }

  try {
    const result = await sock.sendMessage(`${digits}@s.whatsapp.net`, { text })
    res.json({ ok: true, messageId: result?.key?.id || null })
  } catch (err) {
    console.error('WhatsApp send failed', err)
    res.status(500).json({ ok: false, error: 'Message send failed' })
  }
})

app.listen(PORT, () => {
  console.log(`Unique Market WhatsApp bot listening on port ${PORT}`)
  startWhatsApp().catch(err => {
    status = 'error'
    console.error('WhatsApp startup failed', err)
  })
})
