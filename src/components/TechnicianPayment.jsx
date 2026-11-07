import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabase'

export default function TechnicianPayment({profile,onBack}){
 const [customers,setCustomers]=useState([])
 const [customerId,setCustomerId]=useState('')
 const [challans,setChallans]=useState([])
 const [complaints,setComplaints]=useState([])
 const [targetType,setTargetType]=useState('service_call')
 const [targetId,setTargetId]=useState('')
 const [amount,setAmount]=useState('')
 const [referenceNo,setReferenceNo]=useState('')
 const [notes,setNotes]=useState('')
 const [settings,setSettings]=useState(null)
 const [saving,setSaving]=useState(false)
 const [message,setMessage]=useState('')
 const [mode,setMode]=useState('Online')
 const [cashPaymentId,setCashPaymentId]=useState('')
 const [otp,setOtp]=useState('')
 const [otpSent,setOtpSent]=useState(false)
 const [otpBusy,setOtpBusy]=useState(false)

 useEffect(()=>{
  (async()=>{
   try{
    const [cr,pr]=await Promise.all([
     supabase.from('customers').select('id,name,mobile').order('name').limit(500),
     supabase.from('payment_settings').select('upi_id,account_name,qr_image_url,is_enabled').limit(1).maybeSingle()
    ])
    if(cr.error){setCustomers([]);setMessage('Customer list load failed: '+cr.error.message)}
    else setCustomers(cr.data||[])
    if(pr.error){setSettings(null);setMessage('Payment settings load failed: '+pr.error.message)}
    else setSettings(pr.data||null)
   }catch(err){
    setMessage('Payment screen load failed: '+(err?.message||'Unknown error'))
   }
  })()
 },[])

 useEffect(()=>{
  (async()=>{
   setTargetId('')
   setChallans([])
   setComplaints([])
   if(!customerId)return
   const [cr,pr]=await Promise.all([
    supabase.from('challans').select('id,challan_no,challan_date,subtotal,paid_amount,payment_status,status').eq('customer_id',customerId).order('challan_date',{ascending:false}).limit(100),
    supabase.from('complaints').select('id,ticket_no,title,created_at,status').eq('customer_id',customerId).eq('technician_id',profile.id).order('created_at',{ascending:false}).limit(100)
   ])
   if(cr.error)setMessage(cr.error.message)
   else setChallans(cr.data||[])
   if(pr.error)setMessage(pr.error.message)
   else setComplaints(pr.data||[])
  })()
 },[customerId])

 const upiId=settings?.is_enabled!==false?(settings?.upi_id||''):''
 const accountName=settings?.account_name||'Unique Market'
 const qrUrl=useMemo(()=>upiId?
  `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(accountName)}&cu=INR`)}`
  :'',[upiId,accountName])

 async function requestCashOtp(paymentId){
  setOtpBusy(true)
  setMessage('')
  try{
   const {data,error}=await supabase.functions.invoke('cash-payment-otp',{
    body:{action:'request',payment_id:paymentId}
   })
   if(error||data?.ok===false||data?.error){
    setMessage(data?.error||data?.message||error?.message||'OTP request failed. Payment remains pending.')
    setOtpBusy(false)
    return false
   }
   setOtpSent(true)
   setMessage(data?.message||'Customer registered mobile var OTP pathavla aahe. OTP verify kara.')
   setOtpBusy(false)
   return true
  }catch(err){
   setMessage(err?.message||'OTP request failed. Payment remains pending.')
   setOtpBusy(false)
   return false
  }
 }

 async function verifyCashOtp(e){
  e.preventDefault()
  if(!cashPaymentId||!/^\d{6}$/.test(otp.trim())){
   setMessage('Valid 6-digit customer OTP enter kara.')
   return
  }
  setOtpBusy(true)
  setMessage('')
  try{
   const {data,error}=await supabase.functions.invoke('cash-payment-otp',{
    body:{action:'verify',payment_id:cashPaymentId,otp:otp.trim()}
   })
   if(error||data?.ok===false||data?.error){
    setMessage(data?.error||data?.message||error?.message||'OTP verification failed.')
    setOtpBusy(false)
    return
   }
   setMessage(data?.message||'Cash payment OTP verified. Payment confirmed successfully.')
   setCashPaymentId('')
   setOtp('')
   setOtpSent(false)
   setAmount('')
   setReferenceNo('')
   setNotes('')
   setCustomerId('')
   setTargetId('')
   setMode('Online')
   setOtpBusy(false)
  }catch(err){
   setMessage(err?.message||'OTP verification failed.')
   setOtpBusy(false)
  }
 }

 async function submit(e){
  e.preventDefault()
  setMessage('')
  if(!customerId||!targetId||!amount||Number(amount)<=0)
   return setMessage('Select customer, Service Call / Challan and enter a valid amount.')
  if(targetType==='service_call'&&!complaints.some(x=>x.id===targetId))
   return setMessage('Selected Service Call is invalid. Select it again.')
  if(targetType==='challan'&&!challans.some(x=>x.id===targetId))
   return setMessage('Selected Challan is invalid. Select it again.')
  if(mode==='Online'&&!referenceNo.trim())
   return setMessage('Customer UTR / reference number is required for online payment.')

  setSaving(true)
  try{
   const paymentId=mode==='Cash'?crypto.randomUUID():undefined
   const payload={
    ...(paymentId?{id:paymentId}:{}),
    customer_id:customerId,
    challan_id:targetType==='challan'?targetId:null,
    complaint_id:targetType==='service_call'?targetId:null,
    payment_date:new Date().toISOString().slice(0,10),
    amount:Number(amount),
    mode:mode==='Online'?'UPI':'Cash',
    status:'pending',
    ...(mode==='Cash'?{payment_status:'Pending OTP'}:{}),
    source:'technician',
    recorded_by:profile.id,
    reference_no:mode==='Online'?referenceNo.trim():null,
    notes:notes.trim()||(mode==='Online'?'Customer QR payment — verification pending':'Cash collected by technician — OTP verification pending')
   }

   const {error}=await supabase.from('payments').insert(payload)
   if(error){setMessage('Payment save failed: '+error.message);return}

   if(mode==='Cash'){
    setCashPaymentId(paymentId)
    setOtp('')
    setOtpSent(false)
    await requestCashOtp(paymentId)
    return
   }

   setMessage('UTR submitted. Payment is Verification Pending. Admin verification pending.')
   setAmount('')
   setReferenceNo('')
   setNotes('')
  }catch(err){
   setMessage('Payment submission failed: '+(err?.message||'Unknown error'))
  }finally{
   setSaving(false)
  }
 }

 return <section className='role-dashboard'>
  <button className='secondary' type='button' onClick={onBack}>← Dashboard</button>
  <div className='admin-panel'>
   <div className='panel-heading'>
    <div>
     <span className='badge'>TECHNICIAN • CUSTOMER PAYMENT</span>
     <h2>Collect Customer Payment</h2>
     <p>Select the Challan / Call ID against which this payment is collected.</p>
    </div>
   </div>

   {message&&<p className={message.includes('successfully')||message.startsWith('UTR submitted')||message.includes('OTP pathavla')?'muted':'error'}>{message}</p>}

   {cashPaymentId?(
    <div className='admin-form'>
     <p className='muted'>Cash payment pending customer OTP verification. Payment ID: {cashPaymentId}</p>
     <form onSubmit={verifyCashOtp}>
      <label>Customer OTP
       <input
        inputMode='numeric'
        autoComplete='one-time-code'
        maxLength={6}
        value={otp}
        onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
        placeholder='Enter 6-digit OTP'
        required
       />
      </label>
      <button disabled={otpBusy||otp.length!==6}>
       {otpBusy?'Verifying…':'Verify OTP & Confirm Cash'}
      </button>
     </form>
     <button className='secondary' type='button' disabled={otpBusy} onClick={()=>requestCashOtp(cashPaymentId)}>
      {otpBusy?'Please wait…':'Resend OTP'}
     </button>
     <p className='muted'>Payment confirm honyaadhi customer kadun registered mobile var aalele OTP ghya. OTP konalahi share karu naka.</p>
    </div>
   ):(
    <form className='admin-form' onSubmit={submit}>
     <label>Customer
      <select value={customerId} onChange={e=>setCustomerId(e.target.value)}>
       <option value=''>Select customer</option>
       {customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.mobile?' • '+c.mobile:''}</option>)}
      </select>
     </label>

     <label>Payment Against
      <select value={targetType} onChange={e=>{setTargetType(e.target.value);setTargetId('')}}>
       <option value='service_call'>Service Call</option>
       <option value='challan'>Challan</option>
      </select>
     </label>
     <label>{targetType==='service_call'?'Service Call / Ticket ID':'Challan No.'}
      <select value={targetId} onChange={e=>setTargetId(e.target.value)} disabled={!customerId}>
       <option value=''>{!customerId?'Select customer first':targetType==='service_call'?(complaints.length?'Select Service Call':'No Service Call found'):(challans.length?'Select Challan':'No Challan found')}</option>
       {targetType==='service_call'
        ?complaints.map(c=><option key={c.id} value={c.id}>{c.complaint_no||c.ticket_no||c.id}{c.title?' • '+c.title:''}</option>)
        :challans.map(c=><option key={c.id} value={c.id}>{c.challan_no}{c.challan_date?' • '+c.challan_date:''}</option>)}
      </select>
     </label>

     {mode==='Online'&&<div style={{textAlign:'center',padding:'10px 0 16px'}}>
      <strong>Scan & Pay to Unique Market</strong>
      {upiId||settings?.qr_image_url?<>
       <p className='muted' style={{margin:'5px 0'}}>UPI: {upiId||'Configured QR'}</p>
       <img src={settings?.qr_image_url||qrUrl} alt='Unique Market UPI QR' style={{width:220,height:220,objectFit:'contain',border:'1px solid #ddd',borderRadius:12}}/>
       <p className='muted' style={{margin:'8px 0 0'}}>After customer payment, enter the UTR below.</p>
      </>:<p className='error'>Company UPI/QR is not configured. Ask Admin to configure Payment Settings before accepting online payment.</p>}
     </div>}

     <label>Payment Mode
      <select value={mode} onChange={e=>{setMode(e.target.value);setReferenceNo('')}}>
       <option value='Online'>Online / UPI</option>
       <option value='Cash'>Cash</option>
      </select>
     </label>

     <label>Payment Amount
      <input type='number' min='1' step='0.01' value={amount} onChange={e=>setAmount(e.target.value)} placeholder='₹ Amount paid by customer'/>
     </label>

     {mode==='Online'&&<label>Customer UTR / Reference No.
      <input required value={referenceNo} onChange={e=>setReferenceNo(e.target.value)} placeholder='Enter UTR / transaction reference'/>
     </label>}

     {mode==='Cash'&&<p className='muted' style={{margin:'-4px 0 8px'}}>Cash payment OTP verification nantarach confirm hoil. Customer chya registered mobile var OTP pathavla jail.</p>}

     <label>Notes (optional)
      <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder='Optional payment notes'/>
     </label>

     <button disabled={saving||!customerId||!targetId||!amount||(mode==='Online'&&!referenceNo.trim())}>
      {saving?'Saving…':mode==='Online'?'Submit UTR for Verification':'Save Cash & Send OTP'}
     </button>
    </form>
   )}
  </div>
 </section>
}
