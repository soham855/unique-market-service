import http from 'node:http'
import fs from 'node:fs'
import crypto from 'node:crypto'

const PORT = Number(process.env.PORT || 10000)
const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://tfscvycomllamoubtlcf.supabase.co').replace(/\/$/, '')
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const OPENWA_URL = String(process.env.OPENWA_URL || 'http://openwa-api:2785').replace(/\/$/, '')
const OPENWA_API_KEY_ENV = String(process.env.OPENWA_API_KEY || '').trim()
const OPENWA_DATA_KEY_FILE = String(process.env.OPENWA_DATA_KEY_FILE || '/openwa-data/.api-key')
const OPENWA_SESSION_NAME = String(process.env.OPENWA_SESSION_NAME || 'unique-market-7350060071')
const OPENWA_PUBLIC_WEBHOOK_URL = String(process.env.OPENWA_PUBLIC_WEBHOOK_URL || '').trim()
const OPENWA_WEBHOOK_SECRET = String(process.env.OPENWA_WEBHOOK_SECRET || '').trim()
const WA_PHONE_NUMBER = String(process.env.WA_PHONE_NUMBER || '917350060071').replace(/\D/g, '')
const QUOTE_FORM_URL = String(process.env.QUOTE_FORM_URL || 'https://unique-market-whatsapp-zgw1.onrender.com/quote-form')
const EVENT_POLL_MS = Number(process.env.WA_EVENT_POLL_MS || 5000)
const EVENT_MAX_AGE_HOURS = Number(process.env.WA_EVENT_MAX_AGE_HOURS || 24)

let apiKey = OPENWA_API_KEY_ENV
let sessionId = String(process.env.OPENWA_SESSION_ID || '').trim()
let sessionStatus = 'starting'
let setupPromise = null
let lastSetupError = null

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 10) digits = '91' + digits
  return digits
}
function chatId(phone) { return normalizePhone(phone) + '@c.us' }
function isPrivateChat(id) { return /@(c\.us|s\.whatsapp\.net)$/.test(String(id || '')) }
function brand(text) {
  return String(text || '').trim() + '\n\n━━━━━━━━━━━━━━\n🔷 *UNIQUE MARKET*\nCCTV | IT Security | Service & AMC\n📍 Station Road, Hotel Rajdoot, Ichalkaranji\n📞 7350060071'
}
function menu() {
  return brand('Namaskar! Welcome to Unique Market.\n\n1️⃣ Service / Complaint\n2️⃣ Instant CCTV Quote\n3️⃣ CCTV / Sales\n4️⃣ AMC Service\n5️⃣ Payment Query\n6️⃣ More Services\n7️⃣ Talk to Staff\n\nReply with an option.')
}
async function readApiKey() {
  if (apiKey) return apiKey
  try { apiKey = fs.readFileSync(OPENWA_DATA_KEY_FILE, 'utf8').trim() } catch {}
  return apiKey
}
async function openwa(pathname, options = {}) {
  const key = await readApiKey()
  if (!key) throw new Error('OpenWA API key is not available yet')
  const response = await fetch(OPENWA_URL + pathname, { ...options, headers: { 'X-API-Key': key, 'Content-Type': 'application/json', ...(options.headers || {}) } })
  const raw = await response.text()
  let body = null
  try { body = raw ? JSON.parse(raw) : null } catch {}
  if (!response.ok) throw new Error('OpenWA ' + response.status + ': ' + (body ? JSON.stringify(body) : raw.slice(0, 500)))
  return body
}
async function supabase(pathname, options = {}) {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase service role key is not configured')
  const response = await fetch(SUPABASE_URL + '/rest/v1' + pathname, { ...options, headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) } })
  const raw = await response.text()
  let body = null
  try { body = raw ? JSON.parse(raw) : null } catch {}
  if (!response.ok) throw new Error('Supabase ' + response.status + ': ' + (body ? JSON.stringify(body) : raw.slice(0, 500)))
  return body
}
async function ensureSession() {
  if (sessionId) {
    try { const current = await openwa('/api/sessions/' + encodeURIComponent(sessionId)); sessionStatus = String(current?.status || 'unknown'); return current } catch { sessionId = '' }
  }
  const sessions = await openwa('/api/sessions?name=' + encodeURIComponent(OPENWA_SESSION_NAME))
  if (Array.isArray(sessions) && sessions[0]?.id) sessionId = String(sessions[0].id)
  else {
    const created = await openwa('/api/sessions', { method: 'POST', body: JSON.stringify({ name: OPENWA_SESSION_NAME }) })
    sessionId = String(created?.id || '')
    if (!sessionId) throw new Error('OpenWA session creation returned no id')
  }
  let current = await openwa('/api/sessions/' + encodeURIComponent(sessionId))
  sessionStatus = String(current?.status || 'unknown')
  if (!['ready', 'connected', 'authenticated'].includes(sessionStatus)) {
    try { await openwa('/api/sessions/' + encodeURIComponent(sessionId) + '/start', { method: 'POST' }) } catch (err) {
      if (!/already started|already running|409/i.test(String(err?.message || err))) throw err
    }
    current = await openwa('/api/sessions/' + encodeURIComponent(sessionId))
    sessionStatus = String(current?.status || 'unknown')
  }
  return current
}
async function configureWebhook() {
  if (!OPENWA_PUBLIC_WEBHOOK_URL) return false
  const hooks = await openwa('/api/sessions/' + encodeURIComponent(sessionId) + '/webhooks')
  const existing = Array.isArray(hooks) ? hooks.find(h => h.url === OPENWA_PUBLIC_WEBHOOK_URL && h.active !== false) : null
  if (existing) return true
  await openwa('/api/sessions/' + encodeURIComponent(sessionId) + '/webhooks', {
    method: 'POST',
    body: JSON.stringify({ url: OPENWA_PUBLIC_WEBHOOK_URL, events: ['message.received', 'session.status'], secret: OPENWA_WEBHOOK_SECRET || undefined, retryCount: 5 })
  })
  return true
}
async function setupOpenWA() {
  if (setupPromise) return setupPromise
  setupPromise = (async () => {
    for (;;) {
      try {
        await readApiKey()
        if (!apiKey) throw new Error('Waiting for OpenWA generated API key')
        const current = await ensureSession()
        await configureWebhook()
        sessionStatus = String(current?.status || sessionStatus || 'unknown')
        lastSetupError = null
        console.log(JSON.stringify({ event: 'openwa_ready', sessionId, status: sessionStatus }))
        return
      } catch (err) {
        lastSetupError = String(err?.message || err)
        console.error('OpenWA setup retry:', lastSetupError)
        await sleep(5000)
      }
    }
  })().finally(() => { setupPromise = null })
  return setupPromise
}
async function sendText(phoneOrJid, text) {
  await setupOpenWA()
  const id = String(phoneOrJid || '').includes('@') ? String(phoneOrJid) : chatId(phoneOrJid)
  return openwa('/api/sessions/' + encodeURIComponent(sessionId) + '/messages/send-text', { method: 'POST', body: JSON.stringify({ chatId: id, text }) })
}
async function sendDocument(phoneOrJid, url, filename = 'Unique-Market-Receipt.pdf') {
  await setupOpenWA()
  const id = String(phoneOrJid || '').includes('@') ? String(phoneOrJid) : chatId(phoneOrJid)
  return openwa('/api/sessions/' + encodeURIComponent(sessionId) + '/messages/send-document', { method: 'POST', body: JSON.stringify({ chatId: id, url, filename, mimetype: 'application/pdf' }) })
}
async function markProcessed(key, messageId) {
  if (!key) return true
  try {
    const rows = await supabase('/whatsapp_openwa_processed_events', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ idempotency_key: key, message_id: messageId || null }) })
    return Array.isArray(rows) && rows.length > 0
  } catch (err) {
    if (/409|duplicate|unique/i.test(String(err?.message || err))) return false
    throw err
  }
}
async function getConversation(phone) {
  const rows = await supabase('/whatsapp_conversation_sessions?phone=eq.' + encodeURIComponent(phone) + '&limit=1')
  return rows?.[0] || null
}
async function saveConversation(phone, step, state) {
  await supabase('/whatsapp_conversation_sessions?on_conflict=phone', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ phone, step, state, updated_at: new Date().toISOString() }) })
}
async function clearConversation(phone) {
  await supabase('/whatsapp_conversation_sessions?phone=eq.' + encodeURIComponent(phone), { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
}
async function findOrCreateCustomer(phone, name, location) {
  const existing = await supabase('/customers?select=id,name,mobile,company_name,address&mobile=eq.' + encodeURIComponent(phone) + '&limit=1')
  if (existing?.[0]?.id) {
    const patch = {}
    if (name && !existing[0].name) patch.name = name
    if (location) patch.address = location
    if (Object.keys(patch).length) await supabase('/customers?id=eq.' + encodeURIComponent(existing[0].id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) })
    return { ...existing[0], ...patch }
  }
  const rows = await supabase('/customers', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name: name || 'WhatsApp Customer', mobile: phone, address: location || null }) })
  return rows?.[0] || null
}
async function createComplaint(state, phone) {
  const customer = await findOrCreateCustomer(phone, state.name, state.location)
  const rows = await supabase('/complaints', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ customer_id: customer?.id || null, category: 'WhatsApp Service Request', service_type: 'Service', title: state.problem, description: state.problem, priority: state.priority || 'normal', status: 'open', location_text: state.location, address: state.location, latitude: state.latitude ?? null, longitude: state.longitude ?? null, customer_name: state.name, customer_phone: phone, company_name: state.company_name || null })
  })
  const complaint = rows?.[0]
  if (!complaint?.id) throw new Error('Complaint insert returned no id')
  return complaint
}
async function handleIncoming(payload) {
  const data = payload?.data || {}
  if (data.fromMe || data.isGroup) return
  const rawFrom = String(data.from || data.author || data.chatId || '').trim()
  if (!isPrivateChat(rawFrom)) return
  const phone = normalizePhone(data.senderPhone || rawFrom.split('@')[0])
  if (phone.length < 12) return
  const idempotencyKey = String(payload?.idempotencyKey || data.id || '').trim()
  if (!(await markProcessed(idempotencyKey, data.id))) return
  const text = String(data.body || '').trim()
  const type = String(data.type || '').toLowerCase()
  const loc = data.location || data.locationMessage || null
  const session = await getConversation(phone)
  let step = session?.step || 'menu'
  let state = session?.state || {}
  const normalized = text.toLowerCase()
  if (type === 'voice') { await sendText(phone, brand('🎤 Voice complaint received. Please type the problem in one short message, or call 7350060071.')); return }
  if (step === 'waiting_location' && loc) {
    const lat = Number(loc.latitude ?? loc.degreesLatitude), lng = Number(loc.longitude ?? loc.degreesLongitude)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      state.latitude = lat; state.longitude = lng; state.location = 'https://www.google.com/maps?q=' + lat + ',' + lng; step = 'priority'
      await saveConversation(phone, step, state)
      await sendText(phone, brand('✅ Current location received.\n\nPriority:\n1️⃣ Urgent\n2️⃣ Normal\n3️⃣ Low'))
      return
    }
  }
  if (/^(hi+|hello+|hey+|namaskar|menu|back|cancel|0)$/i.test(text)) { await clearConversation(phone); await sendText(phone, menu()); return }
  if (step === 'menu') {
    if (normalized === '1') {
      state = { problem: '', name: '', company_name: '', location: '', latitude: null, longitude: null, priority: 'normal' }
      await saveConversation(phone, 'problem', state)
      await sendText(phone, brand('🛠️ *SERVICE COMPLAINT*\n\nPlease type the CCTV/IT problem in one short message.\nExample: Camera offline / DVR not recording / CCTV not visible on mobile.')); return
    }
    if (normalized === '2') { await sendText(phone, brand('📷 *INSTANT CCTV QUOTE*\n\nOpen this form to submit your requirement:\n' + QUOTE_FORM_URL + '?phone=' + encodeURIComponent(phone))); return }
    if (normalized === '3') { await sendText(phone, brand('📷 *CCTV / SALES*\n\nSend camera quantity, brand, model or your requirement. Our team will prepare the quotation.')); return }
    if (normalized === '4') { await sendText(phone, brand('🔧 *AMC SERVICE*\n\nPlease send Customer/Company Name and Service Location. Our team will contact you.')); return }
    if (normalized === '5') { await sendText(phone, brand('💳 *PAYMENT QUERY*\n\nPlease send Invoice Number or Customer/Company Name. Our office team will check the status.')); return }
    if (normalized === '6') { await sendText(phone, brand('🧰 *MORE SERVICES*\n\nComputer/Laptop, Networking, CCTV installation, repair, AMC and IT services.\n\nCall 7350060071 for assistance.')); return }
    if (normalized === '7') { await sendText(phone, brand('👨‍💼 *TALK TO STAFF*\n\nYour request has been noted. Our team will contact you shortly.\n\n📞 7350060071')); return }
    await sendText(phone, menu()); return
  }
  if (step === 'problem') { if (!text) return; state.problem = text; await saveConversation(phone, 'name', state); await sendText(phone, brand('👤 *CUSTOMER / COMPANY NAME*\n\nPlease send your name or company name.')); return }
  if (step === 'name') { state.name = text; await saveConversation(phone, 'location', state); await sendText(phone, brand('📍 *SERVICE LOCATION*\n\n1️⃣ Share Current Location\n2️⃣ Type Address Manually')); return }
  if (step === 'location') {
    if (normalized === '1') { await saveConversation(phone, 'waiting_location', state); await sendText(phone, brand('📍 Now send your *Current Location* from WhatsApp → 📎 → Location → Send your current location.')); return }
    if (normalized === '2') { await saveConversation(phone, 'manual_location', state); await sendText(phone, brand('✍️ Please type the complete Service Address / Area.')); return }
    await sendText(phone, brand('Please select:\n1️⃣ Current Location\n2️⃣ Manual Address')); return
  }
  if (step === 'manual_location') { if (!text) return; state.location = text; await saveConversation(phone, 'priority', state); await sendText(phone, brand('⚡ *PRIORITY*\n\n1️⃣ Urgent\n2️⃣ Normal\n3️⃣ Low')); return }
  if (step === 'priority') {
    const priorityMap = { '1': 'urgent', '2': 'normal', '3': 'low', urgent: 'urgent', normal: 'normal', low: 'low' }
    state.priority = priorityMap[normalized] || 'normal'
    try {
      const complaint = await createComplaint(state, phone)
      await clearConversation(phone)
      const ticket = complaint.ticket_no || complaint.complaint_no || complaint.id
      await sendText(phone, brand('✅ *SERVICE REQUEST REGISTERED*\n\n🎫 *Complaint No:* ' + ticket + '\n👤 Customer: ' + state.name + '\n📍 Location: ' + state.location + '\n🛠️ Problem: ' + state.problem + '\n⚡ Priority: ' + state.priority + '\n\nOur service team will contact you shortly.\n\nType *menu* for Main Menu.'))
    } catch (err) {
      console.error('OpenWA complaint creation failed:', err)
      await clearConversation(phone)
      await sendText(phone, brand('⚠️ We could not register the complaint right now. Please try again or call 7350060071.'))
    }
    return
  }
  await clearConversation(phone); await sendText(phone, menu())
}
async function processNotificationEvents() {
  try {
    const cutoff = new Date(Date.now() - EVENT_MAX_AGE_HOURS * 3600 * 1000).toISOString()
    const rows = await supabase('/whatsapp_notification_events?select=id,complaint_id,phone,customer_phone,event_type,message,status,created_at&status=eq.pending&created_at=gte.' + encodeURIComponent(cutoff) + '&order=created_at.asc&limit=20')
    for (const event of rows || []) {
      try {
        const customerPhone = normalizePhone(event.customer_phone || event.phone)
        const recipients = []
        if (event.event_type === 'status_changed') { if (customerPhone) recipients.push(customerPhone) }
        else { if (WA_PHONE_NUMBER) recipients.push(WA_PHONE_NUMBER); if (customerPhone && customerPhone !== WA_PHONE_NUMBER) recipients.push(customerPhone) }
        const marker = String(event.message || '').match(/\[\[PDF_URL=(https?:\/\/[^\]]+)\]\]/i)
        if (marker?.[1] && customerPhone) await sendDocument(customerPhone, marker[1], 'Unique-Market-' + (event.complaint_id || 'Receipt') + '.pdf')
        const message = brand(String(event.message || '').replace(/\n?\[\[PDF_URL=https?:\/\/[^\]]+\]\]\s*$/i, ''))
        for (const recipient of [...new Set(recipients)]) if (recipient) await sendText(recipient, message)
        await supabase('/whatsapp_notification_events?id=eq.' + encodeURIComponent(event.id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString(), error_message: null }) })
      } catch (err) {
        await supabase('/whatsapp_notification_events?id=eq.' + encodeURIComponent(event.id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'failed', error_message: String(err?.message || err).slice(0, 500) }) }).catch(() => {})
        console.error('Notification event failed:', event.id, err)
      }
    }
  } catch (err) { console.error('Notification poll failed:', String(err?.message || err)) }
}
function verifyWebhook(raw, signature) {
  if (!OPENWA_WEBHOOK_SECRET) return true
  const sig = String(signature || '')
  if (!sig.startsWith('sha256=')) return false
  const expected = crypto.createHmac('sha256', OPENWA_WEBHOOK_SECRET).update(raw).digest('hex')
  const supplied = sig.slice(7)
  return /^[a-f0-9]{64}$/i.test(supplied) && crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'))
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0
    req.on('data', chunk => { size += chunk.length; if (size > 2 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return } chunks.push(chunk) })
    req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject)
  })
}
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') { res.writeHead(200, {'content-type':'application/json'}); res.end(JSON.stringify({ok:true,service:'unique-market-openwa-bridge',sessionId,sessionStatus,setupError:lastSetupError})); return }
    if (req.url === '/status') { const current = sessionId ? await openwa('/api/sessions/' + encodeURIComponent(sessionId)).catch(() => null) : null; res.writeHead(200, {'content-type':'application/json'}); res.end(JSON.stringify({ok:true,sessionId,sessionStatus:current?.status||sessionStatus,setupError:lastSetupError})); return }
    if (req.url === '/pairing-code' && req.method === 'POST') { await setupOpenWA(); const result = await openwa('/api/sessions/' + encodeURIComponent(sessionId) + '/pairing-code', {method:'POST',body:JSON.stringify({phoneNumber:WA_PHONE_NUMBER})}); res.writeHead(200, {'content-type':'application/json'}); res.end(JSON.stringify(result)); return }
    if (req.url === '/qr' && req.method === 'GET') { await setupOpenWA(); const result = await openwa('/api/sessions/' + encodeURIComponent(sessionId) + '/qr'); res.writeHead(200, {'content-type':'application/json'}); res.end(JSON.stringify(result)); return }
    if (req.url === '/webhook' && req.method === 'POST') {
      const raw = await readBody(req)
      if (!verifyWebhook(raw, req.headers['x-openwa-signature'])) { res.writeHead(401); res.end('invalid signature'); return }
      const payload = JSON.parse(raw.toString('utf8'))
      if (payload?.event === 'message.received') await handleIncoming(payload)
      res.writeHead(200, {'content-type':'application/json'}); res.end(JSON.stringify({ok:true})); return
    }
    res.writeHead(404); res.end('Not found')
  } catch (err) { console.error('Bridge request failed:', err); res.writeHead(500, {'content-type':'application/json'}); res.end(JSON.stringify({ok:false,error:String(err?.message||err)})) }
})
server.listen(PORT, '0.0.0.0', () => {
  console.log('Unique Market OpenWA bridge listening on ' + PORT)
  setupOpenWA().catch(() => {})
  setInterval(() => processNotificationEvents().catch(() => {}), EVENT_POLL_MS)
  setTimeout(() => processNotificationEvents().catch(() => {}), 1000)
})
