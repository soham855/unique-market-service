import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const statuses = [
  ['new', 'New Request'],
  ['reviewing', 'Under Review'],
  ['contacted', 'Customer Contacted'],
  ['quoted', 'Quotation Sent'],
  ['won', 'Confirmed / Won'],
  ['lost', 'Closed / Lost'],
]
const money = value => value === null || value === undefined || value === '' ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value))
const dateTime = value => value ? new Date(value).toLocaleString('en-IN') : '—'
const digits = value => String(value || '').replace(/\D/g, '')

export default function QuoteLeadModule({ onBack }) {
  const [rows, setRows] = useState([])
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  async function load() {
    if (!supabase) { setMessage('Database connection is not configured.'); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase.from('whatsapp_quote_leads').select('*').order('created_at', { ascending: false }).limit(500)
    if (error) setMessage('Unable to load quote requests: ' + error.message)
    else {
      setRows(data || [])
      setDrafts(Object.fromEntries((data || []).map(row => [row.id, {
        status: row.status || 'new',
        quoted_amount: row.quoted_amount == null ? '' : String(row.quoted_amount),
        quotation_reference: row.quotation_reference || '',
        admin_notes: row.admin_notes || '',
      }])))
      setMessage('')
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase?.channel('admin-quote-leads-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_quote_leads' }, () => load())
      .subscribe()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [])

  function edit(id, field, value) {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function save(row) {
    const draft = drafts[row.id]
    if (!draft) return
    const amount = draft.quoted_amount.trim() === '' ? null : Number(draft.quoted_amount)
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      setMessage('Enter a valid quotation amount for ' + (row.customer_name || row.phone))
      return
    }
    setSaving(row.id)
    setMessage('')
    const now = new Date().toISOString()
    const patch = {
      status: draft.status,
      quoted_amount: amount,
      quotation_reference: draft.quotation_reference.trim() || null,
      admin_notes: draft.admin_notes.trim() || null,
      updated_at: now,
    }
    if (draft.status === 'reviewing' && !row.reviewed_at) patch.reviewed_at = now
    if (draft.status === 'contacted' && !row.contacted_at) patch.contacted_at = now
    if (draft.status === 'quoted' && !row.quoted_at) patch.quoted_at = now
    const { error } = await supabase.from('whatsapp_quote_leads').update(patch).eq('id', row.id)
    if (error) setMessage('Save failed: ' + error.message)
    else {
      setMessage('✅ Quote request updated for ' + (row.customer_name || row.phone) + '.')
      await load()
    }
    setSaving('')
  }

  const visible = useMemo(() => rows.filter(row => {
    const d = drafts[row.id] || {}
    if (filter !== 'all' && (d.status || row.status || 'new') !== filter) return false
    const text = [row.customer_name, row.company_name, row.phone, row.location, row.id, row.quotation_reference].join(' ').toLowerCase()
    return text.includes(query.trim().toLowerCase())
  }), [rows, drafts, filter, query])
  const count = status => rows.filter(row => (drafts[row.id]?.status || row.status || 'new') === status).length

  return <section className="complaints-panel">
    <div className="panel-heading">
      <div><span className="badge">SALES DESK</span><h2>CCTV Quote Requests</h2><p>Review incoming WhatsApp and web-form requirements, prepare pricing, and track quotation follow-up.</p></div>
      <div><button className="secondary" type="button" onClick={onBack}>← Back</button> <button className="secondary" type="button" onClick={load}>Refresh</button></div>
    </div>
    {message && <p role="status" className="muted">{message}</p>}
    <div className="admin-stats" style={{ marginBottom: 16 }}>
      {[['All Requests', rows.length], ['New', count('new')], ['Under Review', count('reviewing')], ['Quoted', count('quoted')]].map(([label, value]) =>
        <div className="dashboard-stat-card" key={label}><div><strong>{value}</strong><span>{label}</span></div></div>
      )}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) minmax(150px,220px)', gap: 10, marginBottom: 16 }}>
      <input aria-label="Search quote requests" placeholder="Search name, phone, company or location" value={query} onChange={e => setQuery(e.target.value)} />
      <select aria-label="Filter quote status" value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">All statuses</option>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    {loading ? <p className="muted">Loading quote requests…</p> : visible.length === 0 ? <p className="muted">No quote requests match this filter.</p> :
      <div className="complaint-list">{visible.map(row => {
        const draft = drafts[row.id] || { status: row.status || 'new', quoted_amount: '', quotation_reference: '', admin_notes: '' }
        const phone = digits(row.phone)
        const cameras = Number(row.total_cameras ?? Number(row.dome_2mp_qty || 0) + Number(row.bullet_2mp_qty || 0))
        const whatsappText = 'Hello ' + (row.customer_name || 'Customer') + ', this is Unique Market regarding your CCTV quotation request. Please contact us at 7350060071 if you need any clarification.'
        return <article className="complaint-card" key={row.id}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3>{row.customer_name || 'Customer'}{row.company_name ? ' · ' + row.company_name : ''}</h3>
            <p style={{ margin: '6px 0' }}>📞 {row.phone || 'No phone'} · 📍 {row.location || 'Location not provided'}</p>
            <small>Request ID: {String(row.id).slice(0, 8).toUpperCase()} · Received: {dateTime(row.created_at)}</small>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: 8, margin: '14px 0' }}>
              {[
                ['2MP IP Dome', row.dome_2mp_qty ?? 0],
                ['2MP IP Bullet', row.bullet_2mp_qty ?? 0],
                ['Total Cameras', cameras],
                ['DVR / NVR', row.nvr_channel || 'Not selected'],
                ['HDD', row.hdd || 'Not selected'],
                ['Power Supply', row.power_supply || 'Not selected'],
                ['Cat6 90m Bundles', row.cable_90m_bundles ?? 0],
                ['Connectors', row.connector_qty ?? cameras * 3],
                ['Remote View', row.router || 'Not selected'],
                ['Installation Qty', row.installation_camera_qty ?? cameras],
              ].map(([label, value]) => <div key={label} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 9, background: '#fafafa' }}><small style={{ display: 'block', opacity: .65 }}>{label}</small><strong>{value}</strong></div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
              <label>Status<select value={draft.status} onChange={e => edit(row.id, 'status', e.target.value)}>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Quotation Amount (₹)<input inputMode="decimal" type="number" min="0" step="0.01" placeholder="Enter approved amount" value={draft.quoted_amount} onChange={e => edit(row.id, 'quoted_amount', e.target.value)} /></label>
              <label>Quotation / Reference No.<input value={draft.quotation_reference} onChange={e => edit(row.id, 'quotation_reference', e.target.value)} placeholder="e.g. UM-Q-2026-001" /></label>
            </div>
            <label>Admin Notes / Follow-up<input value={draft.admin_notes} onChange={e => edit(row.id, 'admin_notes', e.target.value)} placeholder="Stock check, site visit, call back, etc." /></label>
            <small style={{ display: 'block', marginTop: 8 }}>Current quote: {money(row.quoted_amount)} · Last updated: {dateTime(row.updated_at)}</small>
          </div>
          <div className="complaint-actions" style={{ minWidth: 145 }}>
            <strong>{statuses.find(([value]) => value === draft.status)?.[1] || draft.status}</strong>
            <button type="button" disabled={saving === row.id} onClick={() => save(row)}>{saving === row.id ? 'Saving…' : 'Save Changes'}</button>
            {phone.length >= 10 && <button type="button" className="secondary" onClick={() => window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(whatsappText), '_blank', 'noopener,noreferrer')}>Open WhatsApp</button>}
          </div>
        </article>
      })}</div>
    }
    <p className="muted" style={{ marginTop: 14 }}>Pricing is entered and approved by Admin. The bot does not calculate or send prices automatically.</p>
  </section>
}
