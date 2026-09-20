import express from 'express'
import QRCode from 'qrcode'
import { WechatyBuilder } from '@juzi/wechaty'
import { PuppetWhatsapp } from '@juzi/wechaty-puppet-whatsapp'

const app = express()
app.use(express.json({ limit: '1mb' }))

const PORT = Number(process.env.PORT || 3000)
const API_KEY = process.env.WHATSAPP_API_KEY || ''
const BOT_NAME = process.env.WECHATY_NAME || 'unique-market-whatsapp'

let latestQr = null
let status = 'starting'
let bot = null

function authorized(req, res, next) {
  if (!API_KEY || req.header('x-api-key') !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

async function startBot() {
  const puppet = new PuppetWhatsapp()
  bot = WechatyBuilder.build({
    name: BOT_NAME,
    puppet,
  })

  bot.on('scan', async (qrcode) => {
    status = 'qr'
    latestQr = await QRCode.toDataURL(qrcode)
    console.log('WhatsApp QR is ready')
  })

  bot.on('login', (user) => {
    status = 'logged_in'
    latestQr = null
    console.log('WhatsApp logged in:', user?.name?.() || 'account')
  })

  bot.on('logout', (user) => {
    status = 'logged_out'
    console.log('WhatsApp logged out:', user?.name?.() || 'account')
  })

  bot.on('error', (error) => {
    status = 'error'
    console.error(error)
  })

  await bot.start()
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, status, service: 'unique-market-whatsapp' })
})

app.get('/status', authorized, (_req, res) => {
  res.json({ status, qrAvailable: Boolean(latestQr) })
})

app.get('/qr', authorized, (_req, res) => {
  if (!latestQr) return res.status(404).json({ error: 'QR not available', status })
  res.json({ status, qr: latestQr })
})

app.post('/send', authorized, async (req, res) => {
  try {
    const { to, text } = req.body || {}
    if (!to || !text) return res.status(400).json({ error: 'to and text are required' })
    if (status !== 'logged_in' || !bot) {
      return res.status(409).json({ error: 'WhatsApp is not logged in', status })
    }

    const contact = await bot.Contact.find({ id: String(to) })
    if (!contact) return res.status(404).json({ error: 'WhatsApp contact not found' })

    await contact.say(String(text))
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: error?.message || 'Send failed' })
  }
})

app.listen(PORT, () => {
  console.log(`Unique Market WhatsApp service listening on :${PORT}`)
  startBot().catch((error) => {
    status = 'error'
    console.error('Wechaty start failed:', error)
  })
})
