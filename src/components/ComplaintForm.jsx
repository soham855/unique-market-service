import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ComplaintForm({ userId, onCreated }) {
  const [form, setForm] = useState({ title: '', description: '', category: 'cctv', priority: 'normal', address: '' })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  function update(key, value) { setForm((current) => ({ ...current, [key]: value })) }

  async function submit(event) {
    event.preventDefault(); setLoading(true); setMessage('')
    try {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()
      if (customerError) throw customerError
      if (!customer?.id) throw new Error('Customer profile is not linked. Please contact Unique Market admin.')

      const { data, error } = await supabase
        .from('complaints')
        .insert({ ...form, customer_id: customer.id })
        .select()
        .single()
      if (error) throw error
      setForm({ title: '', description: '', category: 'cctv', priority: 'normal', address: '' })
      setMessage(`Complaint created: ${data.id.slice(0, 8)}`)
      onCreated?.(data)
    } catch (error) { setMessage(error.message || 'Unable to create complaint') }
    finally { setLoading(false) }
  }

  return <form className="complaint-form" onSubmit={submit}>
    <h3>Raise a Service Complaint</h3>
    <input placeholder="Complaint title" value={form.title} onChange={(e) => update('title', e.target.value)} required />
    <textarea placeholder="Describe the issue" value={form.description} onChange={(e) => update('description', e.target.value)} rows="4" />
    <select value={form.category} onChange={(e) => update('category', e.target.value)}><option value="cctv">CCTV</option><option value="computer">Computer / IT</option><option value="network">Network</option><option value="other">Other</option></select>
    <select value={form.priority} onChange={(e) => update('priority', e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
    <input placeholder="Service address" value={form.address} onChange={(e) => update('address', e.target.value)} />
    {message && <p className="muted">{message}</p>}
    <button disabled={loading}>{loading ? 'Submitting…' : 'Submit Complaint'}</button>
  </form>
}
