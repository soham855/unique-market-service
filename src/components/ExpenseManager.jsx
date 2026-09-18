import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabase'

const CATEGORIES=['Fuel','Material','Labour','Travel','Food','Office','Rent','Electricity','Internet','AMC/Service','Tools & Equipment','Bank Charges','Other']

const card={background:'rgba(15,23,42,.72)',border:'1px solid rgba(148,163,184,.18)',borderRadius:18,padding:18}
const input={width:'100%',boxSizing:'border-box',padding:'11px 12px',borderRadius:10,border:'1px solid rgba(148,163,184,.22)',background:'#0b1220',color:'#e5e7eb'}
export default function ExpenseManager({profile,onBack}){
 const [accounts,setAccounts]=useState([]),[categories,setCategories]=useState([]),[tx,setTx]=useState([])
 const [form,setForm]=useState({account_id:'',category_id:'',transaction_type:'expense',amount:'',transaction_date:new Date().toISOString().slice(0,10),description:'',vendor_name:''})
 const [transfer,setTransfer]=useState({from:'',to:'',amount:'',date:new Date().toISOString().slice(0,10),description:''})
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[month,setMonth]=useState(new Date().toISOString().slice(0,7))
 async function load(){
  setLoading(true)
  const [{data:a,error:ae},{data:c,error:ce},{data:t,error:te}]=await Promise.all([
   supabase.from('expense_accounts').select('*').eq('owner_id',profile.id).eq('is_active',true).order('created_at'),
   supabase.from('expense_categories').select('*').eq('owner_id',profile.id).eq('is_active',true).order('name'),
   supabase.from('expense_transactions').select('*').eq('owner_id',profile.id).order('transaction_date',{ascending:false}).order('created_at',{ascending:false}).limit(300)
  ])
  if(ae||ce||te)setMessage((ae||ce||te)?.message||'Unable to load expenses')
  setAccounts(a||[]);setCategories(c||[]);setTx(t||[])
  setForm(f=>({...f,account_id:f.account_id||(a?.[0]?.id||''),category_id:f.category_id||(c?.[0]?.id||'')}))
  setLoading(false)
 }
 useEffect(()=>{load()},[])
 const balances=useMemo(()=>accounts.map(a=>{
  const total=tx.filter(t=>t.account_id===a.id&&t.status==='confirmed').reduce((s,t)=>{
   if(t.transaction_type==='income')return s+Number(t.amount)
   if(t.transaction_type==='expense')return s-Number(t.amount)
   if(t.transaction_type==='transfer')return s-(t.transfer_account_id?a.id===t.transfer_account_id?0:Number(t.amount):0)
   return s
  },Number(a.opening_balance))
  return {...a,balance:total}
 }),[accounts,tx])
 const monthly=useMemo(()=>tx.filter(t=>t.status==='confirmed'&&t.transaction_date.startsWith(month)),[tx,month])
 const expenseTotal=monthly.filter(t=>t.transaction_type==='expense').reduce((s,t)=>s+Number(t.amount),0)
 const incomeTotal=monthly.filter(t=>t.transaction_type==='income').reduce((s,t)=>s+Number(t.amount),0)
 async function save(e){
  e.preventDefault();if(!form.account_id||!form.amount)return
  setSaving(true);setMessage('')
  const payload={...form,owner_id:profile.id,created_by:profile.id,amount:Number(form.amount)}
  const {error}=await supabase.from('expense_transactions').insert(payload)
  if(error)setMessage(error.message);else{setMessage('Transaction saved');setForm(f=>({...f,amount:'',description:'',vendor_name:''}));await load()}
  setSaving(false)
 }
 async function doTransfer(e){
  e.preventDefault()
  if(!transfer.from||!transfer.to||transfer.from===transfer.to||!transfer.amount)return
  setSaving(true);setMessage('')
  const transferId=crypto.randomUUID(),amount=Number(transfer.amount)
  const rows=[
   {owner_id:profile.id,account_id:transfer.from,transaction_type:'transfer',amount,transaction_date:transfer.date,description:transfer.description||'Account transfer',transfer_id:transferId,transfer_account_id:transfer.to,created_by:profile.id},
   {owner_id:profile.id,account_id:transfer.to,transaction_type:'income',amount,transaction_date:transfer.date,description:transfer.description||'Account transfer',transfer_id:transferId,transfer_account_id:transfer.from,created_by:profile.id}
  ]
  const {error}=await supabase.from('expense_transactions').insert(rows)
  if(error)setMessage(error.message);else{setMessage('Transfer recorded');setTransfer({from:'',to:'',amount:'',date:new Date().toISOString().slice(0,10),description:''});await load()}
  setSaving(false)
 }
 if(loading)return <section style={card}><button onClick={onBack}>← Back</button><p>Loading Expense Manager…</p></section>
 return <section style={{maxWidth:1180,margin:'0 auto',padding:'8px 0 40px',color:'#e5e7eb'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:18}}>
   <div><div style={{fontSize:11,letterSpacing:2,color:'#67e8f9',fontWeight:800}}>FINANCE AUTOMATION</div><h2 style={{margin:'5px 0'}}>Expense Manager</h2><p style={{margin:0,color:'#94a3b8'}}>5 bank accounts + Cash + UPI, with automatic balances and transfers.</p></div>
   <button className='secondary' onClick={onBack}>← Dashboard</button>
  </div>
  {message&&<div style={{...card,marginBottom:14,padding:12}}>{message}</div>}
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12,marginBottom:18}}>
   {balances.map(a=><div key={a.id} style={card}><div style={{fontSize:11,color:'#94a3b8'}}>{a.account_type.toUpperCase()}</div><strong style={{display:'block',marginTop:5}}>{a.name}</strong><div style={{fontSize:22,fontWeight:900,marginTop:8}}>₹{a.balance.toLocaleString('en-IN',{maximumFractionDigits:2})}</div><small style={{color:'#64748b'}}>{a.bank_name||'Set bank name in account settings'}</small></div>)}
  </div>
  <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.2fr) minmax(0,.8fr)',gap:16}}>
   <form onSubmit={save} style={card}>
    <h3 style={{marginTop:0}}>Add Transaction</h3>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
     <select style={input} value={form.transaction_type} onChange={e=>setForm({...form,transaction_type:e.target.value})}><option value='expense'>Expense</option><option value='income'>Income</option></select>
     <select style={input} value={form.account_id} onChange={e=>setForm({...form,account_id:e.target.value})}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
     <select style={input} value={form.category_id} onChange={e=>setForm({...form,category_id:e.target.value})}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
     <input style={input} type='number' min='0.01' step='0.01' placeholder='Amount ₹' value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/>
     <input style={input} type='date' value={form.transaction_date} onChange={e=>setForm({...form,transaction_date:e.target.value})}/>
     <input style={input} placeholder='Vendor / Party' value={form.vendor_name} onChange={e=>setForm({...form,vendor_name:e.target.value})}/>
    </div>
    <input style={{...input,marginTop:10}} placeholder='Description' value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
    <button style={{marginTop:12}} disabled={saving}>Save Transaction</button>
   </form>
   <form onSubmit={doTransfer} style={card}>
    <h3 style={{marginTop:0}}>Transfer Between Accounts</h3>
    <select style={input} value={transfer.from} onChange={e=>setTransfer({...transfer,from:e.target.value})}><option value=''>From account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
    <select style={{...input,marginTop:10}} value={transfer.to} onChange={e=>setTransfer({...transfer,to:e.target.value})}><option value=''>To account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
    <input style={{...input,marginTop:10}} type='number' min='0.01' step='0.01' placeholder='Amount ₹' value={transfer.amount} onChange={e=>setTransfer({...transfer,amount:e.target.value})}/>
    <input style={{...input,marginTop:10}} type='date' value={transfer.date} onChange={e=>setTransfer({...transfer,date:e.target.value})}/>
    <button style={{marginTop:12}} disabled={saving}>Record Transfer</button>
   </form>
  </div>
  <div style={{...card,marginTop:16}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}><h3 style={{margin:0}}>Monthly Summary</h3><input style={{...input,width:160}} type='month' value={month} onChange={e=>setMonth(e.target.value)}/></div>
   <div style={{display:'flex',gap:24,margin:'14px 0'}}><strong>Expense ₹{expenseTotal.toLocaleString('en-IN')}</strong><strong>Income ₹{incomeTotal.toLocaleString('en-IN')}</strong><strong>Net ₹{(incomeTotal-expenseTotal).toLocaleString('en-IN')}</strong></div>
   <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['Date','Account','Type','Category','Party','Amount','Description'].map(x=><th key={x} style={{textAlign:'left',padding:9,borderBottom:'1px solid rgba(148,163,184,.15)',fontSize:12}}>{x}</th>)}</tr></thead><tbody>{monthly.map(t=>{const a=accounts.find(x=>x.id===t.account_id),c=categories.find(x=>x.id===t.category_id);return <tr key={t.id}>{[t.transaction_date,a?.name||'',t.transaction_type,c?.name||'',t.vendor_name||'',('₹'+Number(t.amount).toLocaleString('en-IN')),t.description||''].map((x,i)=><td key={i} style={{padding:9,borderBottom:'1px solid rgba(148,163,184,.08)',fontSize:12}}>{x}</td>)}</tr>})}</tbody></table></div>
  </div>
 </section>
}
