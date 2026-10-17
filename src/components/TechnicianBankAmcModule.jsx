import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'

const emptyReport={report_summary:'',material_notes:'',breakdown_notes:''}
export default function TechnicianBankAmcModule({profile,onBack}) {
  const [visits,setVisits]=useState([])
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState('')
  const [editing,setEditing]=useState(null)
  const [report,setReport]=useState(emptyReport)

  async function load(){
    setLoading(true);setMessage('')
    const {data,error}=await supabase.from('bank_amc_visits')
      .select('id,amc_contract_id,scheduled_at,assigned_staff_id,status,visit_type,report_summary,material_notes,breakdown_notes,completed_at,amc_contract:amc_contracts(id,contract_name,site_id,state,district,address,pincode,sites:sites(id,site_name,address,state,district,pincode))')
      .eq('assigned_staff_id',profile.id).order('scheduled_at',{ascending:true}).limit(200)
    if(error)setMessage('Could not load assigned Bank AMC visits: '+error.message)
    setVisits(data||[]);setLoading(false)
  }
  useEffect(()=>{load()},[profile?.id])
  function startReport(v){
    setEditing(v.id)
    setReport({report_summary:v.report_summary||'',material_notes:v.material_notes||'',breakdown_notes:v.breakdown_notes||''})
  }
  async function updateStatus(v,status){
    setSaving(true);setMessage('')
    const patch={status,updated_at:new Date().toISOString()}
    if(status==='completed')patch.completed_at=new Date().toISOString()
    const {error}=await supabase.from('bank_amc_visits').update(patch).eq('id',v.id).eq('assigned_staff_id',profile.id)
    if(error)setMessage('Status update failed: '+error.message)
    else{setMessage(status==='completed'?'Visit completed. Report is saved; Admin can review and schedule the next visit.':'Visit marked in progress.');await load()}
    setSaving(false)
  }
  async function saveReport(e){
    e.preventDefault();if(!editing)return
    setSaving(true);setMessage('')
    const {error}=await supabase.from('bank_amc_visits').update({...report,updated_at:new Date().toISOString()}).eq('id',editing).eq('assigned_staff_id',profile.id)
    if(error)setMessage('Report could not be saved: '+error.message)
    else{setMessage('Bank AMC service report saved.');setEditing(null);setReport(emptyReport);await load()}
    setSaving(false)
  }
  const branch=v=>v.amc_contract?.sites?.site_name||v.amc_contract?.contract_name||'Bank Branch'
  const address=v=>v.amc_contract?.sites?.address||v.amc_contract?.address||'Address not recorded'
  return <section className='role-dashboard'>
    <div className='panel-heading'><div><span className='badge'>TECHNICIAN • BANK AMC</span><h2>My Bank AMC Visits</h2><p>View your assigned branch visits, update progress and submit the service report.</p></div><button type='button' className='secondary' onClick={onBack}>← Dashboard</button></div>
    {message&&<p className={/saved|completed|progress/i.test(message)?'muted':'error'}>{message}</p>}
    <div className='admin-actions'><button type='button' className='secondary' onClick={load}>↻ Refresh visits</button></div>
    {loading?<p className='muted'>Loading assigned visits…</p>:!visits.length?<p className='muted'>No Bank AMC visits are assigned to your account yet. Ask Admin to assign you to a scheduled visit.</p>:
      <div className='data-list'>{visits.map(v=><article key={v.id}>
        <strong>{branch(v)} • {String(v.visit_type||'scheduled').replaceAll('_',' ')}</strong>
        <span>{new Date(v.scheduled_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})} • Status: {v.status}</span>
        <span>{address(v)}{v.amc_contract?.sites?.district||v.amc_contract?.district?' • '+(v.amc_contract?.sites?.district||v.amc_contract?.district):''}{v.amc_contract?.sites?.state||v.amc_contract?.state?' • '+(v.amc_contract?.sites?.state||v.amc_contract?.state):''}{v.amc_contract?.sites?.pincode||v.amc_contract?.pincode?' • '+(v.amc_contract?.sites?.pincode||v.amc_contract?.pincode):''}</span>
        {v.report_summary&&<span><b>Report:</b> {v.report_summary}</span>}
        {v.material_notes&&<span><b>Materials:</b> {v.material_notes}</span>}
        {v.breakdown_notes&&<span><b>Follow-up:</b> {v.breakdown_notes}</span>}
        {v.status!=='completed'&&v.status!=='cancelled'&&<div className='admin-actions'>
          {v.status==='scheduled'&&<button type='button' disabled={saving} onClick={()=>updateStatus(v,'in_progress')}>Start Visit</button>}
          <button type='button' className='secondary' onClick={()=>startReport(v)}>Add / Edit Report</button>
          <button type='button' disabled={saving} onClick={()=>updateStatus(v,'completed')}>Mark Complete</button>
        </div>}
        {editing===v.id&&<form className='admin-form' onSubmit={saveReport}>
          <label>Service / Inspection Report<textarea value={report.report_summary} onChange={e=>setReport({...report,report_summary:e.target.value})} required placeholder='Camera/DVR/network checks, findings and work completed'/></label>
          <label>Materials Used<textarea value={report.material_notes} onChange={e=>setReport({...report,material_notes:e.target.value})} placeholder='Part, quantity, serial number or challan reference'/></label>
          <label>Breakdown / Follow-up Notes<textarea value={report.breakdown_notes} onChange={e=>setReport({...report,breakdown_notes:e.target.value})} placeholder='Pending work or items requiring approval'/></label>
          <div className='admin-actions'><button type='submit' disabled={saving}>{saving?'Saving…':'Save Service Report'}</button><button type='button' className='secondary' onClick={()=>setEditing(null)}>Cancel</button></div>
        </form>}
      </article>)}</div>}
  </section>
}
