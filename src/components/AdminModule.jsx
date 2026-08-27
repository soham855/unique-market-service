import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const configs = {
  Customers: { table:'profiles', filter:['role','customer'], columns:['full_name','phone','id'] },
  Technicians: { table:'profiles', filter:['role','technician'], columns:['full_name','phone','id'] },
  'Sites & Devices': { table:'sites', columns:['name','address','customer_id','id'] },
  AMC: { table:'amc_contracts', columns:['customer_id','site_id','start_date','end_date','status','notes','id'] },
  'Service History': { table:'service_history', columns:['service_date','customer_id','technician_id','work_note','status','id'] },
}

export default function AdminModule({ module, onBack }) {
  const config = configs[module]
  const [rows,setRows]=useState([])
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const [form,setForm]=useState({})

  async function load(){
    setLoading(true); setMessage('')
    if(!supabase){setMessage('Supabase is not configured.');setLoading(false);return}
    let q=supabase.from(config.table).select('*').order('created_at',{ascending:false})
    if(config.filter) q=q.eq(config.filter[0],config.filter[1])
    const {data,error}=await q
    if(error)setMessage(error.message); else setRows(data||[])
    setLoading(false)
  }
  useEffect(()=>{load()},[module])

  async function add(e){
    e.preventDefault(); setMessage('')
    const payload={...form}
    if(module==='Sites & Devices') delete payload.id
    const {error}=await supabase.from(config.table).insert(payload)
    if(error)setMessage(error.message); else {setForm({});setMessage('Saved successfully');load()}
  }

  if(module==='Customers'||module==='Technicians') return <section className="admin-panel"><div className="panel-heading"><div><span className="badge">ADMIN</span><h2>{module}</h2><p>Live user records from Supabase.</p></div><button className="secondary" onClick={onBack}>← Dashboard</button></div>{message&&<p className="error">{message}</p>}{loading?<p className="muted">Loading…</p>:<div className="data-list">{rows.map(r=><article key={r.id}><strong>{r.full_name||'Unnamed'}</strong><span>{r.phone||'No phone'}</span><small>{r.id}</small></article>)}{!rows.length&&<p className="muted">No records found.</p>}</div>}</section>

  return <section className="admin-panel"><div className="panel-heading"><div><span className="badge">ADMIN</span><h2>{module}</h2><p>Manage operational records directly from the service database.</p></div><button className="secondary" onClick={onBack}>← Dashboard</button></div>
    <form className="admin-form" onSubmit={add}>{module==='Sites & Devices'&&<><input placeholder="Site name" value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})} required/><input placeholder="Address" value={form.address||''} onChange={e=>setForm({...form,address:e.target.value})}/><input placeholder="Customer ID (UUID)" value={form.customer_id||''} onChange={e=>setForm({...form,customer_id:e.target.value})}/></>}{module==='AMC'&&<><input placeholder="Customer ID (UUID)" value={form.customer_id||''} onChange={e=>setForm({...form,customer_id:e.target.value})} required/><input placeholder="Site ID (UUID)" value={form.site_id||''} onChange={e=>setForm({...form,site_id:e.target.value})}/><label>Start date<input type="date" value={form.start_date||''} onChange={e=>setForm({...form,start_date:e.target.value})} required/></label><label>End date<input type="date" value={form.end_date||''} onChange={e=>setForm({...form,end_date:e.target.value})} required/></label><select value={form.status||'active'} onChange={e=>setForm({...form,status:e.target.value})}><option>active</option><option>expired</option><option>cancelled</option></select><textarea placeholder="Notes" value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></>}{module==='Service History'&&<><input placeholder="Complaint ID (UUID)" value={form.complaint_id||''} onChange={e=>setForm({...form,complaint_id:e.target.value})}/><input placeholder="Customer ID (UUID)" value={form.customer_id||''} onChange={e=>setForm({...form,customer_id:e.target.value})}/><input placeholder="Technician ID (UUID)" value={form.technician_id||''} onChange={e=>setForm({...form,technician_id:e.target.value})}/><input placeholder="Work note" value={form.work_note||''} onChange={e=>setForm({...form,work_note:e.target.value})} required/></>}<button>Save Record</button></form>
    {message&&<p className="muted">{message}</p>}{loading?<p className="muted">Loading…</p>:<div className="data-list">{rows.map(r=><article key={r.id}><strong>{r.name||r.status||'Record'}</strong><span>{r.address||r.work_note||`${r.start_date||''} → ${r.end_date||''}`}</span><small>{r.id}</small></article>)}{!rows.length&&<p className="muted">No records found.</p>}</div>}</section>
}
