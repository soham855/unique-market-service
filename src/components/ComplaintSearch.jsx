import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ComplaintSearch({ profile, onBack }) {
  const [type, setType] = useState('name')
  const [value, setValue] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function search(e) {
    e?.preventDefault()
    setLoading(true); setMessage(''); setItems([])
    try {
      if (type !== 'date' && !value.trim()) throw new Error('Enter a search value.')
      if (type === 'date' && !fromDate) throw new Error('Select a date.')
      if (type === 'date' && toDate && toDate < fromDate) throw new Error('To date cannot be before From date.')
      let q = supabase.from('complaints').select('*').order('created_at', { ascending: false })
      if (profile?.role === 'technician') q = q.eq('technician_id', profile.id)
      if (type === 'name') q = q.ilike('customer_name', `%${value.trim()}%`)
      if (type === 'code') q = q.ilike('ticket_no', `%${value.trim().toUpperCase()}%`)
      if (type === 'date') {
        q = q.gte('created_at', `${fromDate}T00:00:00`)
        q = q.lte('created_at', `${toDate || fromDate}T23:59:59`)
      }
      const { data, error } = await q.limit(100)
      if (error) throw error
      if (!data?.length) throw new Error('No complaint found.')
      setItems(data)
    } catch (err) { setMessage(err.message || 'Unable to search complaint') }
    finally { setLoading(false) }
  }

  return <section className="complaints-panel">
    <div className="panel-heading"><div><span className="badge">SERVICE DESK</span><h2>Find Complaint</h2><p>Search by Party Name, Complaint Code or Date</p></div><button className="secondary" onClick={onBack}>← Dashboard</button></div>
    <form className="complaint-form" onSubmit={search}>
      <select value={type} onChange={e => { setType(e.target.value); setValue(''); setFromDate(''); setToDate(''); setMessage(''); setItems([]) }}>
        <option value="name">Party / Customer Name</option>
        <option value="code">Complaint Code</option>
        <option value="date">Date-wise Search</option>
      </select>
      {type !== 'date' ? <input value={value} onChange={e => setValue(e.target.value)} placeholder={type === 'name' ? 'Enter Party / Customer Name' : 'Enter Complaint Code (C/NO-1)'} /> : <><input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /><input type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></>}
      <button disabled={loading}>{loading ? 'Searching…' : 'Find Complaint'}</button>
    </form>
    {message && <p className="error">{message}</p>}
    {items.map(item => <article className="complaint-card" key={item.id}><div><h3>{item.ticket_no}</h3><p><strong>{item.customer_name || 'Service Complaint'}</strong>{item.company_name ? ` · ${item.company_name}` : ''}</p><p>{item.description || 'No description'}</p><small>{item.customer_phone || ''}{item.category ? ` · ${item.category}` : ''}{item.priority ? ` · ${item.priority}` : ''}</small><p><strong>Status:</strong> {item.status?.replaceAll('_',' ') || 'New'}</p><p><strong>Address:</strong> {item.location_text || item.address || '—'}</p></div></article>)}
  </section>
}
