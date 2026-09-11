import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const cards = [
  ['Customers', 'customers'], ['Technicians', 'technicians'], ['Sites', 'sites'], ['Devices', 'devices'],
  ['AMC Contracts', 'amc'], ['Complaints', 'complaints'], ['Service History', 'service_history'],
  ['Products', 'products'], ['Serials', 'product_serials'], ['Stock Movements', 'stock_movements']
]
const groups = {
  workload: ['Complaints', 'Service History'],
  infrastructure: ['Customers', 'Sites', 'Devices'],
  inventory: ['Products', 'Serials', 'Stock Movements'],
  amc: ['AMC Contracts']
}
const reportMeta = {
  workload: ['Service Workload', 'Service requests and completed service history'],
  infrastructure: ['Customer Infrastructure', 'Customers, sites and installed devices'],
  inventory: ['Inventory & Serials', 'Products, serial numbers and stock movement'],
  amc: ['AMC Portfolio', 'Active and managed AMC contracts']
}
const buttonStyle = { cursor: 'pointer', border: '1px solid rgba(255,255,255,.14)', borderRadius: 14, background: 'rgba(255,255,255,.035)', color: 'inherit', padding: 0, textAlign: 'left', width: '100%' }
const formatValue = value => value === null || value === undefined || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)

export default function AdminReports({ onBack }) {
  const [counts, setCounts] = useState({}), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [selected, setSelected] = useState(null), [preview, setPreview] = useState({}), [previewLoading, setPreviewLoading] = useState(false), [previewError, setPreviewError] = useState('')

  useEffect(() => {
    let live = true
    ;(async () => {
      const out = await Promise.all(cards.map(async ([label, table]) => {
        const r = await supabase.from(table).select('id', { count: 'exact', head: true })
        return [label, r.error ? null : r.count ?? 0]
      }))
      if (live) { setCounts(Object.fromEntries(out)); if (out.some(([, v]) => v === null)) setError('Some report counts could not be loaded. Check table permissions.'); setLoading(false) }
    })()
    return () => { live = false }
  }, [])

  const total = keys => keys.reduce((n, k) => n + (Number(counts[k]) || 0), 0)

  const openReport = async key => {
    setSelected(key); setPreview({}); setPreviewError(''); setPreviewLoading(true)
    const results = await Promise.all(groups[key].map(async label => {
      const table = cards.find(([name]) => name === label)?.[1]
      if (!table) return [label, { rows: [], error: 'Table not found' }]
      let result = await supabase.from(table).select('*').order('created_at', { ascending: false }).limit(50)
      if (result.error) result = await supabase.from(table).select('*').limit(50)
      return [label, { rows: result.data || [], error: result.error?.message || '' }]
    }))
    setPreview(Object.fromEntries(results))
    if (results.some(([, value]) => value.error && !value.rows.length)) setPreviewError('Some preview data could not be loaded. Check table permissions.')
    setPreviewLoading(false)
  }

  return <section className='admin-panel'>
    <div className='panel-heading'><div><span className='badge'>ADMIN • REPORTS</span><h2>Reports & Analytics</h2><p>Live operational summary from Supabase.</p></div><button className='secondary' onClick={onBack}>← Dashboard</button></div>
    {error && <p className='error'>{error}</p>}
    <div className='admin-stats'>{cards.map(([label]) => <button key={label} className='stat-card' style={{ ...buttonStyle, padding: 16 }} onClick={() => { const key = Object.keys(groups).find(k => groups[k].includes(label)); if (key) openReport(key) }}><strong>{loading ? '—' : counts[label] ?? '—'}</strong><span>{label}</span></button>)}</div>
    <div className='admin-form'><h3>Key Operational Totals</h3><p className='muted'>Tap any total to open its live detailed preview. Up to 50 latest records are shown per section.</p><div className='data-list'>{Object.entries(reportMeta).map(([key, [title, desc]]) => <button key={key} onClick={() => openReport(key)} style={buttonStyle}><article><strong>{title}</strong><span>{loading ? '—' : total(groups[key])} {key === 'amc' ? 'contracts' : 'records'}<small>{desc}</small></span><small style={{ marginTop: 8, opacity: .75 }}>↗ Open detailed preview</small></article></button>)}</div></div>
    {selected && <div className='admin-form' style={{ marginTop: 16 }}><div className='panel-heading'><div><span className='badge'>LIVE PREVIEW</span><h3>{reportMeta[selected][0]}</h3><p className='muted'>{reportMeta[selected][1]}</p></div><button className='secondary' onClick={() => setSelected(null)}>Close</button></div>
      {previewLoading && <p className='muted'>Loading detailed preview…</p>}{previewError && <p className='error'>{previewError}</p>}
      {!previewLoading && groups[selected].map(label => { const block = preview[label] || { rows: [], error: '' }; const rows = block.rows || []; const columns = rows.length ? Object.keys(rows[0]).filter(k => k !== 'updated_at').slice(0, 8) : []; return <div key={label} style={{ marginTop: 16, overflowX: 'auto' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><h4 style={{ margin: 0 }}>{label}</h4><span className='muted'>{rows.length} preview records</span></div>{block.error && <p className='error'>{block.error}</p>}{!rows.length && !block.error && <p className='muted'>No records found.</p>}{rows.length > 0 && <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}><thead><tr>{columns.map(column => <th key={column} style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid rgba(255,255,255,.12)', whiteSpace: 'nowrap' }}>{column.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || index}>{columns.map(column => <td key={column} style={{ padding: 10, borderBottom: '1px solid rgba(255,255,255,.07)', verticalAlign: 'top', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatValue(row[column])}</td>)}</tr>)}</tbody></table>}</div> })}</div>}
  </section>
}
