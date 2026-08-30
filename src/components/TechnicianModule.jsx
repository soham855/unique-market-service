import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const statusOptions = ['assigned','in_progress','on_hold','resolved','closed']

export default function TechnicianModule({ profile, mode = 'assigned', onBack }) {
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  async function load(search = '') {
    setLoading(true); setMessage('')
    let q = supabase.from('complaints').select('id,complaint_no,title,description,category,priority,status,location_text,created_at,customer_name,customer_phone,company_name,technician_id').eq('technician_id', profile.id).order('created_at', { ascending:false })
    if (search.trim()) {
      const value = search.trim().replace(/,/g, '')
      q = q.or(`complaint_no.ilike.%${value}%,title.ilike.%${value}%,customer_name.ilike.%${value}%`)
    }
    const { data, error } = await q
    if (error) setMessage(error.message); else setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { if (supabase && profile?.id) load() }, [profile?.id])

  async function updateStatus(id, status) {
    setMessage('')
    const { error } = await supabase.from('complaints').update({ status, updated_at:new Date().toISOString() }).eq('id', id).eq('technician_id', profile.id)
    if (error) setMessage(error.message); else load(query)
  }

  function displayNo(item) {
    return item.complaint_no || `C/NO-${item.ticket_number || item.id}`
  }

  return <section className='complaints-panel'>
    <div className='panel-heading'>
      <div><span className='badge'>TECHNICIAN DESK</span><h2>{mode === 'find' ? 'Find Complaint' : 'My Assigned Complaints'}</h2><p>{mode === 'find' ? 'Search your assigned service complaint by Complaint No.' : 'Live assigned service calls and complaint status.'}</p></div>
      <button className='secondary' type='button' onClick={onBack}>← Back</button>
    </div>
    <div className='search-row' style={{display:'flex',gap:8,margin:'18px 0',flexWrap:'wrap'}}>
      <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')load(query)}} placeholder='Search Complaint No. e.g. C/NO-1' />
      <button type='button' onClick={()=>load(query)}>Find</button>
      <button type='button' className='secondary' onClick={()=>{setQuery('');load('')}}>All Assigned</button>
    </div>
    {message && <p className='error'>{message}</p>}
    {loading ? <p>Loading live complaints…</p> : items.length === 0 ? <div className='module-card'><h3>No assigned complaints found</h3><p>New complaints assigned to you will appear here automatically.</p></div> : <div className='modules'>
      {items.map(item=><article className='module-card' key={item.id}>
        <span className='status'>{displayNo(item)}</span>
        <h3>{item.title || item.description || 'Service Complaint'}</h3>
        <p><strong>Customer:</strong> {item.customer_name || '—'} · {item.customer_phone || '—'}</p>
        <p><strong>Company:</strong> {item.company_name || '—'}</p>
        <p><strong>Category:</strong> {item.category || '—'} · <strong>Priority:</strong> {item.priority || 'normal'}</p>
        <p><strong>Address:</strong> {item.location_text || '—'}</p>
        <p>{item.description || 'No additional description.'}</p>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <select value={item.status || 'assigned'} onChange={e=>updateStatus(item.id,e.target.value)}>{statusOptions.map(s=><option key={s} value={s}>{s.replaceAll('_',' ').toUpperCase()}</option>)}</select>
          <small>{new Date(item.created_at).toLocaleString('en-IN')}</small>
        </div>
      </article>)}
    </div>}
  </section>
}
