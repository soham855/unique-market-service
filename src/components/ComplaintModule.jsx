import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { subscribeToComplaints } from '../lib/realtime'

const statuses = ['open','assigned','in_progress','on_hold','resolved','closed','cancelled']
const attachmentTypes = ['image/*','video/*','audio/*']

export default function ComplaintModule({ profile }) {
  const [items, setItems] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [form, setForm] = useState({ title:'', description:'', category:'cctv', priority:'normal', address:'' })
  const [files, setFiles] = useState([])
  const [recording, setRecording] = useState(false)
  const [message, setMessage] = useState('')
  const [live, setLive] = useState(false)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const isAdmin = profile?.role === 'admin'
  const isTechnician = profile?.role === 'technician'

  async function load() {
    if (!supabase) return
    let query = supabase.from('complaints').select('id,title,description,category,priority,status,address,created_at,customer_id,technician_id').order('created_at', { ascending:false })
    if (profile?.role === 'customer') query = query.eq('customer_id', profile.id)
    if (profile?.role === 'technician') query = query.eq('technician_id', profile.id)
    const { data, error } = await query
    if (error) setMessage(error.message); else setItems(data || [])
    if (isAdmin) {
      const result = await supabase.from('profiles').select('id,full_name,phone').eq('role','technician').order('full_name')
      if (!result.error) setTechnicians(result.data || [])
    }
  }
  useEffect(() => { load(); const unsubscribe = subscribeToComplaints(() => { setLive(true); load() }); return unsubscribe }, [profile?.id, profile?.role])

  async function uploadAttachments(complaintId, selectedFiles) {
    for (const file of selectedFiles) {
      const safeName = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const path = `${profile.id}/${complaintId}/${safeName}`
      const { error } = await supabase.storage.from('complaint-attachments').upload(path, file, { contentType:file.type, upsert:false })
      if (error) throw error
      const { error: metaError } = await supabase.from('complaint_attachments').insert({ complaint_id:complaintId, uploaded_by:profile.id, storage_path:path, file_name:file.name, mime_type:file.type, size_bytes:file.size })
      if (metaError) throw metaError
    }
  }

  async function createComplaint(e) {
    e.preventDefault(); setMessage('')
    try {
      const { data, error } = await supabase.from('complaints').insert({ ...form, customer_id: profile.id }).select('id').single()
      if (error) throw error
      if (files.length) await uploadAttachments(data.id, files)
      setMessage('Complaint raised successfully'); setForm({ title:'',description:'',category:'cctv',priority:'normal',address:'' }); setFiles([]); e.target.reset(); load()
    } catch (error) { setMessage(error.message || 'Unable to submit complaint') }
  }

  async function startVoice() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return setMessage('Voice recording is not supported on this device/browser.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true })
      chunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = () => { const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }); setFiles(prev => [...prev, new File([blob], `voice-${Date.now()}.webm`, { type:blob.type })]); stream.getTracks().forEach(track => track.stop()) }
      recorder.start(); setRecording(true); setMessage('Recording voice complaint… tap Stop when finished.')
    } catch (error) { setMessage(error.message || 'Microphone permission denied') }
  }
  function stopVoice() { recorderRef.current?.stop(); setRecording(false) }

  async function updateComplaint(id, changes) {
    const { error } = await supabase.from('complaints').update({ ...changes, updated_at:new Date().toISOString() }).eq('id',id)
    if (error) setMessage(error.message); else load()
  }

  return <section className="complaints-panel">
    <div className="panel-heading"><div><span className="badge">SERVICE DESK</span><h2>Complaint Management</h2><p>Raise, assign and track service complaints.</p></div><div><span className={live ? 'status' : 'status offline'}>{live ? 'LIVE' : 'SYNC'}</span> <button className="secondary" onClick={load}>Refresh</button></div></div>
    {profile?.role === 'customer' && <form className="complaint-form" onSubmit={createComplaint}>
      <input placeholder="Complaint title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required />
      <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option value="cctv">CCTV</option><option value="computer">Computer</option><option value="network">Network</option><option value="other">Other</option></select>
      <select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
      <input placeholder="Service address" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} required />
      <textarea placeholder="Describe the issue" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows="4" />
      <label>Photo / Video / Voice<input type="file" accept={attachmentTypes.join(',')} multiple onChange={e=>setFiles(Array.from(e.target.files || []))} /></label>
      <div><button type="button" className="secondary" onClick={recording ? stopVoice : startVoice}>{recording ? 'Stop Voice Recording' : '🎤 Record Voice Complaint'}</button>{files.length > 0 && <small>{files.length} attachment(s) selected</small>}</div>
      <button>Raise Complaint</button>
    </form>}
    {message && <p className="muted">{message}</p>}
    <div className="complaint-list">{items.length === 0 ? <p className="muted">No complaints found.</p> : items.map(item => <article className="complaint-card" key={item.id}>
      <div><h3>{item.title}</h3><p>{item.description || 'No description'}</p><small>{item.category} · {item.priority} · {new Date(item.created_at).toLocaleString()}</small></div>
      <div className="complaint-actions"><strong>{item.status.replace('_',' ')}</strong>
        {isAdmin && <><select value={item.technician_id || ''} onChange={e=>updateComplaint(item.id,{technician_id:e.target.value || null,status:e.target.value ? 'assigned' : 'open'})}><option value="">Unassigned</option>{technicians.map(t=><option key={t.id} value={t.id}>{t.full_name || t.phone || t.id.slice(0,8)}</option>)}</select><select value={item.status} onChange={e=>updateComplaint(item.id,{status:e.target.value})}>{statuses.map(s=><option key={s}>{s}</option>)}</select></>}
        {isTechnician && <select value={item.status} onChange={e=>updateComplaint(item.id,{status:e.target.value})}>{['assigned','in_progress','on_hold','resolved'].map(s=><option key={s}>{s}</option>)}</select>}
      </div>
    </article>)}</div>
  </section>
}
