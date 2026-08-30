import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function CustomerServiceHistory({ profile }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    if (!supabase || !profile?.id) return
    setLoading(true); setError('')
    const { data, error: queryError } = await supabase
      .from('complaints')
      .select('id,ticket_no,title,description,category,status,priority,technician_id,created_at,updated_at')
      .eq('customer_id', profile.id)
      .order('created_at', { ascending: false })
    if (queryError) setError(queryError.message)
    else setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [profile?.id])

  return <section className="complaints-panel">
    <div className="panel-heading">
      <div><span className="badge">SERVICE DESK</span><h2>Service History</h2><p>Your previous service requests and their current records.</p></div>
      <button className="secondary" onClick={load}>Refresh</button>
    </div>
    {loading && <p className="muted">Loading service history…</p>}
    {error && <p className="error">{error}</p>}
    {!loading && !error && items.length === 0 && <p className="muted">No service history found.</p>}
    {!loading && !error && items.length > 0 && <div className="complaint-list">{items.map(item => <article className="complaint-card" key={item.id}>
      <div>
        <h3>{item.ticket_no || item.title || 'Service Complaint'}</h3>
        <p>{item.description || 'No additional details provided.'}</p>
        <small>{item.category || 'Service'}{item.priority ? ` · ${item.priority}` : ''}{item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ''}</small>
        <p><strong>Status:</strong> {String(item.status || 'new').replaceAll('_',' ')}</p>
      </div>
    </article>)}</div>}
  </section>
}
