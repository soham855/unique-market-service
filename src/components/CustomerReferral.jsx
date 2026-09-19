import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
import './CustomerReferral.css'
const makeCode=name=>'UM'+String(name||'CUSTOMER').replace(/[^a-z0-9]/gi,'').slice(0,5).toUpperCase()+Math.random().toString(36).slice(2,6).toUpperCase()
export default function CustomerReferral({profile,onBack}){
 const [customer,setCustomer]=useState(null),[code,setCode]=useState(null),[rules,setRules]=useState([]),[history,setHistory]=useState([]),[name,setName]=useState(''),[mobile,setMobile]=useState(''),[company,setCompany]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(true)
 useEffect(()=>{load()},[profile?.id])
 async function load(){
  setLoading(true);setMessage('')
  const {data:c,error:ce}=await supabase.from('customers').select('id,name').eq('profile_id',profile.id).maybeSingle()
  if(ce||!c){setMessage(ce?.message||'Customer record not found.');setLoading(false);return}
  setCustomer(c)
  let {data:rc}=await supabase.from('customer_referral_codes').select('*').eq('customer_id',c.id).maybeSingle()
  if(!rc){const r=await supabase.from('customer_referral_codes').insert({customer_id:c.id,code:makeCode(c.name)}).select('*').single();rc=r.data}
  setCode(rc)
  const rr=await supabase.from('referral_rules').select('*').eq('active',true).order('created_at');setRules(rr.data||[])
  const rh=await supabase.from('referrals').select('*').eq('referrer_customer_id',c.id).order('created_at',{ascending:false});setHistory(rh.data||[]);setLoading(false)
 }
 async function submit(){
  if(!name.trim()||!mobile.trim()){setMessage('Enter referral name and mobile number.');return}
  const rule=rules[0]
  const payload={referral_code_id:code.id,referrer_customer_id:customer.id,referred_name:name.trim(),referred_mobile:mobile.trim(),referred_company:company.trim()||null,reward_type:rule?.reward_type||'cash',reward_value:rule?.reward_value||500,reward_text:rule?.reward_text||'₹500 reward'}
  const {data:referral,error}=await supabase.from('referrals').insert(payload).select('*').single()
  if(error){setMessage(error.message);return}
  const {data:admins}=await supabase.from('profiles').select('id').eq('role','admin')
  if(admins?.length){
    const message=`${customer?.name||'Customer'} referred ${name.trim()} (${mobile.trim()})${company.trim()?' • '+company.trim():''}. Reward: ${payload.reward_text}.`
    await supabase.from('notifications').insert(admins.map(a=>({user_id:a.id,title:'🎁 New Customer Referral',message,type:'customer_referral',referral_id:referral?.id||null})))
  }
  setName('');setMobile('');setCompany('');setMessage('Referral submitted successfully. Admin has been notified.');await load()
 }
 return <section className="complaints-panel referral-panel"><div className="panel-heading"><div><span className="badge">REFERRAL SYSTEM</span><h2>Refer a Customer & Earn Rewards</h2><p>Share your referral code and track every referral from submission to reward.</p></div><button className="secondary" onClick={onBack}>← Back</button></div>
 {loading?<p className="muted">Loading referral account…</p>:<><div className="referral-hero-card"><div className="referral-hero-icon">🎁</div><div><span className="referral-eyebrow">CUSTOMER REFERRAL</span><h3>Invite a new customer</h3><p>Submit their details and your referral will reach Admin instantly.</p></div></div>
 <div className="referral-code-card"><div><span>Your Referral Code</span><strong>{code?.code}</strong></div><button type="button" onClick={()=>navigator.clipboard?.writeText(code?.code||'')}>Copy Code</button></div>
 <div className="referral-submit-card"><div className="referral-card-title"><span>👤</span><div><strong>Refer a Customer & Earn Rewards</strong><small>Fill in the customer details below</small></div></div>
 <div className="referral-grid"><label>Customer Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Enter customer name"/></label><label>Mobile Number<input value={mobile} onChange={e=>setMobile(e.target.value.replace(/\D/g,'').slice(0,10))} inputMode="numeric" maxLength={10} placeholder="10-digit mobile number"/></label><label>Company <em>Optional</em><input value={company} onChange={e=>setCompany(e.target.value)} placeholder="Company / business name"/></label></div>
 <button className="referral-submit-btn" type="button" onClick={submit}>Submit Referral <span>→</span></button></div><div className="form-section-title">Active Reward Rules</div><div className="referral-rules">{rules.map(r=><div className="module-card" key={r.id}><h3>{r.reward_text||r.name}</h3><p>{r.qualifying_condition||'Reward after successful conversion.'}</p></div>)}</div>
 <div className="form-section-title">Referral History</div><div className="referral-history">{history.length===0?<p className="muted">No referrals yet.</p>:history.map(r=><div className="module-card" key={r.id}><div><h3>{r.referred_name||'Referral'}</h3><p>{r.referred_mobile} · {new Date(r.created_at).toLocaleDateString('en-IN')}</p></div><span className="badge">{r.status.toUpperCase()}</span><p>{r.reward_text||''}</p></div>)}</div></>}
 {message&&<p className={message.toLowerCase().includes('error')||message.toLowerCase().includes('not found')?'error':'muted'}>{message}</p>}</section>
}