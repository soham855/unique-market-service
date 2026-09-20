import 'dotenv/config'
import express from 'express'
import qrcodeTerminal from 'qrcode-terminal'
import { WechatyBuilder } from '@juzi/wechaty'
import { PuppetWhatsapp } from '@juzi/wechaty-puppet-whatsapp'

const app = express()
app.use(express.json({ limit: '256kb' }))

const PORT = Number(process.env.PORT || 8787)
const API_KEY = process.env.BOT_API_KEY
let bot
let ready = false

function auth(req, res, next) {
  if (!API_KEY || req.get('x-api-key') !== API_KEY) return res.status(401).json({ ok: false, error: 'Unauthorized' })
  next()
}

function normalizeNumber(value) {
  const digits = String(value || '').replace(/\\D/g, '')
  if (!digits) throw new Error('Invalid WhatsApp number')
  return digits
}

async function sendWhatsApp(phone, text) {
  if (!ready) throw new Error('WhatsApp bot is not logged in')
  const number = normalizeNumber(phone)
  const contact = await bot.Contact.find({ id: number + '@c.us' })
  if (!contact) throw new Error('WhatsApp contact not found')
  await contact.say(String(text))
  return { ok: true, phone: number }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'unique-market-whatsapp-bot', whatsappReady: ready })
})

app.post('/send', auth, async (req, res) => {
  try {
    const { phone, message } = req.body || {}
    if (!phone || !message) return res.status(400).json({ ok: false, error: 'phone and message are required' })
    res.json(await sendWhatsApp(phone, message))
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message })
  }
})

app.post('/notify', auth, async (req, res) => {
  try {
    const { event, customer, technician, admin, ticket } = req.body || {}
    const recipients = []
    if (admin) recipients.push({ phone: admin, role: 'Admin' })
    if (technician?.phone) recipients.push({ phone: technician.phone, role: 'Technician' })
    if (customer?.phone) recipients.push({ phone: customer.phone, role: 'Customer' })

    const lines = [
      '🔔 Unique Market Service',
      event ? 'Event: ' + event : '',
      ticket?.id ? 'Ticket: ' + ticket.id : '',
      customer?.name ? 'Customer: ' + customer.name : '',
      ticket?.issue ? 'Issue: ' + ticket.issue : '',
      technician?.name ? 'Technician: ' + technician.name : '',
      ticket?.status ? 'Status: ' + ticket.status : ''
    ].filter(Boolean)

    const message = lines.join('\\n')
    const results = []
    for (const recipient of recipients) {
      try {
        results.push({ ...recipient, ...(await sendWhatsApp(recipient.phone, message)) })
      } catch (error) {
        results.push({ ...recipient, ok: false, error: error.message })
      }
    }
    res.json({ ok: results.some(r => r.ok), results })
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message })
  }
})

const puppet = new PuppetWhatsapp()
bot = WechatyBuilder.build({ puppet })

bot
  .on('scan', (qrcode, status) => {
    console.log('WhatsApp login required. Scan this QR with the automation number.')
    console.log('Scan status:', status)
    qrcodeTerminal.generate(qrcode, { small: true })
  })
  .on('login', user => {
    ready = true
    console.log('WhatsApp logged in as:', user.name())
  })
  .on('logout', user => {
    ready = false
    console.log('WhatsApp logged out:', user?.name?.() || 'unknown')
  })
  .on('error', error => {
    ready = false
    console.error('Wechaty error:', error)
  })
  .on('message', async message => {
    try {
      if (message.self()) return
      const text = (await message.text()).trim().toLowerCase()
      if (text === 'ping') await message.say('Unique Market WhatsApp Bot is online ✅')
    } catch (error) {
      console.error('Message handler error:', error)
    }
  })

app.listen(PORT, () => console.log('Unique Market WhatsApp API listening on port ' + PORT))

bot.start().catch(error => {
  ready = false
  console.error('Failed to start Wechaty:', error)
})
