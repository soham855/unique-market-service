import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const GOOGLE_REVIEW_URL = 'https://g.page/r/CWY_3B12wn32EBI/review'

export default function CustomerServiceHistory({ profile }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [customerId, setCustomerId] = useState(null)
  const [feedback, setFeedback] = useState({})
  const [feedbackRating, setFeedbackRating] = useState({})
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackError, setFeedbackError] = useState('')
  const [savingFeedback, setSavingFeedback] = useState(null)

  async function load() {
    if (!profile?.id) return
    setLoading(true); setError('')
    const { data: customer, error: customerError } = await supabase.from('customers').select('id').eq('profile_id', profile.id).maybeSingle()
    if (customerError) { setError(customerError.message); setLoading(false); return }
    if (!customer) { setItems([]); setCustomerId(null); setLoading(false); return }
    setCustomerId(customer.id)
    const { data: feedbackRows } = await supabase.from('service_feedback').select('complaint_id,rating').eq('customer_id', customer.id)
    setFeedback(Object.fromEntries((feedbackRows || []).map(row => [row.complaint_id, row.rating])))
    const { data, error: queryError } = await supabase.from('complaints').select('id,ticket_no,complaint_no,title,description,category,status,priority,technician_id,created_at,updated_at,completed_at')
      .eq('customer_id', customer.id).order('created_at', { ascending: false })
    if (queryError) setError(queryError.message); else setItems(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [profile?.id])

  const counts = useMemo(() => items.reduce((m, x) => { const d = (x.completed_at || x.updated_at || x.created_at || '').slice(0, 10); if (d) m[d] = (m[d] || 0) + 1; return m }, {}), [items])
  const days = useMemo(() => { const y = month.getFullYear(), m = month.getMonth(), first = new Date(y, m, 1).getDay(), total = new Date(y, m + 1, 0).getDate(); return [...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)] }, [month])
  const selected = items.filter(x => (x.completed_at || x.updated_at || x.created_at || '').slice(0, 10) === selectedDate)

  return <section className="complaints-panel">
    <div className="panel-heading"><div><span className="badge">SERVICE DESK</span><h2>Service History</h2><p>View your service records by date.</p></div><button type="button" className="secondary" onClick={load}>Refresh</button></div>
    {loading && <p className="muted">Loading service history…</p>}
    {error && <p className="error">{error}</p>}
    {!loading && !error && <>
      <div className="calendar" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><button type="button" className="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><strong>{month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</strong><button type="button" className="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, textAlign: 'center' }}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <small key={d}>{d}</small>)}{days.map((d, i) => d ? <button type="button" key={d} className="secondary" style={{ fontWeight: counts[d] ? 700 : 400, border: d === selectedDate ? '2px solid currentColor' : undefined }} onClick={() => setSelectedDate(d)}>{Number(d.slice(-2))}{counts[d] ? ` · ${counts[d]}` : ''}</button> : <span key={`empty-${i}`} />)}</div>
      </div>
      <h3>{new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</h3>
      {selected.length === 0 ? <p className="muted">No service record on this date.</p> : <div className="complaint-list">{selected.map(item => { const completed = ['resolved','closed','completed'].includes(String(item.status || '').toLowerCase()); return <article className="complaint-card" key={item.id}><h3>{item.complaint_no || item.ticket_no || item.title || 'Service Complaint'}</h3><p>{item.description || 'No additional details provided.'}</p><small>{item.category || 'Service'}{item.priority ? ` · ${item.priority}` : ''}</small><p><strong>Status:</strong> {String(item.status || 'new').replaceAll('_', ' ')}</p>{completed && <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid currentColor' }}><strong>Service Feedback ⭐</strong><p className="muted">Select your rating for this completed service.</p><div style={{ display: 'flex', gap: 6, margin: '8px 0 12px' }}>{[1,2,3,4,5].map(star => <button key={star} type="button" aria-label={`${star} star`} onClick={() => setFeedbackRating(prev => ({ ...prev, [item.id]: star }))} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 30, padding: 0, opacity: star <= (feedbackRating[item.id] || feedback[item.id] || 0) ? 1 : 0.3 }}>★</button>)}</div><button type="button" className="primary" disabled={!feedbackRating[item.id] || savingFeedback === item.id} onClick={async () => { setSavingFeedback(item.id); setFeedbackError(''); const rating = feedbackRating[item.id]; const { error: saveError } = await supabase.from('service_feedback').upsert({ complaint_id: item.id, customer_id: customerId, rating, updated_at: new Date().toISOString() }, { onConflict: 'complaint_id' }); if (saveError) setFeedbackError(saveError.message); else { setFeedback(prev => ({ ...prev, [item.id]: rating })); setFeedbackMessage('Feedback saved. Thank you!'); window.open(GOOGLE_REVIEW_URL, '_blank', 'noopener,noreferrer') } setSavingFeedback(null) }}> {savingFeedback === item.id ? 'Saving…' : 'Submit & Continue to Google'} </button>{feedbackMessage && <p className="muted">{feedbackMessage}</p>}{feedbackError && <p className="error">{feedbackError}</p>}</div>}</article> })}</div>}
    </>}
  </section>
}
