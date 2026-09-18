import React,{useEffect,useMemo,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {supabase} from './lib/supabase'
import './styles.css'

const defaultCategories=['Sales','Expense','Labour Payment','Material Purchase','Travel','Office Expense','Rent','Electricity','AMC','Other Income','Other Expense']
const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(n)||0)
const today=()=>new Date().toISOString().slice(0,10)

function Login({onLogin}){
 const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function submit(e){e.preventDefault();setBusy(true);setError('');const{data,error}=await supabase.auth.signInWithPassword({email,password});if(error)setError(error.message);else onLogin(data.session);setBusy(false)}
 return <main className="auth"><form className="card login" onSubmit={submit}><div className="brand">UNIQUE MARKET</div><h1>Expense Manager</h1><p>Sales • Profit • Expenses • Labour Payments</p><input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required/><input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required/><button disabled={busy}>{busy?'Signing in…':'Sign in'}</button>{error&&<div className="error">{error}</div>}</form></main>
}

function App(){
 const[session,setSession]=useState(undefined),[accounts,setAccounts]=useState([]),[tx,setTx]=useState([]),[categories,setCategories]=useState([]),[form,setForm]=useState({type:'expense',account:'',category:'Expense',amount:'',date:today(),description:'',vendor:''}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[month,setMonth]=useState(today().slice(0,7)),[transfer,setTransfer]=useState({from:'',to:'',amount:'',date:today(),description:''})
 useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const{data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[])
 useEffect(()=>{if(session)load()},[session])
 async function load(){
  setError('')
  const uid=session.user.id

  // First-login setup: create the user's own 5 bank accounts + Cash + UPI and default categories.
  const {data:existingAccounts,error:accountCheckError}=await supabase.from('expense_accounts').select('id').eq('owner_id',uid).limit(1)
  if(accountCheckError){setError(accountCheckError.message);return}
  if(!existingAccounts?.length){
   const starterAccounts=[
    {name:'Bank Account 1',account_type:'bank',bank_name:'Bank 1'},
    {name:'Bank Account 2',account_type:'bank',bank_name:'Bank 2'},
    {name:'Bank Account 3',account_type:'bank',bank_name:'Bank 3'},
    {name:'Bank Account 4',account_type:'bank',bank_name:'Bank 4'},
    {name:'Bank Account 5',account_type:'bank',bank_name:'Bank 5'},
    {name:'Cash',account_type:'cash',bank_name:null},
    {name:'UPI',account_type:'upi',bank_name:null}
   ].map(x=>({...x,owner_id:uid,opening_balance:0,is_active:true}))
   const {error}=await supabase.from('expense_accounts').insert(starterAccounts)
   if(error){setError(error.message);return}
  }

  const {data:existingCategories,error:categoryCheckError}=await supabase.from('expense_categories').select('name').eq('owner_id',uid)
  if(categoryCheckError){setError(categoryCheckError.message);return}
  const existingNames=new Set((existingCategories||[]).map(x=>x.name.toLowerCase()))
  const starterCategories=defaultCategories.filter(name=>!existingNames.has(name.toLowerCase())).map(name=>({
   owner_id:uid,name,category_type:['Sales','Other Income'].includes(name)?'income':'expense',is_active:true
  }))
  if(starterCategories.length){
   const {error}=await supabase.from('expense_categories').insert(starterCategories)
   if(error){setError(error.message);return}
  }

  const [{data:a,error:ae},{data:t,error:te},{data:c,error:ce}]=await Promise.all([
   supabase.from('expense_accounts').select('*').eq('owner_id',uid).eq('is_active',true).order('created_at'),
   supabase.from('expense_transactions').select('*').eq('owner_id',uid).neq('status','cancelled').order('transaction_date',{ascending:false}),
   supabase.from('expense_categories').select('*').eq('owner_id',uid).eq('is_active',true).order('name')
  ])
  if(ae||te||ce){setError(ae?.message||te?.message||ce?.message);return}
  setAccounts(a||[]);setTx(t||[]);setCategories(c?.length?c:defaultCategories.map((name,i)=>({id:'local-'+i,name,category_type:name==='Sales'||name==='Other Income'?'income':'expense'})))
  if(!form.account&&a?.[0])setForm(x=>({...x,account:a[0].id}))
 }
 const balances=useMemo(()=>Object.fromEntries(accounts.map(a=>[a.id,(Number(a.opening_balance)||0)+tx.filter(t=>t.account_id===a.id).reduce((s,t)=>s+(t.transaction_type==='income'?Number(t.amount):-Number(t.amount)),0)])),[accounts,tx])
 const monthTx=tx.filter(t=>String(t.transaction_date).slice(0,7)===month)
 const sales=monthTx.filter(t=>t.transaction_type==='income' && ['sales','other income'].includes((categories.find(c=>c.id===t.category_id)?.name||'').toLowerCase())).reduce((s,t)=>s+Number(t.amount),0)
 const expenses=monthTx.filter(t=>t.transaction_type==='expense').reduce((s,t)=>s+Number(t.amount),0)
 const labour=monthTx.filter(t=>t.transaction_type==='expense' && (categories.find(c=>c.id===t.category_id)?.name||'').toLowerCase()==='labour payment').reduce((s,t)=>s+Number(t.amount),0)
 const profit=sales-expenses
 async function addTx(e){e.preventDefault();setBusy(true);setError('');const uid=session.user.id;const cat=categories.find(c=>c.name.toLowerCase()===form.category.toLowerCase());const{error}=await supabase.from('expense_transactions').insert({owner_id:uid,account_id:form.account,category_id:cat?.id?.startsWith('local-')?null:cat?.id,transaction_type:form.type,amount:Number(form.amount),transaction_date:form.date,description:form.description,vendor_name:form.vendor,status:'confirmed',created_by:uid});if(error)setError(error.message);else{setForm(x=>({...x,amount:'',description:'',vendor:''}));await load()}setBusy(false)}
 async function doTransfer(e){e.preventDefault();if(transfer.from===transfer.to){setError('Select two different accounts.');return}setBusy(true);const uid=session.user.id;const id=crypto.randomUUID();const{error}=await supabase.from('expense_transactions').insert([{owner_id:uid,account_id:transfer.from,transaction_type:'transfer',amount:Number(transfer.amount),transaction_date:transfer.date,description:transfer.description||'Account transfer',transfer_id:id,transfer_account_id:transfer.to,status:'confirmed',created_by:uid},{owner_id:uid,account_id:transfer.to,transaction_type:'income',amount:Number(transfer.amount),transaction_date:transfer.date,description:transfer.description||'Account transfer',transfer_id:id,transfer_account_id:transfer.from,status:'confirmed',created_by:uid}]);if(error)setError(error.message);else{setTransfer({from:'',to:'',amount:'',date:today(),description:''});await load()}setBusy(false)}
 async function signOut(){await supabase.auth.signOut()}
 if(session===undefined)return <div className="auth"><div className="card">Loading…</div></div>
 if(!session)return <Login onLogin={setSession}/>
 return <main className="app">
  <header><div><div className="brand">UNIQUE MARKET</div><h1>Expense Manager</h1><p>Independent finance tool</p></div><button className="ghost" onClick={signOut}>Sign out</button></header>
  {error&&<div className="error banner">{error}</div>}
  <section className="stats"><div><span>Sales</span><strong>{money(sales)}</strong></div><div><span>Total Expenses</span><strong>{money(expenses)}</strong></div><div><span>Labour Payment</span><strong>{money(labour)}</strong></div><div><span>Profit</span><strong>{money(profit)}</strong></div></section>
  <section className="accounts">{accounts.map(a=><article className="account card" key={a.id}><span>{a.account_type.toUpperCase()}</span><h3>{a.name}</h3><strong>{money(balances[a.id])}</strong><small>{a.bank_name||'Account'}</small></article>)}</section>
  <div className="grid">
   <section className="card"><h2>Add transaction</h2><form onSubmit={addTx} className="form">
    <select value={form.type} onChange={e=>setForm({...form,type:e.target.value,category:e.target.value==='income'?'Sales':'Expense'})}><option value="expense">Expense</option><option value="income">Sale / Income</option></select>
    <select value={form.account} onChange={e=>setForm({...form,account:e.target.value})} required><option value="">Select account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
    <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.filter(c=>c.category_type===(form.type==='income'?'income':'expense')).map(c=><option key={c.id}>{c.name}</option>)}</select>
    <input type="number" min="0.01" step="0.01" placeholder="Amount ₹" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} required/>
    <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required/>
    <input placeholder="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
    <input placeholder="Party / Vendor / Employee" value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})}/>
    <button disabled={busy}>Save transaction</button>
   </form></section>
   <section className="card"><h2>Account transfer</h2><form onSubmit={doTransfer} className="form">
    <select value={transfer.from} onChange={e=>setTransfer({...transfer,from:e.target.value})} required><option value="">From account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
    <select value={transfer.to} onChange={e=>setTransfer({...transfer,to:e.target.value})} required><option value="">To account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
    <input type="number" min="0.01" step="0.01" placeholder="Amount ₹" value={transfer.amount} onChange={e=>setTransfer({...transfer,amount:e.target.value})} required/>
    <input type="date" value={transfer.date} onChange={e=>setTransfer({...transfer,date:e.target.value})}/>
    <input placeholder="Transfer description" value={transfer.description} onChange={e=>setTransfer({...transfer,description:e.target.value})}/>
    <button disabled={busy}>Transfer</button>
   </form><p className="hint">Transfers are excluded from profit and expense calculations.</p></section>
  </div>
  <section className="card"><div className="section-head"><h2>Monthly profit report</h2><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></div><div className="report"><div><span>Sales</span><b>{money(sales)}</b></div><div><span>Expenses</span><b>{money(expenses)}</b></div><div><span>Labour</span><b>{money(labour)}</b></div><div><span>Profit</span><b>{money(profit)}</b></div></div></section>
  <section className="card"><div className="section-head"><h2>Recent transactions</h2></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Party</th><th>Amount</th></tr></thead><tbody>{tx.slice(0,30).map(t=><tr key={t.id}><td>{t.transaction_date}</td><td>{t.transaction_type}</td><td>{categories.find(c=>c.id===t.category_id)?.name||'Transfer'}</td><td>{t.description||'—'}</td><td>{t.vendor_name||'—'}</td><td>{money(t.amount)}</td></tr>)}</tbody></table></div></section>
 </main>
}
createRoot(document.getElementById('root')).render(<App/>)
