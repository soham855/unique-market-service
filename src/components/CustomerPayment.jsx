import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabase'

const FALLBACK_UPI='sohammane855-8@okhdfcbank'

export default function CustomerPayment({profile,onBack}){
  const [settings,setSettings]=useState(null),[amount,setAmount]=useState(''),[utr,setUtr]=useState(''),[message,setMessage]=useState(''),[saving,setSaving]=useState(false),[payments,setPayments]=useState([])
  async function load(){
    const [{data:s},{data:p}]=await Promise.all([
      supabase.from('payment_settings').select('upi_id,account_name,qr_image_url,is_enabled').limit(1).maybeSingle(),
      supabase.from('payments').select('id,payment_date,amount,mode,reference_no,status,created_at').eq('customer_id',profile.id).order('created_at',{ascending:false}).limit(50)
    ])
    setSettings(s||null);setPayments(p||[])
  }
  useEffect(()=>{load()},[profile.id])
  const upiId=settings?.upi_id||FALLBACK_UPI
  const accountName=settings?.account_name||'Unique Market'
  const qrUrl=useMemo(()=>{const upi=`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(accountName)}${amount&&Number(amount)>0?`&am=${encodeURIComponent(Number(amount).toFixed(2))}&cu=INR`:''}`;return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(upi)}`},[upiId,accountName,amount])
  const upiLink=useMemo(()=>`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(accountName)}${amount&&Number(amount)>0?`&am=${encodeURIComponent(Number(amount).toFixed(2))}&cu=INR`:''}`,[upiId,accountName,amount])
  async function submit(e){e.preventDefault();setMessage('');if(!amount||Number(amount)<=0)return setMessage('Enter a valid amount.');if(!utr.trim())return setMessage('Enter the UPI transaction / UTR reference.');setSaving(true);const {error}=await supabase.from('payments').insert({customer_id:profile.id,payment_date:new Date().toISOString().slice(0,10),amount:Number(amount),mode:'UPI',reference_no:utr.trim(),status:'pending',source:'customer',notes:'Customer marked UPI payment'});setSaving(false);if(error)return setMessage(error.message);setMessage('UPI payment submitted. Admin will verify and confirm it.');setAmount('');setUtr('');load()}
  return <section className='role-dashboard'><button className='secondary' type='button' onClick={onBack}>← Dashboard</button><div className='admin-panel'><div className='panel-heading'><div><span className='badge'>CUSTOMER • PAYMENT</span><h2>Pay Service Amount</h2><p>Pay securely by UPI directly to Unique Market.</p></div></div><div className='payment-card'><div><strong>{accountName}</strong><p className='muted'>UPI ID: {upiId}</p><label>Amount<input type='number' min='1' step='0.01' value={amount} onChange={e=>setAmount(e.target.value)} placeholder='₹ Amount'/></label><a className='primary' href={amount&&Number(amount)>0?upiLink:undefined} onClick={e=>{if(!amount||Number(amount)<=0){e.preventDefault();setMessage('Enter a valid amount first.')}}}>Pay Now with UPI</a><p className='muted'>Pay Now opens your installed UPI app. After payment, enter the UTR below so Admin can verify it.</p></div><img className='payment-qr' src={settings?.qr_image_url||qrUrl} alt='UPI QR code'/></div><form className='admin-form' onSubmit={submit}><label>UPI Transaction / UTR<input value={utr} onChange={e=>setUtr(e.target.value)} placeholder='Enter transaction reference'/></label><button disabled={saving}>{saving?'Submitting…':'I Have Paid via UPI'}</button></form>{message&&<p className={message.includes('submitted')?'muted':'error'}>{message}</p>}<h3>Payment History</h3><div className='table-wrap'><table><thead><tr><th>Date</th><th>Amount</th><th>Mode</th><th>Reference</th><th>Status</th></tr></thead><tbody>{payments.map(p=><tr key={p.id}><td>{p.payment_date}</td><td>₹{Number(p.amount).toLocaleString('en-IN')}</td><td>{p.mode}</td><td>{p.reference_no||'—'}</td><td>{p.status}</td></tr>)}</tbody></table></div></div></section>
}