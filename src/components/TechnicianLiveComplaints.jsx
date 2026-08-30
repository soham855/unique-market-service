import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { subscribeToComplaints } from '../lib/realtime'

const statuses = ['open','assigned','in_progress','on_hold','resolved','closed','cancelled']

export default function TechnicianLiveComplaints({ profile, onBack }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [live, setLive] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setMessage('')
    let query = supabase.from('complaints').select('id,complaint_no,title,description,category,priority,status,location_text,created_at,updated_at,customer_id,technician_id,customer_name,customer_phone,company_name').order('created_at', { ascending: false })
    const { data, error } = await query
    if (error) { setMessage(error.message); return }
    setItems(data || [])
  }

  useEffect(() => {
    load()
    const unsubscribe = subscribeToComplaints(() => { setLive(true); load() })
    return unsubscribe
  }, [])

  async function updateStatus(id, value) {
    const { error } = await supabase.from('complaints').update({ status:value, updated_at:new Date().toISOString() }).eq('id', id)
    if (error) setMessage(error.message)
    else load()
  }

  const filtered = items.filter(item => {
    const q = search.trim().toLowerCase()
    const matchesSearch = !q || [item.complaint_no,item.customer_name,item.customer_phone,item.company_name,item.title,item.location_text].some(v => String(v || '').toLowerCase().includes(q))
    return matchesSearch && (status === 'all' || item.status === status)
  })

  return <section className='role-dashboard'>
    <button className='secondary' type='button' onClick={onBack}>← Back to Dashboard</button>
    <div className='panel-heading'>
      <div><span className='badge'>TECHNICIAN SERVICE DESK</span><h2>Live Complaints</h2><p>All service complaints are visible here. Search by Complaint No., customer or mobile.</p></div>
      <div><span className={live ? 'status' : 'status offline'}>{live ? 'LIVE' : 'SYNC'}</span> <button className='secondary' onClick={load}>Refresh</button></div>
    </div>
    <div className='complaint-toolbar'>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search C/NO-1, customer, mobile...' />
      <select value={status} onChange={e=>setStatus(e.target.value)}><option value='all'>All Status</option>{statuses.map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select>
    </div>
    {message && <p className='error'>{message}</p>}
    <div className='modules'>
      {filtered.map(item => <article className='module-card' key={item.id}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><strong>{item.complaint_no || 'Complaint'}</strong><span className='status'>{String(item.status || 'open').replaceAll('_',' ')}</span></div>
        <h3>{item.title || item.description || 'Service Complaint'}</h3>
        <p><b>Customer:</b> {item.customer_name || '—'} · {item.customer_phone || '—'}</p>
        {item.company_name && <p><b>Company:</b> {item.company_name}</p>}
        <p><b>Category:</b> {item.category || '—'} · <b>Priority:</b> {item.priority || 'normal'}</p>
        <p><b>Address:</b> {item.location_text || '—'}</p>
        <p style={{whiteSpace:'pre-wrap'}}>{item.description || 'No description'}</p>
        <select value={item.status || 'open'} onChange={e=>updateStatus(item.id,e.target.value)}>{statuses.map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select>
      </article>)}
      {!filtered.length && <article className='module-card'><h3>No complaints found</h3><p>New complaints will appear here automatically when the service desk receives them.</p></article>}
    </div>
  </section>
}
