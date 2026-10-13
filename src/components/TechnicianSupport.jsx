import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const languages = [{ value: 'both', label: 'मराठी + English' }, { value: 'mr', label: 'मराठी' }, { value: 'en', label: 'English' }]

export default function TechnicianSupport({ profile, onBack }) {
  const isAdmin = profile?.role === 'admin'
  const [tab, setTab] = useState('kb')
  const [query, setQuery] = useState('')
  const [articles, setArticles] = useState([])
  const [manuals, setManuals] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ title: '', keywords: '', category: 'CCTV', problem: '', solution: '', language: 'both', verified: false, published: false })
  const [manualForm, setManualForm] = useState({ title: '', brand: '', model: '', category: 'CCTV', description: '', external_url: '', published: false })
  const [manualFile, setManualFile] = useState(null)
  const [sos, setSos] = useState({ complaint_id: '', customer_name: '', location_text: '', latitude: null, longitude: null, notes: '' })
  const [complaints, setComplaints] = useState([])
  const [saving, setSaving] = useState(false)

  async function loadAll() {
    if (!supabase) return
    setLoading(true); setMessage('')
    const [kbResult, manualResult] = await Promise.all([
      supabase.from('technician_kb_articles').select('*').order('updated_at', { ascending: false }).limit(300),
      supabase.from('tech_manuals').select('*').order('created_at', { ascending: false }).limit(300)
    ])
    if (kbResult.error || manualResult.error) {
      setMessage(kbResult.error?.message || manualResult.error?.message || 'Unable to load support data.')
    } else {
      setArticles(kbResult.data || [])
      setManuals(manualResult.data || [])
    }
    if (isAdmin) {
      const { data, error } = await supabase.from('technician_sos_alerts').select('*,technician:profiles!technician_sos_alerts_technician_id_fkey(full_name,phone),complaint:complaints(complaint_no,ticket_no)').order('created_at', { ascending: false }).limit(100)
      if (!error) setAlerts(data || [])
      else setMessage(error.message)
    }
    if (!isAdmin && profile?.id) {
      const { data } = await supabase.from('complaints').select('id,complaint_no,ticket_no,customer_name,location_text,address').eq('technician_id', profile.id).not('status', 'in', '(closed,cancelled)').order('created_at', { ascending: false }).limit(100)
      setComplaints(data || [])
    }
    setLoading(false)
  }
  useEffect(() => { loadAll() }, [profile?.id, isAdmin])

  const filteredArticles = useMemo(() => {
    const q = query.trim().toLowerCase()
    return articles.filter(a => (isAdmin || a.published) && (!q || [a.title, a.category, a.problem, a.solution, ...(a.keywords || [])].join(' ').toLowerCase().includes(q)))
  }, [articles, query, isAdmin])
  const filteredManuals = useMemo(() => {
    const q = query.trim().toLowerCase()
    return manuals.filter(m => (isAdmin || m.published) && (!q || [m.title, m.brand, m.model, m.category, m.description].join(' ').toLowerCase().includes(q)))
  }, [manuals, query, isAdmin])

  async function saveArticle(e) {
    e.preventDefault(); setSaving(true); setMessage('')
    const payload = { ...form, title: form.title.trim(), keywords: form.keywords.split(',').map(v => v.trim()).filter(Boolean), problem: form.problem.trim(), solution: form.solution.trim(), created_by: profile.id, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('technician_kb_articles').insert(payload)
    if (error) setMessage(error.message)
    else { setForm({ title: '', keywords: '', category: 'CCTV', problem: '', solution: '', language: 'both', verified: false, published: false }); setMessage('Knowledge Base article saved.'); await loadAll() }
    setSaving(false)
  }

  async function saveManual(e) {
    e.preventDefault(); setSaving(true); setMessage('')
    try {
      let file_path = null
      if (manualFile) {
        if (manualFile.type !== 'application/pdf' || manualFile.size > 15 * 1024 * 1024) throw new Error('Upload a PDF smaller than 15 MB.')
        file_path = `${profile.id}/${Date.now()}-${manualFile.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
        const { error: uploadError } = await supabase.storage.from('tech-manuals').upload(file_path, manualFile, { contentType: 'application/pdf', upsert: false })
        if (uploadError) throw uploadError
      }
      const payload = { ...manualForm, title: manualForm.title.trim(), file_path, external_url: manualForm.external_url.trim() || null, uploaded_by: profile.id, updated_at: new Date().toISOString() }
      const { error } = await supabase.from('tech_manuals').insert(payload)
      if (error) {
        if (file_path) await supabase.storage.from('tech-manuals').remove([file_path])
        throw error
      }
      setManualForm({ title: '', brand: '', model: '', category: 'CCTV', description: '', external_url: '', published: false }); setManualFile(null); setMessage('Manual saved.'); await loadAll()
    } catch (err) { setMessage(err.message || 'Unable to save manual.') }
    finally { setSaving(false) }
  }

  async function openManual(manual) {
    if (manual.external_url) { window.open(manual.external_url, '_blank', 'noopener,noreferrer'); return }
    if (!manual.file_path) return setMessage('No manual file is attached.')
    const { data, error } = await supabase.storage.from('tech-manuals').createSignedUrl(manual.file_path, 60 * 30)
    if (error) setMessage(error.message)
    else if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function captureLocation() {
    if (!navigator.geolocation) return setMessage('This device does not support location sharing.')
    setMessage('Requesting location permission…')
    navigator.geolocation.getCurrentPosition(
      pos => { setSos(s => ({ ...s, latitude: pos.coords.latitude, longitude: pos.coords.longitude, location_text: s.location_text || 'GPS location captured' })); setMessage('Location captured. Review the site details before sending SOS.') },
      err => setMessage(err.message || 'Location permission denied. You can enter the address manually.'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    )
  }

  async function sendSos(e) {
    e.preventDefault()
    if (!sos.notes.trim()) return setMessage('Please describe what help is needed.')
    setSaving(true); setMessage('')
    const selected = complaints.find(c => c.id === sos.complaint_id)
    const payload = { technician_id: profile.id, complaint_id: sos.complaint_id || null, customer_name: sos.customer_name.trim() || selected?.customer_name || null, location_text: sos.location_text.trim() || selected?.location_text || selected?.address || null, latitude: sos.latitude, longitude: sos.longitude, notes: sos.notes.trim() }
    const { error } = await supabase.from('technician_sos_alerts').insert(payload)
    if (error) setMessage(error.message)
    else { setSos({ complaint_id: '', customer_name: '', location_text: '', latitude: null, longitude: null, notes: '' }); setMessage('SOS saved. Admin and Senior Technician will be notified by WhatsApp.'); await loadAll() }
    setSaving(false)
  }

  async function updateAlert(id, status) {
    const patch = { status, updated_at: new Date().toISOString() }
    if (status === 'acknowledged') { patch.acknowledged_by = profile.id; patch.acknowledged_at = new Date().toISOString() }
    if (status === 'resolved') patch.resolved_at = new Date().toISOString()
    const { error } = await supabase.from('technician_sos_alerts').update(patch).eq('id', id)
    if (error) setMessage(error.message); else await loadAll()
  }

  return <section className='admin-panel technician-support'>
    <div className='panel-heading'><div><span className='badge'>TECHNICIAN SUPPORT</span><h2>KB Assistant & SOS</h2><p>Verified troubleshooting, field manuals and urgent expert help.</p></div><button className='secondary' type='button' onClick={onBack}>← Dashboard</button></div>
    {message && <p className={/saved|captured|notified/i.test(message) ? 'muted' : 'error'} role='status'>{message}</p>}
    <div className='admin-actions support-tabs'><button type='button' className={tab === 'kb' ? '' : 'secondary'} onClick={() => setTab('kb')}>Knowledge Base</button><button type='button' className={tab === 'manuals' ? '' : 'secondary'} onClick={() => setTab('manuals')}>Tech Manuals</button><button type='button' className={tab === 'sos' ? '' : 'secondary'} onClick={() => setTab('sos')}>{isAdmin ? 'SOS Alerts' : 'SOS / Call Expert'}</button></div>
    <label className='support-search'>Search support resources<input value={query} onChange={e => setQuery(e.target.value)} placeholder='Hikvision DVR offline, error code 3, HDD…' /></label>
    {loading && <p className='muted'>Loading support resources…</p>}
    {tab === 'kb' && <>
      {isAdmin && <form className='admin-form support-editor' onSubmit={saveArticle}><h3>Add Knowledge Base article</h3><label>Title<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required /></label><label>Keywords (comma separated)<input value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })} placeholder='Hikvision, DVR, offline, error code 3' /></label><label>Category<input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} required /></label><label>Problem / question<textarea rows='3' value={form.problem} onChange={e => setForm({ ...form, problem: e.target.value })} required /></label><label>Verified solution<textarea rows='5' value={form.solution} onChange={e => setForm({ ...form, solution: e.target.value })} required /></label><label>Language<select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}>{languages.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select></label><label className='support-check'><input type='checkbox' checked={form.verified} onChange={e => setForm({ ...form, verified: e.target.checked })} /> Verified by Admin</label><label className='support-check'><input type='checkbox' checked={form.published} onChange={e => setForm({ ...form, published: e.target.checked })} /> Publish to technicians and WhatsApp</label><button disabled={saving}>{saving ? 'Saving…' : 'Save KB article'}</button></form>}
      <div className='support-list'>{filteredArticles.map(a => <article className='support-card' key={a.id}><div className='support-card-heading'><h3>{a.title}</h3><span className='badge'>{a.verified ? 'VERIFIED' : 'UNVERIFIED'} · {a.published ? 'PUBLISHED' : 'DRAFT'}</span></div><p><strong>Problem:</strong> {a.problem}</p><p className='support-solution'><strong>Solution:</strong> {a.solution}</p><small>{a.category} · {a.keywords?.join(', ')}</small></article>)}{!filteredArticles.length && <p className='muted'>No matching Knowledge Base articles yet.</p>}</div>
    </>}
    {tab === 'manuals' && <>
      {isAdmin && <form className='admin-form support-editor' onSubmit={saveManual}><h3>Add technical manual</h3><label>Manual title<input value={manualForm.title} onChange={e => setManualForm({ ...manualForm, title: e.target.value })} required /></label><label>Brand<input value={manualForm.brand} onChange={e => setManualForm({ ...manualForm, brand: e.target.value })} placeholder='Hikvision, CP Plus, Hi-Focus…' /></label><label>Model<input value={manualForm.model} onChange={e => setManualForm({ ...manualForm, model: e.target.value })} /></label><label>Category<input value={manualForm.category} onChange={e => setManualForm({ ...manualForm, category: e.target.value })} required /></label><label>Description<input value={manualForm.description} onChange={e => setManualForm({ ...manualForm, description: e.target.value })} /></label><label>PDF manual (max 15 MB)<input type='file' accept='application/pdf,.pdf' onChange={e => setManualFile(e.target.files?.[0] || null)} /></label><label>Or external official URL<input type='url' value={manualForm.external_url} onChange={e => setManualForm({ ...manualForm, external_url: e.target.value })} placeholder='https://…' /></label><label className='support-check'><input type='checkbox' checked={manualForm.published} onChange={e => setManualForm({ ...manualForm, published: e.target.checked })} /> Publish manual</label><button disabled={saving}>{saving ? 'Saving…' : 'Save manual'}</button></form>}
      <div className='support-list'>{filteredManuals.map(m => <article className='support-card' key={m.id}><div className='support-card-heading'><h3>{m.title}</h3><span className='badge'>{m.published ? 'PUBLISHED' : 'DRAFT'}</span></div><p>{[m.brand, m.model, m.category].filter(Boolean).join(' · ')}</p>{m.description && <p>{m.description}</p>}<button type='button' onClick={() => openManual(m)}>Open manual</button></article>)}{!filteredManuals.length && <p className='muted'>No manuals found.</p>}</div>
    </>}
    {tab === 'sos' && <>
      {!isAdmin && <form className='admin-form support-editor' onSubmit={sendSos}><h3>Emergency field assistance</h3><p>Use SOS if the job is blocked or safety / urgent expert help is required.</p><label>Assigned complaint (optional)<select value={sos.complaint_id} onChange={e => { const c = complaints.find(x => x.id === e.target.value); setSos(s => ({ ...s, complaint_id: e.target.value, customer_name: c?.customer_name || s.customer_name, location_text: c?.location_text || c?.address || s.location_text })) }}><option value=''>Select complaint</option>{complaints.map(c => <option key={c.id} value={c.id}>{c.complaint_no || c.ticket_no} · {c.customer_name || 'Customer'}</option>)}</select></label><label>Customer / site name<input value={sos.customer_name} onChange={e => setSos({ ...sos, customer_name: e.target.value })} /></label><label>Site address<input value={sos.location_text} onChange={e => setSos({ ...sos, location_text: e.target.value })} placeholder='Enter address or area' /></label><button type='button' className='secondary' onClick={captureLocation}>Capture my GPS location</button>{sos.latitude != null && <p className='muted'>GPS captured: {sos.latitude.toFixed(5)}, {sos.longitude.toFixed(5)}</p>}<label>What help do you need?<textarea rows='4' value={sos.notes} onChange={e => setSos({ ...sos, notes: e.target.value })} required placeholder='e.g. DVR offline error, cable route blocked, need senior technician call' /></label><button disabled={saving}>{saving ? 'Sending SOS…' : '🚨 Send SOS to Admin + Senior Technician'}</button></form>}
      {isAdmin && <div className='support-list'>{alerts.map(a => <article className='support-card' key={a.id}><div className='support-card-heading'><h3>🚨 {a.technician?.full_name || 'Technician'} · {a.status.toUpperCase()}</h3><small>{new Date(a.created_at).toLocaleString('en-IN')}</small></div><p><strong>Customer:</strong> {a.customer_name || '—'} · <strong>Location:</strong> {a.location_text || '—'}</p><p>{a.notes}</p>{a.latitude != null && a.longitude != null && <p><a href={`https://www.google.com/maps?q=${a.latitude},${a.longitude}`} target='_blank' rel='noreferrer'>Open GPS location</a></p>}{a.complaint?.complaint_no && <p>Complaint: {a.complaint.complaint_no}</p>}<div className='admin-actions'><button type='button' className='secondary' onClick={() => updateAlert(a.id, 'acknowledged')}>Acknowledge</button><button type='button' onClick={() => updateAlert(a.id, 'resolved')}>Resolve</button></div></article>)}{!alerts.length && <p className='muted'>No SOS alerts yet.</p>}</div>}
    </>}
    <button type='button' className='secondary' onClick={loadAll}>Refresh</button>
  </section>
}
