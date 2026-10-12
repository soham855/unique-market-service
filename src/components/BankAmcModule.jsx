import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'

const today = () => new Date().toISOString().slice(0,10)
const localDateTime = (value) => {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)
}
export default function BankAmcModule({onBack}) {
  const [tab,setTab]=useState('visits')
  const [contracts,setContracts]=useState([])
  const [visits,setVisits]=useState([])
  const [sites,setSites]=useState([])
  const [staff,setStaff]=useState([])
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState('')
  const [contractForm,setContractForm]=useState({contract_name:'',site_id:'',start_date:today(),end_date:'',status:'active',visit_interval_months:2,billing_interval_months:3,next_billing_date:'',billing_amount:'',notes:''})
  const [visitForm,setVisitForm]=useState({amc_contract_id:'',scheduled_at:'',assigned_staff_id:'',visit_type:'scheduled',report_summary:'',material_notes:'',breakdown_notes:''})
  const [editingVisit,setEditingVisit]=useState(null)

  async function load() {
    setLoading(true); setMessage('')
    const [c,v,s,t]=await Promise.all([
      supabase.from('amc_contracts').select('*,sites:sites(id,site_name,address,contact_email)').order('created_at',{ascending:false}).limit(500),
      supabase.from('bank_amc_visits').select('*,amc_contract:amc_contracts(id,contract_name,site_id,sites:sites(site_name,address,contact_email))').order('scheduled_at',{ascending:true}).limit(500),
      supabase.from('sites').select('id,site_name,address,contact_email').order('site_name').limit(500),
      supabase.from('profiles').select('id,full_name,phone').eq('role','technician').limit(500)
    ])
    const errors=[c.error,v.error,s.error,t.error].filter(Boolean)
    if(errors.length) setMessage('Load error: '+errors.map(e=>e.message).join(' • '))
    setContracts(c.data||[]); setVisits(v.data||[]); setSites(s.data||[]); setStaff(t.data||[])
    setLoading(false)
  }
  useEffect(()=>{load()},[])

  async function saveContract(e) {
    e.preventDefault(); setSaving(true); setMessage('')
    if(!contractForm.site_id || !contractForm.start_date || !contractForm.end_date){setMessage('Branch, contract start date and end date are required.');setSaving(false);return}
    const payload={contract_name:contractForm.contract_name.trim()||null,site_id:contractForm.site_id,start_date:contractForm.start_date,end_date:contractForm.end_date,status:contractForm.status,visit_interval_months:Math.max(1,Number(contractForm.visit_interval_months)||2),billing_interval_months:Math.max(1,Number(contractForm.billing_interval_months)||3),next_billing_date:contractForm.next_billing_date||null,billing_amount:contractForm.billing_amount===''?null:Number(contractForm.billing_amount),notes:contractForm.notes||null}
    const {error}=await supabase.from('amc_contracts').insert(payload)
    if(error)setMessage('Could not save contract: '+error.message)
    else {setMessage('AMC contract saved. Add its first scheduled visit in the Visits tab.');setContractForm({contract_name:'',site_id:'',start_date:today(),end_date:'',status:'active',visit_interval_months:2,billing_interval_months:3,next_billing_date:'',billing_amount:'',notes:''});await load()}
    setSaving(false)
  }
  async function saveVisit(e) {
    e.preventDefault();setSaving(true);setMessage('')
    if(!visitForm.amc_contract_id||!visitForm.scheduled_at){setMessage('Select an AMC contract and visit date/time.');setSaving(false);return}
    const payload={amc_contract_id:visitForm.amc_contract_id,scheduled_at:new Date(visitForm.scheduled_at).toISOString(),assigned_staff_id:visitForm.assigned_staff_id||null,visit_type:visitForm.visit_type,report_summary:visitForm.report_summary||null,material_notes:visitForm.material_notes||null,breakdown_notes:visitForm.breakdown_notes||null,status:editingVisit?.status||'scheduled'}
    const q=editingVisit?supabase.from('bank_amc_visits').update(payload).eq('id',editingVisit.id):supabase.from('bank_amc_visits').insert(payload)
    const {error}=await q
    if(error)setMessage('Could not save visit: '+error.message)
    else {setMessage('Visit saved. Reminders are queued by the existing WhatsApp bot when its connection and staff number are configured.');setEditingVisit(null);setVisitForm({amc_contract_id:'',scheduled_at:'',assigned_staff_id:'',visit_type:'scheduled',report_summary:'',material_notes:'',breakdown_notes:''});await load()}
    setSaving(false)
  }
  function editVisit(v) {
    setEditingVisit(v)
    setVisitForm({amc_contract_id:v.amc_contract_id,scheduled_at:localDateTime(v.scheduled_at),assigned_staff_id:v.assigned_staff_id||'',visit_type:v.visit_type||'scheduled',report_summary:v.report_summary||'',material_notes:v.material_notes||'',breakdown_notes:v.breakdown_notes||''})
    setTab('visits')
  }
  async function updateVisitStatus(v,status) {
    setMessage('')
    const patch={status,updated_at:new Date().toISOString()}
    if(status==='completed')patch.completed_at=new Date().toISOString()
    const {error}=await supabase.from('bank_amc_visits').update(patch).eq('id',v.id)
    if(error)setMessage('Status update failed: '+error.message);else {setMessage('Visit status updated.');await load()}
  }
  async function saveBranchEmail(site,email) {
    const {error}=await supabase.from('sites').update({contact_email:email.trim()||null}).eq('id',site.id)
    if(error)setMessage('Could not save branch email: '+error.message);else setMessage('Branch email saved. Email sending stays disabled until sender configuration is verified.')
    await load()
  }
  const siteLabel=(site)=>site?.site_name||site?.address||'Branch not selected'
  const contractLabel=(c)=>c?.contract_name||siteLabel(c?.sites)||'Bank AMC'
  return <section className='admin-panel'>
    <div className='panel-heading'><div><span className='badge'>ADMIN • BANK AMC</span><h2>Bank AMC & Visit Reminders</h2><p>Branch-wise contracts, scheduled visits, staff assignments, visit reports and quarterly billing dates.</p></div><button className='secondary' type='button' onClick={onBack}>← Dashboard</button></div>
    {message&&<p className={/saved|updated/i.test(message)?'muted':'error'}>{message}</p>}
    <div className='admin-actions'>
      <button type='button' className={tab==='visits'?'':'secondary'} onClick={()=>setTab('visits')}>📅 Visits & Reports</button>
      <button type='button' className={tab==='contracts'?'':'secondary'} onClick={()=>setTab('contracts')}>🛡 AMC Contracts</button>
      <button type='button' className={tab==='emails'?'':'secondary'} onClick={()=>setTab('emails')}>✉ Branch Email IDs</button>
      <button type='button' className='secondary' onClick={load}>↻ Refresh</button>
    </div>
    {loading?<p className='muted'>Loading bank AMC records…</p>:<>
      {tab==='contracts'&&<><h3>Register Bank AMC Contract</h3><form className='admin-form' onSubmit={saveContract}>
        <label>Contract / Bank Name<input value={contractForm.contract_name} onChange={e=>setContractForm({...contractForm,contract_name:e.target.value})} placeholder='e.g. Bank AMC — Branch contract'/></label>
        <label>Bank Branch / Site<select required value={contractForm.site_id} onChange={e=>setContractForm({...contractForm,site_id:e.target.value})}><option value=''>Select branch</option>{sites.map(s=><option key={s.id} value={s.id}>{siteLabel(s)}</option>)}</select></label>
        <label>Contract Start<input type='date' required value={contractForm.start_date} onChange={e=>setContractForm({...contractForm,start_date:e.target.value})}/></label>
        <label>Contract Expiry / Renewal Date<input type='date' required value={contractForm.end_date} onChange={e=>setContractForm({...contractForm,end_date:e.target.value})}/></label>
        <label>Contract Status<select value={contractForm.status} onChange={e=>setContractForm({...contractForm,status:e.target.value})}><option value='active'>Active</option><option value='pending'>Pending</option><option value='expired'>Expired</option><option value='cancelled'>Cancelled</option></select></label>
        <label>Visit Interval (months)<input type='number' min='1' max='24' value={contractForm.visit_interval_months} onChange={e=>setContractForm({...contractForm,visit_interval_months:e.target.value})}/></label>
        <label>Billing Interval (months)<input type='number' min='1' max='12' value={contractForm.billing_interval_months} onChange={e=>setContractForm({...contractForm,billing_interval_months:e.target.value})}/></label>
        <label>Next Quarterly Bill Date<input type='date' value={contractForm.next_billing_date} onChange={e=>setContractForm({...contractForm,next_billing_date:e.target.value})}/></label>
        <label>Quarterly Bill Amount (₹)<input type='number' min='0' step='0.01' value={contractForm.billing_amount} onChange={e=>setContractForm({...contractForm,billing_amount:e.target.value})}/></label>
        <label>Contract Notes<textarea value={contractForm.notes} onChange={e=>setContractForm({...contractForm,notes:e.target.value})} placeholder='Coverage, bank requirements, included material, etc.'/></label>
        <button type='submit' disabled={saving}>{saving?'Saving…':'Save AMC Contract'}</button>
      </form><h3>Existing Contracts</h3><div className='data-list'>{contracts.map(c=><article key={c.id}><strong>{contractLabel(c)}</strong><span>{c.start_date||'—'} to {c.end_date||'—'} • Visit every {c.visit_interval_months||2} months • Billing every {c.billing_interval_months||3} months • Next bill: {c.next_billing_date||'Not set'} • {c.status}</span></article>)}{!contracts.length&&<p className='muted'>No bank AMC contracts registered yet.</p>}</div></>}
      {tab==='visits'&&<><h3>{editingVisit?'Update Scheduled Visit / Report':'Schedule a Bank AMC Visit'}</h3><form className='admin-form' onSubmit={saveVisit}>
        <label>AMC Contract / Branch<select required value={visitForm.amc_contract_id} onChange={e=>setVisitForm({...visitForm,amc_contract_id:e.target.value})}><option value=''>Select contract</option>{contracts.filter(c=>c.status==='active').map(c=><option key={c.id} value={c.id}>{contractLabel(c)}{c.end_date?' • expires '+c.end_date:''}</option>)}</select></label>
        <label>Visit Date & Time<input type='datetime-local' required value={visitForm.scheduled_at} onChange={e=>setVisitForm({...visitForm,scheduled_at:e.target.value})}/></label>
        <label>Assigned Staff / Technician<select value={visitForm.assigned_staff_id} onChange={e=>setVisitForm({...visitForm,assigned_staff_id:e.target.value})}><option value=''>Select staff</option>{staff.map(s=><option key={s.id} value={s.id}>{s.full_name||s.phone||s.id}</option>)}</select></label>
        <label>Visit Type<select value={visitForm.visit_type} onChange={e=>setVisitForm({...visitForm,visit_type:e.target.value})}><option value='scheduled'>Scheduled AMC visit</option><option value='breakdown'>Breakdown call</option><option value='material_delivery'>Material delivery</option><option value='follow_up'>Follow-up</option></select></label>
        <label>Visit / Service Report<textarea value={visitForm.report_summary} onChange={e=>setVisitForm({...visitForm,report_summary:e.target.value})} placeholder='Inspection, bank breakdown details, action taken…'/></label>
        <label>Material Supplied<textarea value={visitForm.material_notes} onChange={e=>setVisitForm({...visitForm,material_notes:e.target.value})} placeholder='Item, quantity, serial number, challan reference…'/></label>
        <label>Breakdown / Follow-up Notes<textarea value={visitForm.breakdown_notes} onChange={e=>setVisitForm({...visitForm,breakdown_notes:e.target.value})}/></label>
        <button type='submit' disabled={saving}>{saving?'Saving…':editingVisit?'Update Visit':'Schedule Visit'}</button>{editingVisit&&<button type='button' className='secondary' onClick={()=>{setEditingVisit(null);setVisitForm({amc_contract_id:'',scheduled_at:'',assigned_staff_id:'',visit_type:'scheduled',report_summary:'',material_notes:'',breakdown_notes:''})}}>Cancel Edit</button>}
      </form><h3>Visit Schedule & History</h3><div className='data-list'>{visits.map(v=><article key={v.id}><strong>{contractLabel(v.amc_contract)} • {v.visit_type?.replaceAll('_',' ')||'visit'}</strong><span>{v.scheduled_at?new Date(v.scheduled_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'No date'} • Staff: {staff.find(s=>s.id===v.assigned_staff_id)?.full_name||'Not assigned'} • Status: {v.status}{v.report_summary?' • Report: '+v.report_summary:''}{v.material_notes?' • Material: '+v.material_notes:''}</span><div><button type='button' className='secondary' onClick={()=>editVisit(v)}>Edit / Report</button>{v.status!=='completed'&&v.status!=='cancelled'&&<button type='button' onClick={()=>updateVisitStatus(v,'completed')}>Mark Complete</button>}{v.status==='scheduled'&&<button type='button' className='secondary' onClick={()=>updateVisitStatus(v,'cancelled')}>Cancel</button>}</div></article>)}{!visits.length&&<p className='muted'>No visits scheduled yet.</p>}</div></>}
      {tab==='emails'&&<><h3>Branch-specific Email Recipients</h3><p className='muted'>Save each bank branch's email separately. Email delivery remains disabled until the sending account/provider is configured and verified. No test email will be sent.</p><div className='data-list'>{sites.map(s=><BranchEmailRow key={s.id} site={s} onSave={saveBranchEmail}/>)}</div>{!sites.length&&<p className='muted'>Add bank branches in Admin → Sites first.</p>}</>}
    </>}
  </section>
}
function BranchEmailRow({site,onSave}) {
 const [email,setEmail]=useState(site.contact_email||'')
 useEffect(()=>setEmail(site.contact_email||''),[site.contact_email])
 return <article><strong>{site.site_name||site.address||'Bank Branch'}</strong><span>{site.address||'Address not set'}</span><div className='admin-actions'><input type='email' value={email} onChange={e=>setEmail(e.target.value)} placeholder='branch@example.com'/><button type='button' onClick={()=>onSave(site,email)}>Save Email</button></div></article>
}
