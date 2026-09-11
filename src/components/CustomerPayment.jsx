import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'

export default function CustomerPayment({profile,onBack}){
 const [customerId,setCustomerId]=useState(null),[message,setMessage]=useState(''),[payments,setPayments]=useState([]),[loading,setLoading]=useState(true)
 async function load(){
  if(!profile?.id)return
  setLoading(true);setMessage('')
  const {data:customer,error:customerError}=await supabase.from('customers').select('id').eq('profile_id',profile.id).maybeSingle()
  if(customerError){setMessage(customerError.message);setLoading(false);return}
  if(!customer){setCustomerId(null);setPayments([]);setMessage('Customer record is not linked to this login. Please ask Admin to link your customer account.');setLoading(false);return}
  setCustomerId(customer.id)
  const {data:p,error:paymentsError}=await supabase.from('payments').select('id,payment_date,amount,mode,reference_no,status,payment_status,created_at,challan_id,challans(challan_no)').eq('customer_id',customer.id).order('created_at',{ascending:false}).limit(100)
  if(paymentsError)setMessage(paymentsError.message); else setPayments(p||[])
  setLoading(false)
 }
 useEffect(()=>{load()},[profile?.id])
 return <section className='role-dashboard'><button type='button' className='secondary' onClick={onBack}>← Dashboard</button><div className='admin-panel'><div className='panel-heading'><div><span className='badge'>CUSTOMER • PAYMENTS</span><h2>Payment History</h2><p>All payments recorded for your service calls are shown here.</p></div><button type='button' className='secondary' onClick={load} disabled={loading}>{loading?'Refreshing…':'Refresh'}</button></div>{message&&<p className='error'>{message}</p>}{customerId&&<div className='table-wrap'><table><thead><tr><th>Call ID</th><th>Date</th><th>Amount Paid</th><th>Payment Mode</th><th>UTR / Reference</th><th>Status</th></tr></thead><tbody>{payments.length===0?<tr><td colSpan='6' className='muted'>No payments recorded yet.</td></tr>:payments.map(p=><tr key={p.id}><td>{p.challans?.challan_no||'—'}</td><td>{p.payment_date||new Date(p.created_at).toLocaleDateString('en-IN')}</td><td>{p.amount==null?'—':`₹${Number(p.amount).toLocaleString('en-IN')}`}</td><td>{p.mode==='UPI'?'Online / UPI':p.mode||'—'}</td><td>{p.reference_no||'—'}</td><td>{p.payment_status||p.status||'—'}</td></tr>)}</tbody></table></div>}</div></section>
}
