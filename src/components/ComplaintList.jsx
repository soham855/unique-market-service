import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ComplaintList({ userId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (customerError || !customer?.id) {
      setItems([])
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('complaints')
      .select('id,ticket_no,title,status,priority,category,created_at')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })

    setItems(error ? [] : (data || []))
    setLoading(false)
  }

  useEffect(() => { load() }, [userId])

  return <section className="complaint-list"><div className="section-heading"><h3>My Complaints</h3><button className="secondary" onClick={load}>Refresh</button></div>
    {loading ? <p className="muted">Loading complaints…</p> : items.length === 0 ? <p className="muted">No complaints yet.</p> : items.map((item) => <article key={item.id}><div><strong>{item.ticket_no || item.title}</strong><small>{item.title} • {item.category} • {item.priority}</small></div><span className="status">{item.status.replace('_', ' ')}</span></article>)}
  </section>
}
