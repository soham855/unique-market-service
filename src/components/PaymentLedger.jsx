import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabase'

const money=value=>'₹'+Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})
const outstandingFor=challan=>{
  if(['paid','completed','settled'].includes(String(challan.payment_status||'').toLowerCase()))return 0
  return Math.max(0,Number(challan.subtotal||0)-Number(challan.paid_amount||0))
}
const localDate=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})

export default function PaymentLedger({onBack}){
  const [items,setItems]=useState([]),[bills,setBills]=useState([]),[customers,setCustomers]=useState([]),[message,setMessage]=useState(''),[amounts,setAmounts]=useState({}),[loading,setLoading]=useState(true)
  const [selectedBill,setSelectedBill]=useState(''),[amount,setAmount]=useState(''),[mode,setMode]=useState('Cash'),[reference,setReference]=useState(''),[notes,setNotes]=useState(''),[saving,setSaving]=useState(false),[dueDates,setDueDates]=useState({}),[savingDue,setSavingDue]=useState('')
  async function load(){
    setLoading(true);setMessage('')
    const [{data:p,error:pe},{data:c,error:ce},{data:cs,error:cse}]=await Promise.all([
      supabase.from('payments').select('id,payment_date,amount,mode,reference_no,status,payment_status,source,notes,created_at,challan_id,customer:customer_id(name,mobile),recorder:recorded_by(full_name)').order('created_at',{ascending:false}).limit(500),
      supabase.from('challans').select('id,challan_no,customer_id,party_name,item_name,subtotal,paid_amount,payment_status,status,due_date,created_at,customer:customer_id(name,mobile)').order('created_at',{ascending:false}).limit(500),
      supabase.from('customers').select('id,name,mobile').order('name').limit(500)
    ])
    if(pe||ce||cse)setMessage([pe,ce,cse].filter(Boolean).map(e=>e.message).join(' • '))
    setItems(p||[]);setBills(c||[]);setCustomers(cs||[])
    setDueDates(Object.fromEntries((c||[]).map(b=>[b.id,b.due_date||''])))
    setLoading(false)
  }
  useEffect(()=>{load()},[])
  const openBills=useMemo(()=>bills.filter(b=>outstandingFor(b)>0),[bills])
  const selected=bills.find(b=>b.id===selectedBill)
  const totalConfirmed=items.filter(p=>p.status==='confirmed').reduce((s,p)=>s+Number(p.amount||0),0)
  const pending=items.filter(p=>p.status==='pending').reduce((s,p)=>s+Number(p.amount||0),0)
  const totalOutstanding=openBills.reduce((s,b)=>s+outstandingFor(b),0)

  async function updateStatus(id,status){
    setMessage('')
    const item=items.find(p=>p.id===id)
    const payload={status,payment_status:status==='confirmed'?'Confirmed':status==='rejected'?'Rejected':'Pending'}
    if(status==='confirmed'&&item?.amount==null){const n=Number(amounts[id]);if(!Number.isFinite(n)||n<=0)return setMessage('Enter the verified payment amount before confirming this UPI payment.');payload.amount=n}
    const{error}=await supabase.from('payments').update(payload).eq('id',id)
    if(error)setMessage(error.message);else{setAmounts(a=>{const n={...a};delete n[id];return n});setMessage(status==='confirmed'?'Payment confirmed. Challan balance updated.':'Payment status updated.');await load()}
  }
  async function recordPayment(e){
    e.preventDefault();setMessage('')
    const bill=bills.find(b=>b.id===selectedBill),n=Number(amount)
    if(!bill)return setMessage('Select a bill / challan.')
    const due=outstandingFor(bill)
    if(!Number.isFinite(n)||n<=0||n>due+0.001)return setMessage('Enter an amount greater than ₹0 and no more than the outstanding balance ('+money(due)+').')
    if(mode==='UPI'&&!reference.trim())return setMessage('Enter the UTR / reference for UPI payment.')
    setSaving(true)
    const{data:{user}}=await supabase.auth.getUser()
    const confirmed=mode!=='UPI'
    const{error}=await supabase.from('payments').insert({customer_id:bill.customer_id,challan_id:bill.id,payment_date:localDate(),amount:n,mode,status:confirmed?'confirmed':'pending',payment_status:confirmed?'Confirmed':'Pending Verification',source:'admin',recorded_by:user?.id||null,reference_no:reference.trim()||null,notes:notes.trim()||'Admin payment entry'})
    setSaving(false)
    if(error){setMessage(error.message);return}
    setMessage(confirmed?'Payment recorded. Outstanding balance updated.':'UPI entry saved as pending verification; balance will update after confirmation.')
    setAmount('');setReference('');setNotes('');setSelectedBill('');await load()
  }
  async function saveDueDate(bill){
    setSavingDue(bill.id);setMessage('')
    const{error}=await supabase.from('challans').update({due_date:dueDates[bill.id]||null,whatsapp_payment_reminder_stage:null,whatsapp_payment_reminder_last_sent_at:null,updated_at:new Date().toISOString()}).eq('id',bill.id)
    setSavingDue('')
    if(error)setMessage(error.message);else{setMessage('Due date saved for '+(bill.challan_no||'challan')+'. Reminder schedule reset for this bill.');await load()}
  }

  return <section className='role-dashboard'>
    <button className='secondary' type='button' onClick={onBack}>← Dashboard</button>
    <div className='admin-panel'>
      <div className='panel-heading'><div><span className='badge'>ADMIN • PAYMENTS</span><h2>Payment & Credit Ledger</h2><p>Track bills, credit balances, partial payments, cash collections and UPI verification.</p></div><button className='secondary' type='button' onClick={load} disabled={loading}>{loading?'Refreshing…':'↻ Refresh'}</button></div>
      <div className='admin-stats'>
        <div className='stat-card'><strong>{money(totalOutstanding)}</strong><span>Outstanding Credit</span></div>
        <div className='stat-card'><strong>{money(totalConfirmed)}</strong><span>Confirmed Transactions</span></div>
        <div className='stat-card'><strong>{money(pending)}</strong><span>Pending UPI</span></div>
        <div className='stat-card'><strong>{openBills.length}</strong><span>Unpaid Bills</span></div>
      </div>
      {message&&<p className={/saved|recorded|updated|confirmed/i.test(message)&&!message.includes('no more')?'muted':'error'}>{message}</p>}

      <div className='admin-form' style={{marginBottom:24}}>
        <h3>＋ Record Payment / Partial Payment</h3>
        <p className='muted'>Cash and bank payments are recorded as received. UPI entries remain pending until Admin verifies the UTR.</p>
        <form className='admin-form' onSubmit={recordPayment}>
          <label>Customer Bill / Challan<select required value={selectedBill} onChange={e=>{setSelectedBill(e.target.value);setAmount('')}}><option value=''>Select unpaid bill</option>{openBills.map(b=><option key={b.id} value={b.id}>{b.challan_no||'Bill'} • {b.customer?.name||b.party_name||'Customer'} • Balance {money(outstandingFor(b))}</option>)}</select></label>
          {selected&&<p className='muted'>Bill total: {money(selected.subtotal)} • Paid so far: {money(selected.paid_amount)} • Remaining: {money(outstandingFor(selected))}</p>}
          <label>Payment Mode<select value={mode} onChange={e=>setMode(e.target.value)}><option value='Cash'>Cash received</option><option value='UPI'>UPI / Online</option><option value='Bank'>Bank transfer</option></select></label>
          <label>Amount Received (₹)<input required type='number' min='0.01' max={selected?outstandingFor(selected):undefined} step='0.01' value={amount} onChange={e=>setAmount(e.target.value)} placeholder='Enter amount received'/></label>
          {mode==='UPI'&&<label>UTR / Reference Number<input required value={reference} onChange={e=>setReference(e.target.value)} placeholder='Enter UTR for verification'/></label>}
          <label>Notes (optional)<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder='Receipt details or collection notes'/></label>
          <button disabled={saving||!selectedBill||!amount}>{saving?'Saving…':mode==='UPI'?'Save UPI for Verification':'Record Payment'}</button>
        </form>
      </div>

      <h3>Outstanding Bills & Credit</h3>
      {loading?<p className='muted'>Loading payment records…</p>:<div className='data-list'>{bills.map(b=>{const due=outstandingFor(b);return <article key={b.id}>
        <strong>{b.challan_no||'Bill'} · {b.customer?.name||b.party_name||'Customer'}</strong>
        <span>{b.customer?.mobile||'No mobile'} • {b.item_name||'CCTV / IT / Service'} • Total {money(b.subtotal)} • Paid {money(b.paid_amount)} • <b>{due>0?'Balance '+money(due):'PAID'}</b></span>
        <span>Due date: {b.due_date||'Not set'} • Status: {due<=0?'Paid':Number(b.paid_amount||0)>0?'Partial':'Credit / Pending'}</span>
        {due>0&&<div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginTop:8}}><label style={{minWidth:180,flex:'1 1 180px'}}>Set due date<input type='date' value={dueDates[b.id]||''} onChange={e=>setDueDates(v=>({...v,[b.id]:e.target.value}))}/></label><button type='button' className='secondary' disabled={savingDue===b.id} onClick={()=>saveDueDate(b)}>{savingDue===b.id?'Saving…':'Save Due Date'}</button></div>}
      </article>})}{!bills.length&&<p className='muted'>No bills found. Create a Challan from Admin → Challans first.</p>}</div>}

      <h3 style={{marginTop:28}}>Transaction History</h3>
      <div className='table-wrap payment-ledger-wrap'><table className='payment-ledger-table'><thead><tr><th>Date</th><th>Customer</th><th>Bill</th><th>Amount</th><th>Mode</th><th>UTR / Reference</th><th>Status</th><th>Action</th></tr></thead><tbody>{items.map(p=><tr key={p.id}><td>{p.payment_date}</td><td>{p.customer?.name||'—'}{p.customer?.mobile?<><br/><span className='muted'>{p.customer.mobile}</span></>:null}</td><td>{bills.find(b=>b.id===p.challan_id)?.challan_no||'—'}</td><td>{p.amount==null?(p.status==='pending'?<input type='number' min='0.01' step='0.01' value={amounts[p.id]||''} onChange={e=>setAmounts(a=>({...a,[p.id]:e.target.value}))} placeholder='Verified ₹'/>: '—'):money(p.amount)}</td><td>{p.mode||'—'}</td><td>{p.reference_no||'—'}</td><td><span className={'payment-status payment-status-'+p.status}>{p.payment_status||p.status}</span></td><td>{p.status==='pending'?<span><button type='button' onClick={()=>updateStatus(p.id,'confirmed')}>Confirm</button> <button type='button' className='secondary' onClick={()=>updateStatus(p.id,'rejected')}>Reject</button></span>:'—'}</td></tr>)}</tbody></table></div>
      <div className='payment-ledger-mobile'>{items.map(p=><article className='payment-card' key={'mobile-'+p.id}><div className='payment-card-head'><strong>{p.customer?.name||'—'}</strong><span className={'payment-status payment-status-'+p.status}>{p.payment_status||p.status}</span></div><div className='payment-card-grid'><div><small>Date</small><b>{p.payment_date||'—'}</b></div><div><small>Bill</small><b>{bills.find(b=>b.id===p.challan_id)?.challan_no||'—'}</b></div><div><small>Amount</small><b>{p.amount==null?'—':money(p.amount)}</b></div><div><small>Mode</small><b>{p.mode||'—'}</b></div></div>{p.reference_no&&<div className='payment-card-phone'>UTR: {p.reference_no}</div>}{p.status==='pending'&&<div className='payment-card-actions'><button type='button' onClick={()=>updateStatus(p.id,'confirmed')}>Confirm</button><button type='button' className='secondary' onClick={()=>updateStatus(p.id,'rejected')}>Reject</button></div>}</article>)}</div>
    </div>
  </section>
}
