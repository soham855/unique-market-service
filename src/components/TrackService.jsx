import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './TrackService.css'

const steps = [
  { key: 'open', label: 'Raised' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'technician_on_way', label: 'Technician On Way' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
]

function normalizeStatus(status) {
  if (status === 'resolved' || status === 'closed') return 'completed'
  return status || 'open'
}

export default function TrackService() {
  const [ticket, setTicket] = useState('')
  const [complaint, setComplaint] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function lookup(e) {
    e?.preventDefault()
    const value = ticket.trim().toUpperCase()
    if (!value) return setMessage('Enter your Complaint ID / Ticket No.')
    setLoading(true); setMessage(''); setComplaint(null)
    try {
      const { data, error } = await supabase.rpc('track_complaint', { p_ticket_no: value })
      if (error) throw error
      if (!data?.length) throw new Error('Complaint not found. Please check the Complaint ID.')
      setComplaint(data[0])
    } catch (error) { setMessage(error.message || 'Unable to track service') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (!complaint?.ticket_no) return
    const timer = setInterval(async () => {
      const { data } = await supabase.rpc('track_complaint', { p_ticket_no: complaint.ticket_no })
      if (data?.[0]) setComplaint(data[0])
    }, 15000)
    return () => clearInterval(timer)
  }, [complaint?.ticket_no])

  const current = normalizeStatus(complaint?.status)
  const currentIndex = Math.max(0, steps.findIndex(s => s.key === current))

  return <main className="track-service-page">
    <div className="track-service-card">
      <div className="track-hero">
        <span className="badge">UNIQUE MARKET • SERVICE TRACKING</span>
        <h1>Track Your Service</h1>
        <p>Enter your Complaint ID to see the latest service status in real time.</p>
      </div>
      <form className="track-form" onSubmit={lookup}>
        <input value={ticket} onChange={e => setTicket(e.target.value)} placeholder="Complaint ID e.g. UM-2627/01" autoCapitalize="characters" />
        <button disabled={loading}>{loading ? 'Checking…' : 'Track Service'}</button>
      </form>
      {message && <p className="error">{message}</p>}
      {complaint && <section className="track-result" aria-live="polite">
        <div className="track-summary"><div><small>COMPLAINT ID</small><strong>{complaint.ticket_no}</strong></div><div><small>CUSTOMER</small><strong>{complaint.customer_name || 'Customer'}</strong></div><div><small>LAST UPDATED</small><strong>{complaint.updated_at ? new Date(complaint.updated_at).toLocaleString('en-IN') : '—'}</strong></div></div>
        <div className="track-progress">{steps.map((step, index) => <div className={`track-step ${index < currentIndex ? 'done' : ''} ${index === currentIndex ? 'active' : ''}`} key={step.key}><span className="track-dot">{index < currentIndex ? '✓' : index + 1}</span><strong>{step.label}</strong></div>)}</div>
        <div className="track-current"><span>Current Status</span><strong>{steps[currentIndex]?.label || 'Raised'}</strong><p>This status updates automatically when the service team changes the complaint stage.</p></div>
        <div className="track-details"><div><small>Issue</small><strong>{complaint.title || complaint.description || 'Service Complaint'}</strong></div><div><small>Category</small><strong>{complaint.category || '—'}</strong></div><div><small>Priority</small><strong>{complaint.priority || 'Normal'}</strong></div></div>
      </section>}
      <button className="secondary track-back" onClick={() => { window.location.href = '/' }}>← Back to Website</button>
    </div>
  </main>
}
