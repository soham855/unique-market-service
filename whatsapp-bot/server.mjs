import express from 'express'
import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  fetchLatestWaWebVersion,
  Browsers,
  downloadMediaMessage,
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
const STAFF_PHONE_NUMBER = String(process.env.STAFF_WHATSAPP_NUMBER || '917350060071').replace(/\D/g, '')
const GOOGLE_API_KEY = String(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim()
const GEMINI_TRANSCRIBE_MODEL = String(process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-2.5-flash').trim()
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

app.get('/quote-form', (req, res) => {
  const phone = String(req.query.phone || '').replace(/\D/g, '').slice(0, 15)
  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unique Market — Instant CCTV Quote</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033}.wrap{max-width:620px;margin:auto;padding:18px}.card{background:#fff;border-radius:20px;padding:22px;box-shadow:0 8px 30px #00000012}h1{margin:0 0 5px;font-size:24px}.sub{color:#667085;margin-bottom:20px;font-size:14px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:520px){.grid{grid-template-columns:1fr}}label{font-size:13px;font-weight:700;display:block;margin:12px 0 6px}input,select{width:100%;padding:13px;border:1px solid #d8dee9;border-radius:11px;font-size:15px;background:#fff}.full{grid-column:1/-1}button{width:100%;margin-top:20px;padding:15px;border:0;border-radius:12px;background:#111827;color:#fff;font-size:16px;font-weight:700}.note{font-size:12px;color:#667085;margin-top:14px;line-height:1.5}.ok{display:none;text-align:center;padding:25px}.err{color:#b42318;margin-top:10px;font-size:13px}</style></head><body><div class="wrap"><div class="card"><h1>🔷 UNIQUE MARKET</h1><div class="sub">Instant CCTV Quote Requirement</div><form id="f"><div class="grid">
<div><label>Customer Name *</label><input name="name" required></div><div><label>Mobile *</label><input name="phone" inputmode="tel" value="${phone}" required></div>
<div class="full"><label>Company Name</label><input name="company_name"></div>
<div><label>2MP IP Dome Qty *</label><input name="dome_2mp_qty" type="number" min="0" value="0" required></div><div><label>2MP IP Bullet Qty *</label><input name="bullet_2mp_qty" type="number" min="0" value="0" required></div>
<div><label>NVR / DVR Channel *</label><select name="nvr_channel" required><option value="">Select</option><option>4CH</option><option>8CH</option><option>16CH</option><option>32CH</option><option>64CH</option></select></div>
<div><label>HDD *</label><select name="hdd" required><option value="">Select</option><option>500GB</option><option>1TB</option><option>2TB</option><option>4TB</option><option>6TB</option><option>8TB</option></select></div>
<div><label>Power Supply *</label><select name="power_supply" required><option value="">Select</option><option>4CH</option><option>8CH</option><option>16CH</option><option>32CH</option></select></div>
<div><label>Cat6 90m Bundles *</label><input name="cable_90m_bundles" type="number" min="0" value="0" required></div>
<div><label>Remote View *</label><select name="router" required><option value="">Select</option><option>4G Router x1</option><option>5G Router x1</option><option>No Router</option></select></div>
<div class="full"><label>Site Location / Address *</label><input name="location" required placeholder="Installation location"></div>
</div><button type="submit">Submit Quote Request</button><div id="err" class="err"></div><div class="note">Your requirement will be received by Unique Market. Final pricing will be shared after requirement verification.</div></form><div id="ok" class="ok"><h2>✅ Requirement Submitted</h2><p>Your CCTV quote request has been received.</p><p><b>Unique Market</b><br>📞 7350060071</p></div></div></div>
<script>const f=document.getElementById('f'),e=document.getElementById('err'),ok=document.getElementById('ok');f.addEventListener('submit',async(ev)=>{ev.preventDefault();e.textContent='';const b=Object.fromEntries(new FormData(f).entries());if(Number(b.dome_2mp_qty||0)+Number(b.bullet_2mp_qty||0)<1){e.textContent='Please select at least 1 camera.';return}const btn=f.querySelector('button');btn.disabled=true;btn.textContent='Submitting...';try{const r=await fetch('/api/quote-submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});const j=await r.json();if(!r.ok)throw new Error(j.error||'Submit failed');f.style.display='none';ok.style.display='block'}catch(x){e.textContent=x.message;btn.disabled=false;btn.textContent='Submit Quote Request'}});</script></body></html>`)
})
app.post('/api/quote-submit', async (req, res) => {
  try {
    const b=req.body||{}, phone=String(b.phone||'').replace(/\D/g,''), name=String(b.name||'').trim(), location=String(b.location||'').trim()
    const dome=Number(b.dome_2mp_qty||0), bullet=Number(b.bullet_2mp_qty||0)
    if(!phone||phone.length<10||!name||!location||dome<0||bullet<0||dome+bullet<1) return res.status(400).json({ok:false,error:'Please enter valid required details.'})
    const session={name,company_name:String(b.company_name||'').trim(),location,dome_2mp_qty:dome,bullet_2mp_qty:bullet,nvr_channel:String(b.nvr_channel||'').trim(),hdd:String(b.hdd||'').trim(),power_supply:String(b.power_supply||'').trim(),cable_90m_bundles:Number(b.cable_90m_bundles||0),router:String(b.router||'').trim()}
    const lead=await createWhatsAppQuoteLead(session,phone)
    res.json({ok:true,lead_id:String(lead.id).slice(0,8)})
  } catch(err) { console.error('Quote form submit failed:',String(err?.message||err)); res.status(500).json({ok:false,error:'Quote submit failed. Please contact 7350060071.'}) }
})


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
const quoteSessions = new Map()
const serviceEnquirySessions = new Map()

// Isolated WhatsApp broadcast module. It uses its own Supabase table and
// in-memory campaign session so existing complaint/quote flows remain untouched.
const broadcastSessions = new Map()
let broadcastRunning = false
const BROADCAST_MAX_RECIPIENTS = 500
const BROADCAST_MAX_MEDIA_BYTES = 12 * 1024 * 1024
const BROADCAST_DELAY_MS = 2200

function normalizeBroadcastPhone(value) {
  let digits = String(value || '').replace(/\\D/g, '')
  if (digits.length === 10) digits = '91' + digits
  if (digits.startsWith('0') && digits.length === 11) digits = '91' + digits.slice(1)
  return digits
}

function isBroadcastControlChat(msg, remoteJid) {
  if (!msg?.key?.fromMe) return false
  const ownPn = PHONE_NUMBER + '@s.whatsapp.net'
  const ownId = String(sock?.user?.id || '')
  const ownUser = ownId ? ownId.split(':')[0] + '@s.whatsapp.net' : ''
  const ownLid = String(sock?.user?.lid || '')
  const alt = String(msg.key?.remoteJidAlt || '')
  return [remoteJid, alt].some(v => v && (v === ownPn || v === ownUser || v === ownLid))
}

async function upsertBroadcastContact(phone, name = '', tags = [], optIn = false) {
  if (!supabase) throw new Error('Supabase is not configured')
  const normalized = normalizeBroadcastPhone(phone)
  if (normalized.length < 12) throw new Error('Invalid WhatsApp number')
  const cleanTags = [...new Set((Array.isArray(tags) ? tags : []).map(v => String(v || '').trim().toLowerCase()).filter(Boolean))]
  const payload = {
    phone: normalized,
    name: String(name || '').trim() || null,
    tags: cleanTags,
    marketing_opt_in: Boolean(optIn),
    active: true,
    ...(optIn ? { opted_in_at: new Date().toISOString(), opted_out_at: null } : {})
  }
  const rows = await supabaseRestRequest('/whatsapp_broadcast_contacts?on_conflict=phone', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(payload)
  })
  return Array.isArray(rows) ? rows[0] || null : null
}

async function setBroadcastOptIn(phone, optIn, name = '', tags = []) {
  if (!supabase) throw new Error('Supabase is not configured')
  const normalized = normalizeBroadcastPhone(phone)
  if (normalized.length < 12) throw new Error('Invalid WhatsApp number')
  const payload = {
    phone: normalized,
    name: String(name || '').trim() || null,
    tags: [...new Set(tags.map(v => String(v || '').trim().toLowerCase()).filter(Boolean))],
    marketing_opt_in: Boolean(optIn),
    active: Boolean(optIn),
    opted_in_at: optIn ? new Date().toISOString() : null,
    opted_out_at: optIn ? null : new Date().toISOString()
  }
  const rows = await supabaseRestRequest('/whatsapp_broadcast_contacts?on_conflict=phone', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(payload)
  })
  return Array.isArray(rows) ? rows[0] || null : null
}

async function getBroadcastRecipients(target) {
  if (!supabase) throw new Error('Supabase is not configured')
  const rows = await supabaseRestRequest('/whatsapp_broadcast_contacts?select=phone,name,tags&marketing_opt_in=eq.true&active=eq.true&limit=5000')
  const contacts = Array.isArray(rows) ? rows : []
  if (target?.type === 'selected') {
    const wanted = new Set((target.numbers || []).map(normalizeBroadcastPhone))
    return contacts.filter(c => wanted.has(normalizeBroadcastPhone(c.phone)))
  }
  if (target?.type === 'tag') {
    const tag = String(target.tag || '').toLowerCase()
    return contacts.filter(c => Array.isArray(c.tags) && c.tags.map(v => String(v).toLowerCase()).includes(tag))
  }
  return contacts
}

async function sendBroadcastContent(jid, campaign) {
  const to = resolveWhatsAppJid(jid)
  if (campaign.mediaType === 'image') {
    return sock.sendMessage(to, { image: campaign.media, caption: campaign.text || undefined })
  }
  if (campaign.mediaType === 'video') {
    return sock.sendMessage(to, { video: campaign.media, caption: campaign.text || undefined })
  }
  if (campaign.mediaType === 'document') {
    return sock.sendMessage(to, { document: campaign.media, mimetype: campaign.mimetype || 'application/octet-stream', fileName: campaign.fileName || 'Unique-Market.pdf', caption: campaign.text || undefined })
  }
  return sock.sendMessage(to, { text: campaign.text })
}

function broadcastHelp() {
  return '📢 *UNIQUE MARKET | BROADCAST*\\n\\n1️⃣ All opted-in\\n2️⃣ CCTV customers\\n3️⃣ IT customers\\n4️⃣ Dealers\\n5️⃣ Selected numbers\\n\\nOnly customers who have explicitly opted in will receive marketing messages.\\n\\nType *cancel* to stop.'
}

async function runBroadcastCampaign(controlJid, session) {
  if (broadcastRunning) throw new Error('Another broadcast is already running')
  broadcastRunning = true
  try {
    const recipients = await getBroadcastRecipients(session.target)
    if (!recipients.length) {
      await sendText(controlJid, '⚠️ Broadcast sathi ekahi opted-in contact available nahi.')
      return
    }
    if (recipients.length > BROADCAST_MAX_RECIPIENTS) {
      await sendText(controlJid, '⚠️ Ya campaign madhe ' + recipients.length + ' contacts aahet. Safety limit ' + BROADCAST_MAX_RECIPIENTS + ' aahe. Target list split kara.')
      return
    }
    await sendText(controlJid, '🚀 *Broadcast started*\\n\\n👥 Recipients: ' + recipients.length + '\\n⏳ Sending with controlled delay...')
    let sent = 0, failed = 0
    for (const contact of recipients) {
      try {
        await sendBroadcastContent(contact.phone + '@s.whatsapp.net', session)
        sent++
      } catch (err) {
        failed++
        console.error('Broadcast send failed:', JSON.stringify({ phone: contact.phone, error: String(err?.message || err) }))
      }
      if (sent + failed < recipients.length) await new Promise(resolve => setTimeout(resolve, BROADCAST_DELAY_MS))
    }
    await sendText(controlJid, '✅ *Broadcast completed*\\n\\n📤 Sent: ' + sent + '\\n❌ Failed: ' + failed + '\\n👥 Total: ' + recipients.length)
  } finally {
    broadcastRunning = false
  }
}

async function handleBroadcastControlMessage(controlJid, text, mediaInfo = null) {
  const key = 'broadcast-control'
  const normalized = String(text || '').trim().toLowerCase()
  let session = broadcastSessions.get(key)

  if (/^(cancel|broadcast cancel|stop broadcast)$/i.test(String(text || '').trim())) {
    broadcastSessions.delete(key)
    await sendText(controlJid, '🛑 Broadcast cancelled.')
    return true
  }

  if (!session && /^broadcast$/i.test(String(text || '').trim())) {
    broadcastSessions.set(key, { step: 'target' })
    await sendText(controlJid, broadcastHelp())
    return true
  }

  // Contact management is isolated from the existing customer table.
  if (/^add\\s+/i.test(String(text || '').trim())) {
    const parts = String(text).trim().split(/\\s+/)
    const phone = normalizeBroadcastPhone(parts[1])
    if (phone.length < 12) { await sendText(controlJid, '❌ Invalid number. Example: *add 9876543210*'); return true }
    await upsertBroadcastContact(phone, '', [], false)
    await sendText(controlJid, '✅ Number list madhe add zala, pan *opt-in nahi*. Customer ne *START* pathavlyavarach broadcast sathi eligible hoil.')
    return true
  }
  if (/^list$/i.test(String(text || '').trim())) {
    const rows = await supabaseRestRequest('/whatsapp_broadcast_contacts?select=phone,name,tags,marketing_opt_in,active&order=created_at.desc&limit=50')
    const active = (Array.isArray(rows) ? rows : []).filter(x => x.marketing_opt_in && x.active)
    await sendText(controlJid, '📋 *Broadcast contacts*\\n\\nTotal opted-in: *' + active.length + '*\\n\\n' + (active.slice(0, 20).map((x,i) => (i+1)+'. '+x.phone+' '+(x.name||'')).join('\\n') || 'No opted-in contacts yet.'))
    return true
  }

  if (!session) return false

  if (session.step === 'target') {
    if (normalized === '1') session.target = { type: 'all' }
    else if (normalized === '2') session.target = { type: 'tag', tag: 'cctv' }
    else if (normalized === '3') session.target = { type: 'tag', tag: 'it' }
    else if (normalized === '4') session.target = { type: 'tag', tag: 'dealer' }
    else if (normalized === '5') { session.step = 'selected'; await sendText(controlJid, '📱 Selected WhatsApp numbers comma-separated pathva.\\nExample: *9876543210,9898989898*'); return true }
    else { await sendText(controlJid, broadcastHelp()); return true }
    session.step = 'message'
    await sendText(controlJid, '📝 Ata *text message* type kara kiwa 📷 *photo / 🎥 video / 📄 PDF* pathva.\\n\\nMedia caption asel tar media sobat caption type kara.\\n\\nType *cancel* to stop.')
    return true
  }

  if (session.step === 'selected') {
    const numbers = String(text || '').split(/[,\\s]+/).map(normalizeBroadcastPhone).filter(n => n.length >= 12)
    if (!numbers.length) { await sendText(controlJid, '❌ Valid WhatsApp numbers pathva.'); return true }
    session.target = { type: 'selected', numbers: [...new Set(numbers)] }
    session.step = 'message'
    await sendText(controlJid, '📝 Ata text kiwa 📷 photo / 🎥 video / 📄 PDF pathva.')
    return true
  }

  if (session.step === 'message') {
    if (mediaInfo) {
      session.mediaType = mediaInfo.type
      session.media = mediaInfo.buffer
      session.mimetype = mediaInfo.mimetype
      session.fileName = mediaInfo.fileName
      session.text = String(mediaInfo.caption || '').trim()
    } else if (String(text || '').trim()) {
      session.mediaType = null
      session.media = null
      session.mimetype = null
      session.fileName = null
      session.text = String(text).trim()
    } else {
      await sendText(controlJid, '❌ Message empty aahe. Text kiwa media pathva.')
      return true
    }
    const recipients = await getBroadcastRecipients(session.target)
    const targetLabel = session.target.type === 'all' ? 'All opted-in' : session.target.type === 'tag' ? session.target.tag.toUpperCase() : 'Selected numbers'
    session.step = 'confirm'
    await sendText(controlJid, '📢 *BROADCAST PREVIEW*\\n\\n🎯 Target: *' + targetLabel + '*\\n👥 Eligible contacts: *' + recipients.length + '*\\n' + (session.mediaType ? '📎 Media: *' + session.mediaType + '*\\n' : '') + '📝 Message: ' + (session.text || '(no caption)') + '\\n\\n⚠️ Only opted-in contacts receive this.\\n\\nType *SEND* to confirm or *CANCEL* to stop.')
    return true
  }

  if (session.step === 'confirm') {
    if (normalized === 'send') {
      broadcastSessions.delete(key)
      await runBroadcastCampaign(controlJid, session)
      return true
    }
    await sendText(controlJid, 'Type *SEND* to start or *CANCEL* to stop.')
    return true
  }
  return true
}

async function findOrCreateWhatsAppCustomer(phone, name, location) {
  const mobile = String(phone || '').replace(/\D/g, '')
  if (!mobile || !supabase) return null

  const existing = await supabaseRestRequest('/customers?select=id,name,mobile,company_name,address&mobile=eq.' + encodeURIComponent(mobile) + '&limit=1')
  if (Array.isArray(existing) && existing[0]?.id) {
    const current = existing[0]
    const patch = {}
    if (name && !current.name) patch.name = name
    // A WhatsApp complaint must use the location supplied in this complaint.
    // Never reuse an older saved customer address as the complaint location.
    if (location) patch.address = location
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
  const payload = {
    customer_id: customer?.id || null,
    category: 'WhatsApp Service Request',
    service_type: 'Service',
    title: session.problem,
    description: session.problem,
    priority: session.priority || 'normal',
    status: 'open',
    location_text: session.location,
    address: session.location,
    latitude: session.latitude ?? null,
    longitude: session.longitude ?? null,
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
  return { complaint, customer, ticket: complaint.ticket_no || complaint.complaint_no }
}


async function createWhatsAppQuoteLead(session, from) {
  if (!supabase) throw new Error('Supabase event bridge is not configured')
  const phone = String(from || '').replace(/\\D/g, '')
  const totalCameras = Number(session.dome_2mp_qty || 0) + Number(session.bullet_2mp_qty || 0)
  const payload = {
    phone,
    customer_name: session.name || null,
    company_name: session.company_name || null,
    location: session.location || null,
    dome_2mp_qty: Number(session.dome_2mp_qty || 0),
    bullet_2mp_qty: Number(session.bullet_2mp_qty || 0),
    nvr_channel: session.nvr_channel || null,
    hdd: session.hdd || null,
    power_supply: session.power_supply || null,
    cable_90m_bundles: Number(session.cable_90m_bundles || 0),
    router: session.router || null,
    total_cameras: totalCameras,
    connector_qty: totalCameras * 3,
    installation_camera_qty: totalCameras,
    status: 'new'
  }
  const rows = await supabaseRestRequest('/whatsapp_quote_leads', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  })
  const lead = Array.isArray(rows) ? rows[0] || null : null
  if (!lead?.id) throw new Error('Quote lead was not saved')
  return lead
}

function quoteMenuText() {
  return '📷 *INSTANT CCTV QUOTE*\n\nSelect Camera Type & Quantity:\n\n1️⃣ 2MP IP Dome\n2️⃣ 2MP IP Bullet\n\nReply *1* or *2* to continue.'
}

function clearComplaintSession(jid) {
  complaintSessions.delete(jid)
  quoteSessions.delete(jid)
}

fs.mkdirSync(AUTH_DIR, { recursive: true })

async function acquireWhatsAppLease() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return true
  try {
    const result = await supabase.rpc('acquire_whatsapp_bot_lease', {
      p_holder_id: INSTANCE_ID,
      p_ttl_seconds: WHATSAPP_LEASE_TTL_SECONDS    })
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

function resolveWhatsAppJid(jid) {
  const inputJid = String(jid || '').trim()
  if (!inputJid || !inputJid.endsWith('@s.whatsapp.net')) throw new Error('Invalid WhatsApp recipient')
  // Fast path: do NOT call sock.onWhatsApp() before every message.
  // That network lookup was adding avoidable latency to every auto-reply.
  // WhatsApp/BAILEYS can send directly to a normalized phone-number JID.
  return inputJid
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
    '0 -16 Td',    '(' + pdfEscape('7350060071  |  Station Road, Hotel Rajdoot, Ichalkaranji') + ') Tj',
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
  const canonicalMenu = '🔷 *UNIQUE MARKET*\n_CCTV | IT Security | Service & AMC_\n\nNamaskar! Aaple swagat aahe.\n\n1️⃣ Service / Complaint\n2️⃣ Instant CCTV Quote\n3️⃣ CCTV / Sales\n4️⃣ AMC Service\n5️⃣ Payment Query\n6️⃣ More Services\n7️⃣ 👨‍💼 Talk to Staff\n\n🎤 *Voice Complaint:* WhatsApp voice message pathva\n📞 *Call Service:* 7350060071\n\nKrupaya *1 ते 7* madhun option select kara kiwa voice message pathva.\n\n━━━━━━━━━━━━━━\n📍 *Station Road, Hotel Rajdoot, Ichalkaranji*\n📞 *7350060071*\n_Thank you for choosing Unique Market._'
  if (/UNIQUE MARKET|Service \/ Complaint|CCTV \/ Sales|Namaskar! Aaple swagat aahe\./i.test(body)) return canonicalMenu
  return body + '\n\n' + canonicalMenu.split('\n\n').slice(-2).join('\n\n')
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
    '👉 Please open the Service Portal and update the ticket.'
  ].join('\n')
  if (event.event_type === 'status_changed') return [
    '🔄 *UNIQUE MARKET | SERVICE UPDATE*', '',
    'Hello ' + name + ' 👋,',
    'Your service request has been updated.', '',
    '🎫 *Ticket:* ' + ticket,
    '🛠️ *Issue:* ' + issue,
    '📊 *Status:* ' + statusText,
    '📍 *Location:* ' + location, '',
    String(complaint?.status || '').toLowerCase().replaceAll('_',' ') === 'closed' || String(complaint?.status || '').toLowerCase() === 'completed' || String(complaint?.status || '').toLowerCase() === 'resolved' ? '⭐ *Feedback:* https://salesuniquemarket.com/feedback' : 'We will keep you updated on the next service step.',
    'For assistance, reply here or call us.'
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
    'Please keep this Ticket ID for future reference.'
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
        } catch (dupErr) { console.error('WhatsApp duplicate event cleanup failed:', String(dupErr?.message || dupErr)) }        continue
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
      const normalizedCustomerPhone = String(customerPhone || event.phone || '').replace(/\D/g, '')
      const isLegacyAutomationNumber = normalizedCustomerPhone === '8554887026'
      if (event.event_type === 'status_changed') {
        const customerJid = isLegacyAutomationNumber ? null : recipientJid(normalizedCustomerPhone)
        if (customerJid) targets.push(customerJid)
      } else {
        const officeJid = recipientJid(PHONE_NUMBER)
        if (officeJid) targets.push(officeJid)
        const customerJid = isLegacyAutomationNumber ? null : recipientJid(normalizedCustomerPhone)
        if (customerJid && !targets.includes(customerJid)) targets.push(customerJid)
        if (WA_GROUP_JID && !targets.includes(WA_GROUP_JID)) targets.push(WA_GROUP_JID)
      }

      if (isLegacyAutomationNumber) {
        await supabaseRestRequest(`/whatsapp_notification_events?id=eq.${encodeURIComponent(event.id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'failed', error_message: 'Legacy WhatsApp automation number blocked' })
        })
        continue
      }

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

let visitReminderPollerStarted = false
let visitReminderProcessingInFlight = null

function formatVisitReminderTime(value) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value))
  } catch {
    return String(value || '')
  }
}

async function processVisitReminders() {
  if (!SUPABASE_SERVICE_ROLE_KEY || status !== 'connected' || !sock) return
  if (visitReminderProcessingInFlight) return visitReminderProcessingInFlight

  visitReminderProcessingInFlight = (async () => {
    const now = Date.now()
    const windows = [
      {
        key: '24h',
        column: 'whatsapp_visit_reminder_24h_sent_at',
        minMs: 23 * 60 * 60 * 1000 + 59 * 60 * 1000,
        maxMs: 24 * 60 * 60 * 1000 + 60 * 1000,
        label: '1 day'
      },
      {
        key: '1h',
        column: 'whatsapp_visit_reminder_1h_sent_at',
        minMs: 59 * 60 * 1000,
        maxMs: 60 * 60 * 1000 + 60 * 1000,
        label: '1 hour'
      }
    ]

    for (const window of windows) {
      try {
        const from = new Date(now + window.minMs).toISOString()
        const to = new Date(now + window.maxMs).toISOString()
        const params = new URLSearchParams({
          select: 'id,complaint_no,ticket_no,title,description,status,customer_name,customer_phone,technician_id,scheduled_visit_at,' + window.column,
          scheduled_visit_at: 'gte.' + from,
          'scheduled_visit_at': 'lt.' + to,
          [window.column]: 'is.null',
          limit: '20'
        })
        const complaints = await supabaseRestRequest('/complaints?' + params.toString())

        for (const complaint of complaints || []) {
          if (!complaint?.id || !complaint?.scheduled_visit_at) continue

          const resolved = await getComplaintAndCustomer(complaint.id)
          const customer = resolved.customer
          const fullComplaint = resolved.complaint || complaint
          const customerPhone = fullComplaint.customer_phone || customer?.mobile || ''
          let technician = null
          if (fullComplaint.technician_id) {
            technician = await getProfile(fullComplaint.technician_id)
          }
          const technicianPhone = technician?.phone || technician?.mobile || ''
          const targets = []
          for (const phone of [customerPhone, technicianPhone]) {
            const jid = recipientJid(phone)
            if (jid && !targets.includes(jid)) targets.push(jid)
          }
          if (!targets.length) continue

          const ticket = fullComplaint.complaint_no || fullComplaint.ticket_no || fullComplaint.id
          const visitTime = formatVisitReminderTime(fullComplaint.scheduled_visit_at)
          const issue = fullComplaint.title || fullComplaint.description || 'Service Request'
          const location = fullComplaint.location_text || fullComplaint.address || customer?.address || 'Not provided'

          const customerMessage = [
            '📅 *UNIQUE MARKET | SERVICE VISIT REMINDER*',
            '',
            'Hello ' + (customer?.name || fullComplaint.customer_name || 'Customer') + ' 👋,',
            'Your technician visit is scheduled in *' + window.label + '*.',
            '',
            '🎫 *Ticket:* ' + ticket,
            '🛠️ *Issue:* ' + issue,
            '👨‍🔧 *Technician:* ' + (technician?.full_name || technician?.name || 'Assigned Technician'),
            '🕐 *Visit:* ' + visitTime,
            '📍 *Location:* ' + location,
            '',
            'Please keep the site accessible for the technician.',
            'For changes, reply here or call *7350060071*.'
          ].join('\n')

          const technicianMessage = [
            '📅 *UNIQUE MARKET | VISIT REMINDER*',
            '',
            'Hello ' + (technician?.full_name || technician?.name || 'Technician') + ' 👋,',
            'You have a scheduled service visit in *' + window.label + '*.',
            '',
            '🎫 *Ticket:* ' + ticket,
            '👤 *Customer:* ' + (customer?.name || fullComplaint.customer_name || 'Customer'),
            '📞 *Customer Mobile:* ' + (customer?.mobile || fullComplaint.customer_phone || '—'),
            '🛠️ *Issue:* ' + issue,
            '🕐 *Visit:* ' + visitTime,
            '📍 *Location:* ' + location,
            '',
            'Please reach the site on time and update the Service Portal after the visit.'
          ].join('\n')

          try {
            const customerJid = recipientJid(customerPhone)
            const technicianJid = recipientJid(technicianPhone)
            if (customerJid) await sendText(customerJid, customerMessage)
            if (technicianJid && technicianJid !== customerJid) await sendText(technicianJid, technicianMessage)

            await supabaseRestRequest('/complaints?id=eq.' + encodeURIComponent(fullComplaint.id), {
              method: 'PATCH',
              headers: { Prefer: 'return=minimal' },
              body: JSON.stringify({ [window.column]: new Date().toISOString() })
            })
            console.log('WhatsApp visit reminder sent:', JSON.stringify({
              complaintId: fullComplaint.id,
              ticket,
              reminder: window.key,
              customerPhone: customerPhone || null,
              technicianPhone: technicianPhone || null
            }))
          } catch (err) {
            console.error('WhatsApp visit reminder send failed:', JSON.stringify({
              complaintId: fullComplaint.id,
              reminder: window.key,
              error: String(err?.message || err)
            }))
          }
        }
      } catch (err) {
        console.error('WhatsApp visit reminder query failed:', JSON.stringify({
          reminder: window.key,
          error: String(err?.message || err)
        }))
      }    }
  })().finally(() => { visitReminderProcessingInFlight = null })

  return visitReminderProcessingInFlight
}

function startVisitReminderPoller() {
  if (visitReminderPollerStarted) return
  visitReminderPollerStarted = true
  setInterval(() => processVisitReminders().catch(err => console.error('visit reminder poll failed:', String(err?.message || err))), 60000)
}

let businessReminderPollerStarted = false
let businessReminderProcessingInFlight = null

async function processBusinessReminders() {
  if (!SUPABASE_SERVICE_ROLE_KEY || status !== 'connected' || !sock) return
  if (businessReminderProcessingInFlight) return businessReminderProcessingInFlight

  businessReminderProcessingInFlight = (async () => {
    const now = new Date()
    const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    today.setHours(0, 0, 0, 0)

    // PAYMENT: remind only genuinely unpaid challans, at most once every 3 days.
    try {
      const params = new URLSearchParams({
        select: 'id,challan_no,customer_id,challan_date,due_date,subtotal,paid_amount,payment_status,party_name,whatsapp_payment_reminder_last_sent_at',
        limit: '100'
      })
      const challans = await supabaseRestRequest('/challans?' + params.toString())
      for (const challan of challans || []) {
        const paymentStatus = String(challan.payment_status || '').toLowerCase().trim()
        const total = Number(challan.subtotal || 0)
        const paid = Number(challan.paid_amount || 0)
        const outstanding = Math.max(0, total - paid)
        if (!challan.id || outstanding <= 0 || ['paid','completed','settled'].includes(paymentStatus)) continue
        const dueDate = challan.due_date ? new Date(challan.due_date + 'T00:00:00+05:30') : null
        // Send the first payment reminder only after 2 full days past the due date.
        // Older challans without a due_date are intentionally skipped until a due date is set.
        if (!dueDate || !Number.isFinite(dueDate.getTime()) || now - dueDate < 2 * 24 * 60 * 60 * 1000) continue
        if (challan.whatsapp_payment_reminder_last_sent_at && now - new Date(challan.whatsapp_payment_reminder_last_sent_at) < 3 * 24 * 60 * 60 * 1000) continue

        const customers = await supabaseRestRequest('/customers?select=name,mobile,company_name&id=eq.' + encodeURIComponent(challan.customer_id || '') + '&limit=1')
        const customer = customers?.[0]
        const phone = String(customer?.mobile || '').replace(/\D/g, '')
        const jid = recipientJid(phone)
        if (!jid || phone === '8554887026') continue

        const settings = await supabaseRestRequest('/payment_settings?select=upi_id,account_name,qr_image_url,is_enabled&is_enabled=eq.true&limit=1').catch(() => [])
        const ps = settings?.[0]
        const message = [
          '💳 *UNIQUE MARKET | PAYMENT REMINDER*','',
          'Hello ' + (customer?.name || challan.party_name || 'Customer') + ' 👋,',
          'Your payment is still pending.',
          '',
          '🧾 *Challan:* ' + (challan.challan_no || challan.id),
          '💰 *Outstanding:* ₹' + outstanding.toFixed(2),
          ps?.upi_id ? '📲 *UPI:* ' + ps.upi_id : '',
          ps?.account_name ? '🏦 *Account Name:* ' + ps.account_name : '',
          '',
          'Please complete the pending payment and share the UTR here.',
          '📞 *7350060071*'
        ].filter(Boolean).join('\n')
        await sendText(jid, message)
        await supabaseRestRequest('/challans?id=eq.' + encodeURIComponent(challan.id), {
          method:'PATCH', headers:{Prefer:'return=minimal'},
          body:JSON.stringify({ whatsapp_payment_reminder_last_sent_at: now.toISOString() })
        })
      }
    } catch (err) {
      console.error('WhatsApp payment reminder processing failed:', String(err?.message || err))
    }

    // AMC: 30d / 15d / 3d / expired reminders, exactly once per milestone.
    try {
      const params = new URLSearchParams({
        select: 'id,customer_id,plan_name,expiry_date,status,whatsapp_amc_30d_sent_at,whatsapp_amc_15d_sent_at,whatsapp_amc_3d_sent_at,whatsapp_amc_expired_sent_at',
        limit: '100'
      })
      const amcs = await supabaseRestRequest('/amc?' + params.toString())
      for (const amc of amcs || []) {
        if (!amc?.id || !amc.expiry_date) continue
        const expiry = new Date(amc.expiry_date + 'T00:00:00+05:30')
        if (!Number.isFinite(expiry.getTime())) continue
        const days = Math.ceil((expiry - now) / (24 * 60 * 60 * 1000))
        const customerRows = await supabaseRestRequest('/customers?select=name,mobile,company_name&id=eq.' + encodeURIComponent(amc.customer_id || '') + '&limit=1')
        const customer = customerRows?.[0]
        const phone = String(customer?.mobile || '').replace(/\D/g, '')
        const jid = recipientJid(phone)
        if (!jid || phone === '8554887026') continue

        let milestone = null, column = null, textLabel = ''
        if (days <= 0 && !amc.whatsapp_amc_expired_sent_at) {
          milestone='expired'; column='whatsapp_amc_expired_sent_at'; textLabel='expired'
        } else if (days <= 3 && !amc.whatsapp_amc_3d_sent_at) {
          milestone='3d'; column='whatsapp_amc_3d_sent_at'; textLabel='3 days'
        } else if (days <= 15 && !amc.whatsapp_amc_15d_sent_at) {
          milestone='15d'; column='whatsapp_amc_15d_sent_at'; textLabel='15 days'
        } else if (days <= 30 && !amc.whatsapp_amc_30d_sent_at) {
          milestone='30d'; column='whatsapp_amc_30d_sent_at'; textLabel='30 days'
        }
        if (!milestone) continue

        const message = days <= 0
          ? ['⚠️ *UNIQUE MARKET | AMC EXPIRED*','', 'Hello ' + (customer?.name || 'Customer') + ' 👋,', 'Your AMC has expired.', '', '🔧 *Plan:* ' + (amc.plan_name || 'AMC'), '📅 *Expiry:* ' + amc.expiry_date, '', 'Please contact Unique Market for AMC renewal.', '📞 *7350060071*'].join('\n')
          : ['🔧 *UNIQUE MARKET | AMC REMINDER*','', 'Hello ' + (customer?.name || 'Customer') + ' 👋,', 'Your AMC expires in *' + textLabel + '*.', '', '🔧 *Plan:* ' + (amc.plan_name || 'AMC'), '📅 *Expiry:* ' + amc.expiry_date, '', 'Renew your AMC to continue service coverage.', '📞 *7350060071*'].join('\n')
        await sendText(jid, message)
        await supabaseRestRequest('/amc?id=eq.' + encodeURIComponent(amc.id), {
          method:'PATCH', headers:{Prefer:'return=minimal'},
          body:JSON.stringify({ [column]: now.toISOString() })
        })
      }
    } catch (err) {
      console.error('WhatsApp AMC reminder processing failed:', String(err?.message || err))
    }
  })().finally(() => { businessReminderProcessingInFlight = null })
  return businessReminderProcessingInFlight
}

function startBusinessReminderPoller() {
  if (businessReminderPollerStarted) return
  businessReminderPollerStarted = true
  setInterval(() => processBusinessReminders().catch(err => console.error('business reminder poll failed:', String(err?.message || err))), 60000)
}


function startEventPoller() {
  if (eventPollerStarted) return
  eventPollerStarted = true
  setInterval(() => processNotificationEvents().catch(err => logger.error({ err: describeSupabaseError(err) }, 'event poll failed')), EVENT_POLL_MS)
}


async function transcribeWhatsAppVoice(buffer, mimetype = 'audio/ogg') {
  if (!GOOGLE_API_KEY) {
    throw new Error('Voice transcription is not configured. Add GOOGLE_API_KEY or GEMINI_API_KEY in Render environment variables.')
  }
  const base64 = Buffer.from(buffer).toString('base64')
  const cleanMime = String(mimetype || 'audio/ogg').split(';')[0].trim() || 'audio/ogg'
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(GEMINI_TRANSCRIBE_MODEL) + ':generateContent?key=' + encodeURIComponent(GOOGLE_API_KEY)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: 'Transcribe this WhatsApp customer voice message. The customer may speak Marathi, Hindi, or English. Return only the transcription in the original spoken language. Do not add explanations.' },
          { inlineData: { mimeType: cleanMime, data: base64 } }
        ]
      }],
      generationConfig: { temperature: 0.1 }
    })
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error('Voice transcription failed: ' + (payload?.error?.message || ('HTTP ' + response.status)))
  const transcript = String(payload?.candidates?.[0]?.content?.parts?.map(p => p?.text || '').join(' ') || '').trim()
  if (!transcript) throw new Error('Voice message could not be transcribed.')
  return transcript
}

async function notifyStaffOfHandoff(customerPhone, customerText) {
  const staffJid = recipientJid(STAFF_PHONE_NUMBER)
  if (!staffJid || normalizeBroadcastPhone(STAFF_PHONE_NUMBER) === normalizeBroadcastPhone(customerPhone)) return false
  const message = [
    '👨‍💼 *UNIQUE MARKET | STAFF REQUEST*',
    '',
    'A customer requested human assistance on WhatsApp.',
    '📞 *Customer:* ' + (customerPhone || 'Unknown'),
    '💬 *Message:* ' + (customerText || 'Customer requested staff assistance.'),
    '',
    'Please contact the customer.',
    '📞 *7350060071*'
  ].join('\n')
  await sendText(staffJid, formatWhatsAppBranding(message))
  return true
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
      const remoteJid = String(msg.key?.remoteJid || '').trim()
      const controlSelfMessage = isBroadcastControlChat(msg, remoteJid)
      if (msg.key?.fromMe && !controlSelfMessage) continue
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
      const locationMessage = msg.message?.locationMessage || null
      const mediaNode = msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.documentMessage || null
      const audioNode = msg.message?.audioMessage || null
      const mediaType = msg.message?.imageMessage ? 'image' : msg.message?.videoMessage ? 'video' : msg.message?.documentMessage ? 'document' : null
      const isVoiceMessage = Boolean(audioNode)
      let text = String(msg.message?.conversation || msg.message?.extendedTextMessage?.text || mediaNode?.caption || '').trim()
      if (isVoiceMessage) {
        try {
          const voiceBuffer = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage })
          text = await transcribeWhatsAppVoice(voiceBuffer, audioNode?.mimetype || 'audio/ogg')
          console.log('WhatsApp voice transcribed:', JSON.stringify({ from: from || null, transcript: text }))
        } catch (err) {
          console.error('WhatsApp voice transcription failed:', String(err?.message || err))
          const fallback = [
            '🎤 *VOICE COMPLAINT RECEIVED*',
            '',
            'Tumcha voice message receive zala, pan ata voice samajta ala nahi.',
            '',
            '1️⃣ Complaint type kara',
            '2️⃣ Punha short voice message pathva',
            '3️⃣ 📞 *7350060071* var call kara'
          ].join('\n')
          try { await sendText(from, formatWhatsAppBranding(fallback)) } catch {}
          continue
        }
      }
      if (controlSelfMessage) {
        try {
          let mediaInfo = null
          if (mediaNode && mediaType) {
            const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage })
            if (buffer.length > BROADCAST_MAX_MEDIA_BYTES) throw new Error('Media is larger than 12MB')
            mediaInfo = { type: mediaType, buffer, mimetype: mediaNode.mimetype || null, fileName: mediaNode.fileName || null, caption: mediaNode.caption || text }
          }
          const handled = await handleBroadcastControlMessage(PHONE_NUMBER + '@s.whatsapp.net', text, mediaInfo)
          if (handled) continue
        } catch (err) {
          console.error('Broadcast control error:', String(err?.message || err))
          await sendText(PHONE_NUMBER + '@s.whatsapp.net', '⚠️ Broadcast error: ' + String(err?.message || err))
          continue
        }
      }
      console.log('WhatsApp incoming message:', JSON.stringify({
        from: from || null,
        conversationKey,
        remoteJid,
        senderPn: senderPn || null,
        remoteJidAlt: remoteJidAlt || null,
        participantAlt: participantAlt || null,
        text,
        locationMessage: locationMessage ? { latitude: locationMessage.degreesLatitude ?? locationMessage.latitude ?? null, longitude: locationMessage.degreesLongitude ?? locationMessage.longitude ?? null } : null,
        messageId: msg.key?.id || null
      }))
      if ((!text && !locationMessage) || !conversationKey || remoteJid.endsWith('@g.us')) continue

      const normalized = text.toLowerCase()
      let reply = null

      // HARD ROUTE: option 2 always opens the web quote form.
      // Do this before ALL menu/session routing. Never let option 2 reach the main menu.
      if (text.trim() === '2') {
        clearComplaintSession(conversationKey)
        const phone = String(from || '').replace(/\D/g, '')
        const quoteReply = '📷 *INSTANT CCTV QUOTE*\n\nQuote details fill karanyasathi ha form open kara:\n\n👉 https://unique-market-whatsapp-zgw1.onrender.com/quote-form?phone=' + encodeURIComponent(phone) + '\n\nForm submit kelyavar requirement directly Unique Market la receive hoil.\n\n🔷 *UNIQUE MARKET*\n📞 7350060071'
        try {
          await sendText(from, quoteReply)
          console.log('WhatsApp HARD option 2 reply sent:', JSON.stringify({ to: from, phone, messageId: msg.key?.id || null }))
        } catch (err) {
          console.error('WhatsApp HARD option 2 reply failed:', String(err?.message || err))
        }
        continue
      }

      // Main-menu option 2 must ALWAYS open the instant quote web form.
      // Clear any stale interactive session before routing this menu option.
      if (normalized === '2') clearComplaintSession(conversationKey)

      
      if (isVoiceMessage && !complaintSessions.has(conversationKey) && !quoteSessions.has(conversationKey)) {
        complaintSessions.set(conversationKey, {
          step: 'name',
          problem: text,
          name: '',
          location: '',
          locationMode: null,
          latitude: null,
          longitude: null,
          priority: 'normal'
        })
        reply = '🎤 *VOICE COMPLAINT UNDERSTOOD*\n\n🛠️ *Problem:* ' + text + '\n\n👤 Ata *Customer / Company Name* pathva.'
      }

const active = complaintSessions.get(conversationKey); const quote = quoteSessions.get(conversationKey)

      if (/^(cancel|stop|0|menu|back)$/i.test(normalized)) {
        clearComplaintSession(conversationKey)
        serviceEnquirySessions.delete(conversationKey)
        reply = '🔷 *UNIQUE MARKET*\n_CCTV | IT Security | Service & AMC_\n\nNamaskar! Aaple swagat aahe.\n\n1️⃣ Service / Complaint\n2️⃣ Instant CCTV Quote\n3️⃣ CCTV / Sales\n4️⃣ AMC Service\n5️⃣ Payment Query\n6️⃣ More Services\n\n🎤 *Voice Complaint:* Voice message pathva\n📞 *Call Service:* +91 7350060071\n👨‍💼 *Talk to Staff:* 7\n\nKrupaya *1 ते 7* madhla option pathva kiwa direct voice message pathva.'
      } else if (quote) {
        const qty = Number.parseInt(text, 10)
        if (quote.step === 'dome') {
          if (!Number.isInteger(qty) || qty < 0) {
            reply = '❌ Quantity valid number madhe dya. Example: *4*'
          } else {
            quote.dome_2mp_qty = qty
            quote.step = 'bullet'
            reply = '📷 *2MP IP BULLET*\n\nKiti cameras pahijet? Quantity pathva.\nExample: *4*'
          }
        } else if (quote.step === 'bullet') {
          if (!Number.isInteger(qty) || qty < 0) {
            reply = '❌ Quantity valid number madhe dya. Example: *4*'
          } else {
            quote.bullet_2mp_qty = qty
            quote.step = 'nvr'
            reply = '🎥 *NVR / DVR CHANNEL*\n\n1️⃣ 4 Channel\n2️⃣ 8 Channel\n3️⃣ 16 Channel\n4️⃣ More Options\n\nKrupaya *1, 2, 3 kiwa 4* pathva.'
          }
        } else if (quote.step === 'nvr') {
          if (normalized === '1') { quote.nvr_channel = '4CH'; quote.step = 'hdd'; reply = '💾 *HDD*\n\n1️⃣ 500GB\n2️⃣ 1TB\n3️⃣ 2TB\n4️⃣ 4TB\n5️⃣ More Options\n\nOption pathva.' }
          else if (normalized === '2') { quote.nvr_channel = '8CH'; quote.step = 'hdd'; reply = '💾 *HDD*\n\n1️⃣ 500GB\n2️⃣ 1TB\n3️⃣ 2TB\n4️⃣ 4TB\n5️⃣ More Options\n\nOption pathva.' }
          else if (normalized === '3') { quote.nvr_channel = '16CH'; quote.step = 'hdd'; reply = '💾 *HDD*\n\n1️⃣ 500GB\n2️⃣ 1TB\n3️⃣ 2TB\n4️⃣ 4TB\n5️⃣ More Options\n\nOption pathva.' }
          else if (normalized === '4') { quote.step = 'nvr_more'; reply = '🎥 *MORE NVR OPTIONS*\n\n32 Channel / 64 Channel madhun requirement type kara.\nExample: *32CH*' }
          else reply = 'Krupaya *1, 2, 3 kiwa 4* pathva.'
        } else if (quote.step === 'nvr_more') {
          const nvr = text.toUpperCase().replace(/\\s+/g, '')
          if (!/^(32|64)CH$/.test(nvr)) reply = '❌ 32CH kiwa 64CH pathva. Example: *32CH*'
          else { quote.nvr_channel = nvr; quote.step = 'hdd'; reply = '💾 *HDD*\n\n1️⃣ 500GB\n2️⃣ 1TB\n3️⃣ 2TB\n4️⃣ 4TB\n5️⃣ More Options\n\nOption pathva.' }
        } else if (quote.step === 'hdd') {
          const hddMap = {'1':'500GB','2':'1TB','3':'2TB','4':'4TB'}
          if (hddMap[normalized]) { quote.hdd = hddMap[normalized]; quote.step = 'power'; reply = '🔌 *POWER SUPPLY*\n\n1️⃣ 4 Channel\n2️⃣ 8 Channel\n3️⃣ More Options\n\nOption pathva.' }
          else if (normalized === '5') { quote.step = 'hdd_more'; reply = '💾 *MORE HDD OPTIONS*\n\n6TB kiwa 8TB pathva. Example: *6TB*' }
          else reply = 'Krupaya *1 ते 5* madhla option pathva.'
        } else if (quote.step === 'hdd_more') {
          const hdd = text.toUpperCase().replace(/\\s+/g, '')
          if (!/^(6|8)TB$/.test(hdd)) reply = '❌ 6TB kiwa 8TB pathva.'
          else { quote.hdd = hdd; quote.step = 'power'; reply = '🔌 *POWER SUPPLY*\n\n1️⃣ 4 Channel\n2️⃣ 8 Channel\n3️⃣ More Options\n\nOption pathva.' }
        } else if (quote.step === 'power') {
          if (normalized === '1') { quote.power_supply = '4CH'; quote.step = 'cable'; reply = '📦 *CAT6 CABLE*\n\nCable *90m bundle* madhe ahe.\n\nKiti bundles pahijet? Number pathva.\nExample: *2*\n\nJast cable asel tar actual bundle quantity pathva.' }
          else if (normalized === '2') { quote.power_supply = '8CH'; quote.step = 'cable'; reply = '📦 *CAT6 CABLE*\n\nCable *90m bundle* madhe ahe.\n\nKiti bundles pahijet? Number pathva.\nExample: *2*' }
          else if (normalized === '3') { quote.step = 'power_more'; reply = '🔌 *MORE POWER OPTIONS*\n\n16CH / 32CH type kara. Example: *16CH*' }
          else reply = 'Krupaya *1, 2 kiwa 3* pathva.'
        } else if (quote.step === 'power_more') {
          const power = text.toUpperCase().replace(/\\s+/g, '')
          if (!/^(16|32)CH$/.test(power)) reply = '❌ 16CH kiwa 32CH pathva.'
          else { quote.power_supply = power; quote.step = 'cable'; reply = '📦 *CAT6 CABLE*\n\nCable *90m bundle* madhe ahe.\n\nKiti bundles pahijet? Number pathva.' }
        } else if (quote.step === 'cable') {
          if (!Number.isInteger(qty) || qty < 0) reply = '❌ Bundle quantity number madhe dya. Example: *2*'
          else {
            quote.cable_90m_bundles = qty
            quote.step = 'router'
            reply = '📡 *REMOTE MOBILE VIEW*\n\n1️⃣ 4G Router — 1 Qty\n2️⃣ 5G Router — 1 Qty\n3️⃣ No Router\n\nOption pathva.'
          }
        } else if (quote.step === 'router') {
          if (normalized === '1') quote.router = '4G Router x1'
          else if (normalized === '2') quote.router = '5G Router x1'
          else if (normalized === '3') quote.router = 'No Router'
          else { reply = 'Krupaya *1, 2 kiwa 3* pathva.' }
          if (!reply) {
            quote.step = 'name'
            reply = '👤 *CUSTOMER / COMPANY NAME*\n\nName kiwa Company Name pathva.'
          }
        } else if (quote.step === 'name') {
          quote.name = text
          quote.step = 'company'
          reply = '🏢 *COMPANY NAME*\n\nCompany name asel tar pathva. Nasel tar *skip* pathva.'
        } else if (quote.step === 'company') {
          quote.company_name = /^skip$/i.test(text) ? '' : text
          quote.step = 'location'
          reply = '📍 *SITE LOCATION*\n\nService/Installation location pathva.'
        } else if (quote.step === 'location') {
          quote.location = text
          const total = Number(quote.dome_2mp_qty || 0) + Number(quote.bullet_2mp_qty || 0)
          if (total <= 0) {
            reply = '⚠️ Kamit kami 1 camera quantity required ahe. *menu* pathvun Quote punha start kara.'
            quoteSessions.delete(conversationKey)
          } else {
            try {
              const lead = await createWhatsAppQuoteLead(quote, from)
              quoteSessions.delete(conversationKey)
              reply = '✅ *CCTV QUOTE REQUIREMENT SAVED*\n\n👤 *Customer:* ' + quote.name + '\n📍 *Location:* ' + quote.location + '\n\n📷 *2MP Dome:* ' + quote.dome_2mp_qty + '\n📷 *2MP Bullet:* ' + quote.bullet_2mp_qty + '\n🎥 *NVR/DVR:* ' + quote.nvr_channel + '\n💾 *HDD:* ' + quote.hdd + '\n🔌 *Power:* ' + quote.power_supply + '\n📦 *90m Cable:* ' + quote.cable_90m_bundles + ' bundle(s)\n🔗 *Connectors:* ' + (total * 3) + ' pcs\n📡 *Remote View:* ' + quote.router + '\n🛠️ *Installation:* ' + total + ' camera(s)\n\n💰 *Price WhatsApp bot var show kela janar nahi.*\nAmhi tumchi requirement check karun final quotation share karu.\n\nLead ID: ' + String(lead.id).slice(0, 8) + '\n\nType *menu* for Main Menu.'
            } catch (err) {
              console.error('WhatsApp CCTV quote lead save failed:', String(err?.message || err))
              reply = '⚠️ Quote requirement save kartana temporary problem ala. Krupaya punha try kara kiwa *7350060071* var contact kara.'
            }
          }
        }
      } else if (serviceEnquirySessions.has(conversationKey)) {
        const enquiry = serviceEnquirySessions.get(conversationKey)
        serviceEnquirySessions.delete(conversationKey)
        try {
          const customerPhone = String(from || '').replace(/\D/g, '')
          const details = text.slice(0, 2500)
          await notifyStaffOfHandoff(customerPhone, enquiry.label + ' enquiry: ' + details)
          reply = '✅ *ENQUIRY RECEIVED*\n\n' + enquiry.confirmation + '\n\n👨‍💼 Our team has been notified and will contact you shortly.\n\n📞 *7350060071*\nType *menu* to return to the main menu.'
        } catch (err) {
          console.error('WhatsApp enquiry handoff failed:', String(err?.message || err))
          reply = '⚠️ Your message could not be forwarded automatically. Please call *7350060071* and our team will assist you.'
        }
      } else if (active) {
        if (active.step === 'problem') {
          active.problem = text
          active.step = 'name'
          reply = '🛠️ *Problem noted.*\n\nAta *Customer / Company Name* pathva.'
        } else if (active.step === 'name') {
          active.name = text
          active.step = 'location'
          reply = '📍 *SERVICE LOCATION*\n\n1️⃣ *Current Location Share करा*\n2️⃣ *Address Manually Type करा*\n\nCurrent location sathi WhatsApp → 📎 → Location → Send your current location.'
        } else if (active.step === 'location') {
          if (/^1$/.test(normalized)) {
            active.locationMode = 'current'
            active.step = 'waiting_location'
            reply = '📍 Ata WhatsApp madhun *Current Location* share kara.\n\n📎 → Location → *Send your current location*'
          } else if (/^2$/.test(normalized)) {
            active.locationMode = 'manual'
            active.step = 'manual_location'
            reply = '✍️ Ata *Service Address / Area* type kara.'
          } else {
            reply = '📍 Location sathi option select kara:\n\n1️⃣ Current Location Share करा\n2️⃣ Address Manually Type करा'
          }
        } else if (active.step === 'manual_location') {
          active.location = text
          active.latitude = null
          active.longitude = null
          active.step = 'priority'
          reply = '⚡ Problem chi priority pathva:\n\n1️⃣ Urgent\n2️⃣ Normal\n3️⃣ Low'
        } else if (active.step === 'waiting_location') {
          if (locationMessage) {
            const lat = Number(locationMessage.degreesLatitude ?? locationMessage.latitude)
            const lng = Number(locationMessage.degreesLongitude ?? locationMessage.longitude)
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              active.latitude = lat
              active.longitude = lng
              active.location = 'https://www.google.com/maps?q=' + lat + ',' + lng
              active.step = 'priority'
              reply = '✅ *Current Location received.*\n\n⚡ Problem chi priority pathva:\n\n1️⃣ Urgent\n2️⃣ Normal\n3️⃣ Low'
            } else {
              reply = '⚠️ Location receive zali nahi. Krupaya punha *Current Location* share kara.'
            }
          } else {
            reply = '📍 Krupaya WhatsApp madhun *Current Location* share kara.\n\n📎 → Location → *Send your current location*'
          }
        } else if (active.step === 'priority') {
          const priorityMap = { '1': 'urgent', '2': 'normal', '3': 'low', urgent: 'urgent', normal: 'normal', low: 'low' }
          active.priority = priorityMap[normalized] || 'normal'
          try {
            const result = await createWhatsAppComplaint(active, from)
            clearComplaintSession(conversationKey)
            const priorityText = { urgent: 'Urgent', normal: 'Normal', low: 'Low' }[active.priority] || 'Normal'
            reply = '✅ *SERVICE REQUEST REGISTERED*\n\n🎫 *Complaint No:* ' + result.ticket + '\n👤 *Customer:* ' + active.name + '\n📍 *Location:* ' + active.location + '\n🛠️ *Problem:* ' + active.problem + '\n⚡ *Priority:* ' + priorityText + '\n\nOur team will contact you shortly.\n\nType *menu* for Main Menu.'
          } catch (err) {
            console.error('WhatsApp complaint creation failed:', String(err?.message || err))
            // Reset the failed complaint flow so the next menu option works normally.
            clearComplaintSession(conversationKey)
            reply = '⚠️ Complaint register kartana temporary problem ala. Complaint session reset keli aahe. Punha *1* pathvun complaint register kara kiwa *2* pathvun CCTV Quote ghya.\n\n📞 *7350060071*'
          }
        }
      } else if (!reply && /^(hi+|hello+|hey+|namaskar|नमस्कार)$/i.test(normalized)) {
        reply = '🔷 *UNIQUE MARKET*\n_CCTV | IT Security | Service & AMC_\n\nNamaskar! Aaple swagat aahe.\n\n1️⃣ Service / Complaint\n2️⃣ Instant CCTV Quote\n3️⃣ CCTV / Sales\n4️⃣ AMC Service\n5️⃣ Payment Query\n6️⃣ More Services\n\nKrupaya *1, 2, 3 kiwa 4* pathva.'
      } else if (normalized === '1') {
        complaintSessions.set(conversationKey, { step: 'problem', problem: '', name: '', location: '', locationMode: null, latitude: null, longitude: null, priority: 'normal' })
        reply = '🛠️ *SERVICE COMPLAINT*\n\nTumchya CCTV/IT system madhla problem short madhe type kara.\n\nExample: *Camera band aahe* / *DVR recording nahi* / *CCTV mobile var nahi.*'
      } else if (normalized === '2') {
        reply = '📷 *INSTANT CCTV QUOTE*\n\nQuote details fill karanyasathi ha form open kara:\n\n👉 https://unique-market-whatsapp-zgw1.onrender.com/quote-form?phone=' + encodeURIComponent(String(from || '').replace(/\\D/g, '')) + '\n\nForm submit kelyavar requirement directly Unique Market la receive hoil.'
      } else if (normalized === '3') {
        serviceEnquirySessions.set(conversationKey, { label: 'CCTV / Sales', confirmation: 'Your CCTV / IT product enquiry has been sent to our team.' })
        reply = '📷 *CCTV / SALES ENQUIRY*\n\nPlease send your requirement in one message:\n• Product / brand / model\n• Quantity\n• Installation location (if needed)\n• Any special requirement\n\n💡 No prices are generated automatically; our team will verify and share a quotation.\nType *cancel* to return to the menu.'
      } else if (normalized === '4') {
        serviceEnquirySessions.set(conversationKey, { label: 'AMC Service', confirmation: 'Your AMC request has been sent to our service team.' })
        reply = '🔧 *AMC SERVICE REQUEST*\n\nPlease send these details in one message:\n• Customer / company name\n• Site address / area\n• CCTV / IT system details\n• AMC expiry date (if known)\n\nOur team will check the service coverage and contact you.\nType *cancel* to return to the menu.'
      } else if (normalized === '5') {
        serviceEnquirySessions.set(conversationKey, { label: 'Payment Query', confirmation: 'Your payment query has been sent to our office team.' })
        reply = '💳 *PAYMENT QUERY*\n\nPlease send your invoice / challan number, customer or company name, and the payment amount or reference if available.\n\n⚠️ Do not send card PINs, OTPs or passwords.\nType *cancel* to return to the menu.'
      } else if (normalized === '7') {
        try {
          const customerPhone = String(from || '').replace(/\D/g, '')
          await notifyStaffOfHandoff(customerPhone, 'Customer selected Talk to Staff.')
        } catch (err) {
          console.error('Staff handoff notification failed:', String(err?.message || err))
        }
        reply = '👨‍💼 *TALK TO STAFF*\n\nTumchi request staff kade pathavli aahe.\n\n📞 *7350060071*\n\nTumhala call karaycha asel tar varcha number tap kara.\\n\\nTumhi tumcha problem voice message madhye pan pathvu shakta.'
      } else if (normalized === '6') {
        reply = '🧰 *MORE SERVICES*\n\nComputer Repair, Networking, Laptop/Desktop, AMC & IT services sathi *7350060071* var contact kara.'
      } else {
        reply = 'Krupaya *Hi* pathva kiwa menu madhun option select kara.\n\n1️⃣ Service / Complaint\n2️⃣ Instant CCTV Quote\n3️⃣ CCTV / Sales\n4️⃣ AMC Service\n5️⃣ Payment Query\n6️⃣ More Services'
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
      startVisitReminderPoller()
      startBusinessReminderPoller()
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
      if (!isLoggedOut && !reconnecting) {        reconnecting = true
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
app.get('/pair-public', async (req, res) => {
  if (String(process.env.WA_PUBLIC_PAIRING || '').toLowerCase() !== 'true') return res.status(404).json({ ok: false, error: 'Not enabled' });
  if (!sock) return res.status(503).json({ ok: false, error: 'WhatsApp socket is not ready' });
  if (status === 'connected') return res.json({ ok: true, status: 'connected' });
  if (!PHONE_NUMBER) return res.status(400).json({ ok: false, error: 'WhatsApp phone number is not configured' });
  try {
    const deadline = Date.now() + 10000;
    while (!pairingReady && Date.now() < deadline && sock) await new Promise(resolve => setTimeout(resolve, 250));
    if (!pairingReady) return res.status(503).json({ ok: false, error: 'WhatsApp socket is still connecting. Try again in a few seconds.' });
    if (pairingRequestInFlight) pairingCode = await pairingRequestInFlight;
    else {
      pairingRequestInFlight = sock.requestPairingCode(PHONE_NUMBER);
      try { pairingCode = await pairingRequestInFlight } finally { pairingRequestInFlight = null }
    }
    res.json({ ok: true, status: 'pairing_required', pairingCode });
  } catch (err) {
    console.error('Public pairing code request failed:', err);
    res.status(500).json({ ok: false, error: 'Pairing code request failed', detail: String(err?.message || err) });
  }
})

app.post('/pair', async (req, res) => { if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' }); if (!sock) return res.status(503).json({ ok: false, error: 'WhatsApp socket is not ready' }); if (status === 'connected') return res.json({ ok: true, status: 'connected' }); if (!PHONE_NUMBER) return res.status(400).json({ ok: false, error: 'WhatsApp phone number is not configured' }); try { const deadline = Date.now() + 5000; while (!pairingReady && Date.now() < deadline && sock) await new Promise(resolve => setTimeout(resolve, 250)); if (!pairingReady) return res.status(503).json({ ok: false, error: 'WhatsApp socket is still connecting. Wait 2 seconds and try again.' }); if (pairingRequestInFlight) pairingCode = await pairingRequestInFlight; else { pairingRequestInFlight = sock.requestPairingCode(PHONE_NUMBER); try { pairingCode = await pairingRequestInFlight } finally { pairingRequestInFlight = null } } res.json({ ok: true, status: 'pairing_required', pairingCode }) } catch (err) { console.error('Pairing code request failed:', err); res.status(500).json({ ok: false, error: 'Pairing code request failed', detail: String(err?.message || err) }) } })
app.post('/send', async (req, res) => { if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' }); const digits = String(req.body?.phone || req.body?.to || '').replace(/\D/g, ''); const text = String(req.body?.message || '').trim(); if (!digits || !text) return res.status(400).json({ ok: false, error: 'phone/to and message are required' }); const jid = recipientJid(digits); if (!jid) return res.status(403).json({ ok: false, error: 'This WhatsApp recipient is blocked' }); try { const result = await sendText(jid, text); res.json({ ok: true, messageId: result?.key?.id || null }) } catch (err) { res.status(500).json({ ok: false, error: String(err?.message || err) }) } })
app.listen(PORT, '0.0.0.0', () => { console.log(`Unique Market WhatsApp bot listening on port ${PORT}`); if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) console.warn('Supabase event bridge is not configured'); (async () => { try { if (String(process.env.WA_FORCE_CLEAN_RESET || '').toLowerCase() === 'true') { console.log('WA_FORCE_CLEAN_RESET enabled: clearing WhatsApp local + Supabase auth state before startup'); fs.rmSync(AUTH_DIR, { recursive: true, force: true }); fs.mkdirSync(AUTH_DIR, { recursive: true }); if (SUPABASE_SERVICE_ROLE_KEY) await supabaseRestRequest('/whatsapp_auth_sessions?file_name=not.is.null', { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); console.log('WA_FORCE_CLEAN_RESET completed'); } await startWhatsApp() } catch (err) { status = 'error'; console.error('WhatsApp startup failed', err) } })() })