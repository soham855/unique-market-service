import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function CustomerAmcDetails({ profile, onBack }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    if (!profile?.id) return
    setLoading(true); setError('')
    const { data: customer, error: customerError } = await supabase
      .from('customers').select('id,name,company_name,address,customer_code').eq('profile_id', profile.id).maybeSingle()
    if (customerError) { setError(customerError.message); setLoading(false); return }
    if (!customer) { setRows([]); setLoading(false); return }
    const { data, error: amcError } = await supabase.from('amc_contracts')
      .select('id,start_date,end_date,status,notes,site_id,created_at,updated_at')
      .eq('customer_id', customer.id).order('end_date', { ascending: false })
    if (amcError) setError(amcError.message); else setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [profile?.id])
  const today = new Date().toISOString().slice(0, 10)
  const active = rows.filter(x => x.start_date <= today && x.end_date >= today && !['cancelled','expired'].includes(String(x.status || '').toLowerCase()))

  return <section className='role-dashboard'>
    <button className='secondary' type='button' onClick={onBack}>← Back to Dashboard</button>
    <div className='panel-heading' style={{marginTop:20}}><div><span className='badge'>CUSTOMER • AMC</span><h2>AMC Details</h2><p>View your AMC coverage, validity and maintenance contract.</p></div><button className='secondary' type='button' onClick={load}>Refresh</button></div>
    {loading && <p>Loading AMC details…</p>}
    {error && <p className='error'>{error}</p>}
    {!loading && !error && <>
      <div className='admin-stats' style={{margin:'18px 0'}}><div className='stat-card'><strong>{active.length}</strong><span>Active AMC</span></div><div className='stat-card'><strong>{rows.length}</strong><span>Total Contracts</span></div></div>
      {rows.length === 0 ? <div className='module-card'><h3>No AMC contract found</h3><p className='muted'>Your AMC details will appear here once an AMC contract is created by Unique Market.</p></div> : <div className='modules'>{rows.map(row => {
        const isActive = active.some(x => x.id === row.id)
        return <article className='module-card' key={row.id}><span className='status'>{isActive ? 'ACTIVE' : String(row.status || '—').toUpperCase()}</span><h3>{row.start_date || '—'} → {row.end_date || '—'}</h3><p><strong>Coverage:</strong> {isActive ? 'AMC currently active' : 'Contract not currently active'}</p>{row.notes && <p><strong>Notes:</strong> {row.notes}</p>}<small>Contract ID: {row.id}</small></article>
      })}</div>}
    </>}
  </section>
}
