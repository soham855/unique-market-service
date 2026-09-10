import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'

export default function PaymentLedger({onBack}){
  const [items,setItems]=useState([]),[message,setMessage]=useState(''),[amounts,setAmounts]=useState({})
  async function load(){const {data,error}=await supabase.from('payments').select('id,payment_date,amount,mode,reference_no,status,source,notes,created_at,customer:customer_id(name,mobile),recorder:recorded_by(full_name)').order('created_at',{ascending:false}).limit(500);if(error)setMessage(error.message);else setItems(data||[])}
  useEffect(()=>{load()},[])
  async function updateStatus(id,status){
    setMessage('')
    const item=items.find(p=>p.id===id)
    let payload={status}
    if(status==='confirmed'&&item?.amount==null){const amount=Number(amounts[id]);if(!Number.isFinite(amount)||amount<=0)return setMessage('Enter the verified payment amount before confirming this UPI payment.');payload.amount=amount}
    const {error}=await supabase.from('payments').update(payload).eq('id',id);if(error)setMessage(error.message);else{setAmounts(a=>{const n={...a};delete n[id];return n});load()}
  }
  const total=items.filter(p=>p.status==='confirmed').reduce((s,p)=>s+Number(p.amount||0),0),pending=items.filter(p=>p.status==='pending').reduce((s,p)=>s+Number(p.amount||0),0)
  return <section className='role-dashboard'><button className='secondary' type='button' onClick={onBack}>← Dashboard</button><div className='admin-panel'><div className='panel-heading'><div><span className='badge'>ADMIN • PAYMENTS</span><h2>Payment Ledger</h2><p>Central ledger for UPI and technician cash collections.</p></div></div><div className='admin-stats'><div className='stat-card'><strong>₹{total.toLocaleString('en-IN')}</strong><span>Confirmed</span></div><div className='stat-card'><strong>₹{pending.toLocaleString('en-IN')}</strong><span>Pending UPI</span></div><div className='stat-card'><strong>{items.length}</strong><span>Transactions</span></div></div>{message&&<p className='error'>{message}</p>}<div className='table-wrap'><table><thead><tr><th>Date</th><th>Customer</th><th>Amount</th><th>Mode</th><th>Source</th><th>Reference</th><th>Status</th><th>Recorded by</th><th>Action</th></tr></thead><tbody>{items.map(p=><tr key={p.id}><td>{p.payment_date}</td><td>{p.customer?.name||'—'}{p.customer?.mobile?<><br/><span className='muted'>{p.customer.mobile}</span></>:null}</td><td>{p.amount==null?(p.status==='pending'?<input type='number' min='0.01' step='0.01' value={amounts[p.id]||''} onChange={e=>setAmounts(a=>({...a,[p.id]:e.target.value}))} placeholder='Verified ₹'/>:'—'):`₹${Number(p.amount).toLocaleString('en-IN')}`}</td><td>{p.mode||'—'}</td><td>{p.source||'—'}</td><td>{p.reference_no||'—'}</td><td>{p.status}</td><td>{p.recorder?.full_name||'—'}</td><td>{p.status==='pending'?<span><button type='button' onClick={()=>updateStatus(p.id,'confirmed')}>Confirm</button> <button className='secondary' type='button' onClick={()=>updateStatus(p.id,'rejected')}>Reject</button></span>:'—'}</td></tr>)}</tbody></table></div></div></section>
}