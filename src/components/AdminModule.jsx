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
  const config=configs[module]
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[editing,setEditing]=useState(null),[form,setForm]=useState({})
  async function load(){setLoading(true);setMessage('');if(!supabase){setMessage('Supabase is not configured.');setLoading(false);return}let q=supabase.from(config.table).select('*');if(config.filter)q=q.eq(config.filter[0],config.filter[1]);const {data,error}=await q;if(error)setMessage(error.message);else setRows(data||[]);setLoading(false)}
  useEffect(()=>{load()},[module])
  function startNew(){setEditing('new');setForm({})}
  function startEdit(r){setEditing(r.id);setForm(Object.fromEntries(config.columns.filter(c=>c!=='id').map(c=>[c,r[c]??''])))}
  async function save(e){e.preventDefault();const payload=Object.fromEntries(Object.entries(form).filter(([,v])=>v!==''));const r=editing==='new'?await supabase.from(config.table).insert(payload):await supabase.from(config.table).update(payload).eq('id',editing);if(r.error)setMessage(r.error.message);else{setMessage('Saved successfully');setEditing(null);load()}}
  async function remove(id){if(!confirm('Delete this record?'))return;const {error}=await supabase.from(config.table).delete().eq('id',id);if(error)setMessage(error.message);else{setMessage('Deleted successfully');load()}}
  if(!config)return null
  return <section className="admin-panel"><div className="panel-heading"><div><span className="badge">ADMIN • LIVE</span><h2>{module}</h2><p>Real operational data connected to Supabase.</p></div><button className="secondary" onClick={onBack}>← Dashboard</button></div>{message&&<p className="muted">{message}</p>}<div className="admin-actions"><button onClick={startNew}>＋ Add Record</button><button className="secondary" onClick={load}>↻ Refresh</button></div>{editing!==null&&<form className="admin-form" onSubmit={save}>{config.columns.filter(c=>c!=='id').map(c=><label key={c}>{c.replaceAll('_',' ')}<input type={c.includes('date')?'date':'text'} value={form[c]||''} onChange={e=>setForm({...form,[c]:e.target.value})}/></label>)}<button>Save</button><button type="button" className="secondary" onClick={()=>setEditing(null)}>Cancel</button></form>}{loading?<p className="muted">Loading live records…</p>:<div className="data-list">{rows.map(r=><article key={r.id}><strong>{r.full_name||r.name||r.status||r.work_note||'Record'}</strong><span>{config.columns.map(c=>r[c]).filter(Boolean).slice(0,4).join(' • ')}</span><div><button className="secondary" onClick={()=>startEdit(r)}>Edit</button><button className="secondary" onClick={()=>remove(r.id)}>Delete</button></div></article>)}{!rows.length&&<p className="muted">No records found.</p>}</div>}</section>
}
