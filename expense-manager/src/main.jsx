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
 const[session,setSession]=useState(undefined),[accounts,setAccounts]=useState([]),[tx,setTx]=useState([]),[categories,setCategories]=useState([]),[form,setForm]=useState({type:'expense',account:'',category:'Expense',amount:'',date:today(),description:'',vendor:''}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[month,setMonth]=useState(today().slice(0,7)),[transfer,setTransfer]=useState({from:'',to:'',amount:'',date:today(),description:''}),[editingAccount,setEditingAccount]=useState(null),[editingCategory,setEditingCategory]=useState(null),[newCategory,setNewCategory]=useState('')
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
    {name:'UPI',account_type:'upi',bank_name:null,upi_id:null,payment_app:null}
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
 async function saveAccount(e){
 e.preventDefault();setBusy(true);setError('');
 const {error}=await supabase.from('expense_accounts').update({
  name:editingAccount.name,bank_name:editingAccount.account_type==='bank'?editingAccount.bank_name:null,
  account_last4:editingAccount.account_last4||null,opening_balance:Number(editingAccount.opening_balance)||0,
  upi_id:editingAccount.account_type==='upi'?editingAccount.upi_id||null:null,
  payment_app:editingAccount.account_type==='upi'?editingAccount.payment_app||null:null
 }).eq('id',editingAccount.id).eq('owner_id',session.user.id);
 if(error)setError(error.message);else{setEditingAccount(null);await load()}setBusy(false)
}
async function saveCategory(e){
 e.preventDefault();setBusy(true);setError('');
 const name=editingCategory.name.trim();
 if(!name){setError('Category name is required.');setBusy(false);return}
 const {error}=await supabase.from('expense_categories').update({name}).eq('id',editingCategory.id).eq('owner_id',session.user.id);
 if(error)setError(error.message);else{setEditingCategory(null);await load()}setBusy(false)
}
async function addCategory(e){
 e.preventDefault();const name=newCategory.trim();if(!name)return;setBusy(true);setError('');
 const {error}=await supabase.from('expense_categories').insert({owner_id:session.user.id,name,category_type:'expense',is_active:true});
 if(error)setError(error.message);else{setNewCategory('');await load()}setBusy(false)
}
async function deactivateCategory(id){
 setBusy(true);setError('');
 const {error}=await supabase.from('expense_categories').update({is_active:false}).eq('id',id).eq('owner_id',session.user.id);
 if(error)setError(error.message);else await load();setBusy(false)
}
async function signOut(){await supabase.auth.signOut()}
 if(session===undefined)return <div className="auth"><div className="card">Loading…</div></div>
 if(!session)return <Login onLogin={setSession}/>
 return <main className="app">
  <header><div><div className="brand">UNIQUE MARKET</div><h1>Expense Manager</h1><p>Independent finance tool</p></div><button className="ghost" onClick={signOut}>Sign out</button></header>
  {error&&<div className="error banner">{error}</div>}
  <section className="stats"><div><span>Sales</span><strong>{money(sales)}</strong></div><div><span>Total Expenses</span><strong>{money(expenses)}</strong></div><div><span>Labour Payment</span><strong>{money(labour)}</strong></div><div><span>Profit</span><strong>{money(profit)}</strong></div></section>
  <section className="accounts">{accounts.map(a=><article className="account card" key={a.id}><span>{a.account_type.toUpperCase()}</span><h3>{a.name}</h3><strong>{money(balances[a.id])}</strong><small>{a.account_type==='upi'?(a.upi_id||'UPI ID not set'):(a.bank_name||'Account')}</small>{a.account_type==='upi'&&a.payment_app&&<small>{a.payment_app}</small>}<button className="small-btn" onClick={()=>setEditingAccount({...a})}>Edit</button></article>)}</section>
 {editingAccount&&<section className="card edit-panel"><h2>Edit {editingAccount.account_type==='upi'?'UPI':'Bank/Cash'} account</h2><form onSubmit={saveAccount} className="form">
  <input placeholder="Account name" value={editingAccount.name||''} onChange={e=>setEditingAccount({...editingAccount,name:e.target.value})} required/>
  {editingAccount.account_type==='bank'&&<><input placeholder="Bank name" value={editingAccount.bank_name||''} onChange={e=>setEditingAccount({...editingAccount,bank_name:e.target.value})}/><input placeholder="Last 4 account digits" maxLength="4" value={editingAccount.account_last4||''} onChange={e=>setEditingAccount({...editingAccount,account_last4:e.target.value.replace(/\D/g,'').slice(0,4)})}/></>}
  {editingAccount.account_type==='upi'&&<><input placeholder="UPI ID (example@upi)" value={editingAccount.upi_id||''} onChange={e=>setEditingAccount({...editingAccount,upi_id:e.target.value})}/><input placeholder="Payment app (GPay / PhonePe / Paytm)" value={editingAccount.payment_app||''} onChange={e=>setEditingAccount({...editingAccount,payment_app:e.target.value})}/></>}
  <input type="number" step="0.01" placeholder="Opening balance ₹" value={editingAccount.opening_balance??0} onChange={e=>setEditingAccount({...editingAccount,opening_balance:e.target.value})}/>
  <div className="button-row"><button disabled={busy}>Save changes</button><button type="button" className="ghost" onClick={()=>setEditingAccount(null)}>Cancel</button></div>
 </form></section>}
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
  <section className="card category-manager"><h2>Expense categories</h2><div className="category-add"><input placeholder="New expense category" value={newCategory} onChange={e=>setNewCategory(e.target.value)}/><button onClick={addCategory} disabled={busy}>Add</button></div><div className="category-list">{categories.filter(c=>c.category_type==='expense').map(c=><div className="category-row" key={c.id}><span>{c.name}</span><div><button className="small-btn" onClick={()=>setEditingCategory({...c})}>Edit</button><button className="danger-btn" onClick={()=>deactivateCategory(c.id)} disabled={busy}>Hide</button></div></div>)}</div>{editingCategory&&<form onSubmit={saveCategory} className="form category-edit"><input value={editingCategory.name} onChange={e=>setEditingCategory({...editingCategory,name:e.target.value})} required/><div className="button-row"><button disabled={busy}>Save category</button><button type="button" className="ghost" onClick={()=>setEditingCategory(null)}>Cancel</button></div></form>}</section>
  <section className="card"><div className="section-head"><h2>Monthly profit report</h2><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></div><div className="report"><div><span>Sales</span><b>{money(sales)}</b></div><div><span>Expenses</span><b>{money(expenses)}</b></div><div><span>Labour</span><b>{money(labour)}</b></div><div><span>Profit</span><b>{money(profit)}</b></div></div></section>
  <section className="card"><div className="section-head"><h2>Recent transactions</h2></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Party</th><th>Amount</th></tr></thead><tbody>{tx.slice(0,30).map(t=><tr key={t.id}><td>{t.transaction_date}</td><td>{t.transaction_type}</td><td>{categories.find(c=>c.id===t.category_id)?.name||'Transfer'}</td><td>{t.description||'—'}</td><td>{t.vendor_name||'—'}</td><td>{money(t.amount)}</td></tr>)}</tbody></table></div></section>
 </main>
}
createRoot(document.getElementById('root')).render(<App/>)
