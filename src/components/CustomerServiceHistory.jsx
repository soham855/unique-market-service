import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function CustomerServiceHistory({ profile }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))

  async function load() {
    if (!profile?.id) return
    setLoading(true); setError('')
    const { data, error: queryError } = await supabase.from('complaints')
      .select('id,ticket_no,title,description,category,status,priority,technician_id,created_at,updated_at')
      .eq('customer_id', profile.id).order('created_at', { ascending: false })
    if (queryError) setError(queryError.message); else setItems(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [profile?.id])

  const counts = useMemo(() => items.reduce((m, x) => {
    const d = (x.created_at || x.updated_at || '').slice(0, 10); if (d) m[d] = (m[d] || 0) + 1; return m
  }, {}), [items])
  const days = useMemo(() => {
    const y = month.getFullYear(), m = month.getMonth(), first = new Date(y, m, 1).getDay(), total = new Date(y, m + 1, 0).getDate()
    return [...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)]
  }, [month])
  const selected = items.filter(x => (x.created_at || x.updated_at || '').slice(0, 10) === selectedDate)

  return <section className="complaints-panel">
    <div className="panel-heading"><div><span className="badge">SERVICE DESK</span><h2>Service History</h2><p>View your service records by date.</p></div><button className="secondary" onClick={load}>Refresh</button></div>
    {loading && <p className="muted">Loading service history…</p>}
    {error && <p className="error">{error}</p>}
    {!loading && !error && <>
      <div className="calendar" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button className="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
          <strong>{month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</strong>
          <button className="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, textAlign: 'center' }}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <small key={d}>{d}</small>)}
          {days.map((d, i) => d ? <button key={d} className="secondary" style={{ fontWeight: counts[d] ? 700 : 400, border: d === selectedDate ? '2px solid currentColor' : undefined }} onClick={() => setSelectedDate(d)}>{Number(d.slice(-2))}{counts[d] ? ` · ${counts[d]}` : ''}</button> : <span key={`empty-${i}`} />)}
        </div>
      </div>
      <h3>{new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</h3>
      {selected.length === 0 ? <p className="muted">No service record on this date.</p> : <div className="complaint-list">{selected.map(item => <article className="complaint-card" key={item.id}><h3>{item.ticket_no || item.title || 'Service Complaint'}</h3><p>{item.description || 'No additional details provided.'}</p><small>{item.category || 'Service'}{item.priority ? ` · ${item.priority}` : ''}</small><p><strong>Status:</strong> {String(item.status || 'new').replaceAll('_', ' ')}</p></article>)}</div>}
    </>}
  </section>
}
