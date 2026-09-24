import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabase'

export default function CustomerPayment({profile,onBack}){
 const [customerId,setCustomerId]=useState(null),[message,setMessage]=useState(''),[payments,setPayments]=useState([]),[challans,setChallans]=useState([]),[selectedId,setSelectedId]=useState(''),[utr,setUtr]=useState(''),[settings,setSettings]=useState(null),[loading,setLoading]=useState(true),[submitting,setSubmitting]=useState(false)
 async function load(){
  if(!profile?.id)return
  setLoading(true);setMessage('')
  const {data:customer,error:customerError}=await supabase.from('customers').select('id').eq('profile_id',profile.id).maybeSingle()
  if(customerError){setMessage(customerError.message);setLoading(false);return}
  if(!customer){setCustomerId(null);setPayments([]);setChallans([]);setMessage('Customer record is not linked to this login. Please ask Admin to link your customer account.');setLoading(false);return}
  setCustomerId(customer.id)
  const [{data:p,error:paymentsError},{data:c,error:challansError},{data:s,error:settingsError}]=await Promise.all([
   supabase.from('payments').select('id,payment_date,amount,mode,reference_no,status,payment_status,created_at,challan_id,challans(challan_no)').eq('customer_id',customer.id).order('created_at',{ascending:false}).limit(100),
   supabase.from('challans').select('id,challan_no,challan_date,subtotal,paid_amount,payment_status,status').eq('customer_id',customer.id).in('status',['issued','completed']).order('challan_date',{ascending:false}).limit(100),
   supabase.from('payment_settings').select('upi_id,account_name,qr_image_url,is_enabled').limit(1).maybeSingle()
  ])
  if(paymentsError)setMessage(paymentsError.message);else setPayments(p||[])
  if(challansError)setMessage(challansError.message);else setChallans((c||[]).filter(x=>Number(x.subtotal||0)>Number(x.paid_amount||0)))
  if(settingsError)setMessage(settingsError.message);else setSettings(s||null)
  setLoading(false)
 }
 useEffect(()=>{load()},[profile?.id])
 const selected=challans.find(c=>c.id===selectedId)
 const balance=selected?Math.max(0,Number(selected.subtotal||0)-Number(selected.paid_amount||0)):0
 const upiEnabled=settings?.is_enabled!==false
 const upiId=upiEnabled?(settings?.upi_id||''):''
 const accountName=settings?.account_name||'Unique Market'
 const qrUrl=useMemo(()=>upiId?'https://api.qrserver.com/v1/create-qr-code/?size=280x280&data='+encodeURIComponent('upi://pay?pa='+encodeURIComponent(upiId)+'&pn='+encodeURIComponent(accountName)+'&am='+balance.toFixed(2)+'&cu=INR'):'',[upiId,accountName,balance])
 async function submit(e){
  e.preventDefault();setMessage('')
  if(!customerId||!selectedId||balance<=0)return setMessage('Select an unpaid Call ID / Challan No.')
  if(!upiId)return setMessage('Online payment is not configured. Please contact Unique Market.')
  if(!utr.trim())return setMessage('UTR / transaction reference is mandatory.')
  setSubmitting(true)
  const {error}=await supabase.from('payments').insert({customer_id:customerId,challan_id:selectedId,payment_date:new Date().toISOString().slice(0,10),amount:balance,mode:'UPI',reference_no:utr.trim(),status:'pending',source:'customer',payment_status:'Pending Verification',notes:'Customer QR payment — verification pending'})
  setSubmitting(false)
  if(error){setMessage(error.message);return}
  setMessage('Payment submitted successfully. Your UTR is pending verification by Unique Market.')
  setUtr('');setSelectedId('');await load()
 }
 return <section className='role-dashboard'><button type='button' className='secondary' onClick={onBack}>← Dashboard</button><div className='admin-panel'><div className='panel-heading'><div><span className='badge'>CUSTOMER • PAYMENTS</span><h2>Pay Service Bill</h2><p>Select an unpaid Call ID / Challan No., scan the company QR, pay the displayed amount, and submit your UTR.</p></div><button type='button' className='secondary' onClick={load} disabled={loading}>{loading?'Refreshing…':'Refresh'}</button></div>{message&&<p className={message.startsWith('Payment submitted')?'muted':'error'}>{message}</p>}{customerId&&<form className='admin-form' onSubmit={submit}><label>Call ID / Challan No.<select value={selectedId} onChange={e=>{setSelectedId(e.target.value);setUtr('')}} disabled={loading||!upiId}><option value=''>{challans.length?'Select unpaid Call ID / Challan No.':'No unpaid challan found'}</option>{challans.map(c=><option key={c.id} value={c.id}>{c.challan_no} • Balance ₹{Math.max(0,Number(c.subtotal||0)-Number(c.paid_amount||0)).toLocaleString('en-IN')}</option>)}</select></label>{selected&&<div style={{textAlign:'center',padding:'10px 0 16px'}}><strong>Scan & Pay to Unique Market</strong><p className='muted' style={{margin:'5px 0'}}>Amount: ₹{balance.toLocaleString('en-IN',{minimumFractionDigits:2})}<br/>UPI: {upiId}</p><img src={settings?.qr_image_url||qrUrl} alt='Unique Market UPI QR' style={{width:220,height:220,objectFit:'contain',border:'1px solid #ddd',borderRadius:12}}/><p className='muted' style={{margin:'8px 0 0'}}>Pay the exact displayed amount, then enter the UTR below.</p></div>}{!upiId&&<p className='error'>Company UPI/QR is not configured. Please contact Unique Market.</p>}{selected&&upiId&&<label>UTR / Transaction Reference No.<input required value={utr} onChange={e=>setUtr(e.target.value)} placeholder='Enter UTR after payment' autoComplete='off'/></label>}{selected&&upiId&&<button disabled={submitting||!utr.trim()}>{submitting?'Submitting…':'Submit Payment & UTR'}</button>}</form>}<hr/><h3>Payment History</h3><div className='table-wrap'><table><thead><tr><th>Call ID</th><th>Date</th><th>Amount</th><th>Mode</th><th>UTR / Reference</th><th>Status</th></tr></thead><tbody>{payments.length===0?<tr><td colSpan='6' className='muted'>No payments recorded yet.</td></tr>:payments.map(p=><tr key={p.id}><td>{p.challans?.challan_no||'—'}</td><td>{p.payment_date||new Date(p.created_at).toLocaleDateString('en-IN')}</td><td>{p.amount==null?'—':'₹'+Number(p.amount).toLocaleString('en-IN')}</td><td>{p.mode==='UPI'?'Online / UPI':p.mode||'—'}</td><td>{p.reference_no||'—'}</td><td>{p.payment_status||p.status||'—'}</td></tr>)}</tbody></table></div></div></section>
}
