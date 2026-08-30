import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { subscribeToComplaints } from '../lib/realtime'

const statusLabel = { open:'NEW REQUEST', assigned:'ASSIGNED', in_progress:'IN PROGRESS', resolved:'SERVICE COMPLETED', closed:'CLOSED' }

export default function TechnicianModule({ profile, mode = 'assigned', onBack }) {
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [searchType, setSearchType] = useState('name')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [paymentFor, setPaymentFor] = useState(null)
  const [payment, setPayment] = useState({ amount:'', mode:'Cash', reference_no:'', notes:'' })
  const [cashToday, setCashToday] = useState(0)
  const [upiToday, setUpiToday] = useState(0)
  const [totalToday, setTotalToday] = useState(0)
  const [todayPayments, setTodayPayments] = useState([])

  async function loadPaymentsToday() {
    if (!supabase || !profile?.id) return
    const today = new Date().toISOString().slice(0,10)
    const { data, error } = await supabase.from('payments').select('id,customer_id,amount,mode,reference_no,status,payment_date,created_at,notes').eq('payment_date', today).eq('status','confirmed').or(`recorded_by.eq.${profile.id},source.eq.customer`).order('created_at',{ascending:false}).limit(200)
    if (error) { setMessage(error.message); return }
    const rows = data || []
    const cash = rows.filter(p => String(p.mode||'').toUpperCase()==='CASH' && p.recorded_by===profile.id).reduce((s,p)=>s+Number(p.amount||0),0)
    const upi = rows.filter(p => String(p.mode||'').toUpperCase()==='UPI').reduce((s,p)=>s+Number(p.amount||0),0)
    setCashToday(cash); setUpiToday(upi); setTotalToday(cash+upi); setTodayPayments(rows)
  }

  async function load(search = query, type = searchType, from = fromDate, to = toDate) {
    if (!supabase || !profile?.id) return
    setLoading(true); setMessage('')
    let q = supabase.from('complaints').select('id,complaint_no,ticket_no,title,description,category,priority,status,location_text,address,created_at,customer_name,customer_phone,company_name,technician_id,customer_id,started_at,completed_at,resolution_notes,assigned_at').eq('technician_id', profile.id).order('created_at',{ascending:false})
    if (mode === 'today') {
      const today = new Date().toISOString().slice(0,10)
      q = q.or(`created_at.gte.${today}T00:00:00,assigned_at.gte.${today}T00:00:00,started_at.gte.${today}T00:00:00`)
      loadPaymentsToday()
    } else if (mode === 'find') {
      if (type === 'name' && search.trim()) q = q.ilike('customer_name', `%${search.trim()}%`)
      if (type === 'code' && search.trim()) q = q.or(`complaint_no.ilike.%${search.trim()}%,ticket_no.ilike.%${search.trim()}%`)
      if (type === 'date' && from) { q = q.gte('created_at', `${from}T00:00:00`); q = q.lte('created_at', `${to || from}T23:59:59`) }
    } else if (search.trim()) {
      const value = search.trim().replace(/,/g,'')
      q = q.or(`complaint_no.ilike.%${value}%,ticket_no.ilike.%${value}%,title.ilike.%${value}%,customer_name.ilike.%${value}%,customer_phone.ilike.%${value}%`)
    }
    const {data,error}=await q
    if(error)setMessage(error.message);else setItems(data||[])
    setLoading(false)
  }

  useEffect(()=>{if(!profile?.id)return;load('',searchType,fromDate,toDate);const unsubscribe=subscribeToComplaints(()=>load());return unsubscribe},[profile?.id,mode])

  async function claimJob(item){setMessage('');const {data:technician,error:profileError}=await supabase.from('profiles').select('id,role').eq('id',profile.id).eq('role','technician').maybeSingle();if(profileError)return setMessage(profileError.message);if(!technician?.id)return setMessage('Technician profile is not linked correctly. Please check the technician profile ID.');const {error}=await supabase.from('complaints').update({technician_id:technician.id,status:'assigned',assigned_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',item.id).is('technician_id',null).eq('status','open');if(error)setMessage(error.message);else{setMessage(`${item.complaint_no||'Complaint'} assigned to you.`);load()}}
  async function setStatus(item,status,extra={}){setMessage('');const {error}=await supabase.from('complaints').update({status,updated_at:new Date().toISOString(),...extra}).eq('id',item.id).eq('technician_id',profile.id);if(error)setMessage(error.message);else load()}
  async function acceptJob(item){await setStatus(item,'in_progress',{started_at:new Date().toISOString()})}
  async function completeService(item){const notes=window.prompt('Service completion notes (optional):',item.resolution_notes||'');if(notes===null)return;await setStatus(item,'resolved',{completed_at:new Date().toISOString(),resolution_notes:notes})}
  async function collectPayment(item){const amount=Number(payment.amount);if(!amount||amount<=0)return setMessage('Enter a valid payment amount.');if(payment.mode==='UPI'&&!payment.reference_no.trim())return setMessage('UPI reference number is required.');const {data:customer,error:customerError}=await supabase.from('customers').select('profile_id,user_id').eq('id',item.customer_id).maybeSingle();if(customerError)return setMessage(customerError.message);const customerProfileId=customer?.profile_id||customer?.user_id;if(!customerProfileId)return setMessage('Customer profile could not be linked for payment.');const {error}=await supabase.from('payments').insert({customer_id:customerProfileId,amount,mode:payment.mode,reference_no:payment.reference_no.trim()||null,notes:`Service payment for ${item.complaint_no||item.id}${payment.notes.trim()?` — ${payment.notes.trim()}`:''}`,recorded_by:profile.id,status:'confirmed',source:'technician',payment_date:new Date().toISOString().slice(0,10)});if(error)return setMessage(error.message);await setStatus(item,'closed');setPaymentFor(null);setPayment({amount:'',mode:'Cash',reference_no:'',notes:''});setMessage('Payment collected and service file closed successfully.');loadPaymentsToday()}
  function displayNo(item){return item.complaint_no||item.ticket_no||`C/NO-${item.id}`}

  return <section className='complaints-panel'>
    <div className='panel-heading'><div><span className='badge'>TECHNICIAN DESK</span><h2>{mode==='find'?'Find Complaint':mode==='today'?"Today's Visits":'Live Service Requests'}</h2><p>{mode==='find'?'Search only by Party / Customer Name, Complaint Code or Date-wise.':mode==='today'?'Today’s assigned visits and today’s collection summary.':'Customer-raised open requests and complaints assigned to you are shown here automatically.'}</p></div><div><span className='status'>LIVE</span> <button className='secondary' type='button' onClick={onBack}>← Back</button></div></div>
    {mode==='today' && <div className='admin-stats' style={{margin:'18px 0'}}><div className='stat-card'><strong>₹{cashToday.toLocaleString('en-IN')}</strong><span>Cash Collected Today</span></div><div className='stat-card'><strong>₹{upiToday.toLocaleString('en-IN')}</strong><span>Company QR / UPI Today</span></div><div className='stat-card'><strong>₹{totalToday.toLocaleString('en-IN')}</strong><span>Total Collected Today</span></div></div>}
    {mode==='find' ? <form className='search-row' onSubmit={e=>{e.preventDefault();load(query,searchType,fromDate,toDate)}} style={{display:'flex',gap:8,margin:'18px 0',flexWrap:'wrap'}}>
      <select value={searchType} onChange={e=>{setSearchType(e.target.value);setQuery('');setFromDate('');setToDate('');setItems([]);setMessage('')}}><option value='name'>Party / Customer Name</option><option value='code'>Complaint Code</option><option value='date'>Date-wise Search</option></select>
      {searchType==='date'?<><input type='date' value={fromDate} onChange={e=>setFromDate(e.target.value)} /><input type='date' value={toDate} onChange={e=>setToDate(e.target.value)} /></>:<input value={query} onChange={e=>setQuery(e.target.value)} placeholder={searchType==='name'?'Enter Party / Customer Name':'Enter Complaint Code (C/NO-1)'} />}
      <button type='submit' disabled={loading}>{loading?'Searching…':'Find Complaint'}</button><button type='button' className='secondary' onClick={()=>{setQuery('');setFromDate('');setToDate('');load('',searchType,'','')}}>Refresh</button>
    </form> : mode!=='today' ? <div className='search-row' style={{display:'flex',gap:8,margin:'18px 0',flexWrap:'wrap'}}><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')load()}} placeholder='Search C/NO-1, customer, mobile...' /><button type='button' onClick={()=>load()}>Find</button><button type='button' className='secondary' onClick={()=>{setQuery('');load('')}}>Refresh</button></div> : null}
    {message&&<p className={message.includes('successfully')||message.includes('assigned to you')?'muted':'error'}>{message}</p>}
    {mode==='today' && todayPayments.length>0 && <div className='module-card' style={{marginBottom:18}}><h3>Today’s Payment History</h3><div className='table-wrap'><table><thead><tr><th>Time</th><th>Customer</th><th>Amount</th><th>Mode</th><th>Reference</th></tr></thead><tbody>{todayPayments.map(p=><tr key={p.id}><td>{p.created_at?new Date(p.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'—'}</td><td>{p.customer_id||'—'}</td><td>₹{Number(p.amount||0).toLocaleString('en-IN')}</td><td>{p.mode||'—'}</td><td>{p.reference_no||'—'}</td></tr>)}</tbody></table></div></div>}
    {loading?<p>Loading service requests…</p>:items.length===0?<div className='module-card'><h3>No visits found</h3><p>{mode==='today'?'No assigned visit was created, assigned or started today.':'New customer complaints will appear here automatically.'}</p></div>:<div className='modules'>{items.map(item=><article className='module-card' key={item.id}><span className='status'>{displayNo(item)} · {statusLabel[item.status]||String(item.status||'OPEN').replaceAll('_',' ').toUpperCase()}</span><h3>{item.title||item.description||'Service Complaint'}</h3><p><strong>Customer:</strong> {item.customer_name||'—'} · {item.customer_phone||'—'}</p><p><strong>Company:</strong> {item.company_name||'—'}</p><p><strong>Category:</strong> {item.category||'—'} · <strong>Priority:</strong> {item.priority||'normal'}</p><p><strong>Address:</strong> {item.location_text||item.address||'—'}</p><p style={{whiteSpace:'pre-wrap'}}>{item.description||'No additional description.'}</p><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginTop:12}}>{item.status==='open'&&!item.technician_id&&<button type='button' onClick={()=>claimJob(item)}>✓ Accept Request</button>}{item.status==='assigned'&&item.technician_id===profile.id&&<button type='button' onClick={()=>acceptJob(item)}>✓ Start Service</button>}{item.status==='in_progress'&&item.technician_id===profile.id&&<button type='button' onClick={()=>completeService(item)}>✓ Service Completed</button>}{item.status==='resolved'&&item.technician_id===profile.id&&<button type='button' onClick={()=>setPaymentFor(item)}>💳 Collect Cash / UPI & Close</button>}{item.status==='closed'&&item.technician_id===profile.id&&<strong>✓ Service File Closed</strong>}</div></article>)}</div>}
  </section>
}
