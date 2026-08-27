import { useEffect, useState } from 'react'
import { roleLabel } from '../lib/role'
import { supabase } from '../lib/supabase'

const adminModules=[
 ['Complaints','Service complaints, assignment and status'],['Customers','Customer profiles and contact details'],['Technicians','Technician accounts and availability'],['Sites','Customer sites and locations'],['Devices','Installed CCTV and network equipment'],['AMC','AMC contracts, dates and status'],['Service History','Completed service and visit records'],['Products','Product master, pricing and GST'],['Product Serials','Serial number lifecycle and warranty'],['Stock Movements','Stock in, out and adjustment history']
]
const modules={admin:adminModules,technician:[['My Assigned Complaints','Assigned service calls'],["Today's Visits","Today's scheduled work"],['Service History','Your completed work'],['My Profile','Your account']],customer:[['Raise Complaint','Report a service issue'],['My Complaints','Track your complaints'],['Service History','Previous service'],['AMC Details','Your AMC information'],['My Profile','Your account']]}
const countTables={Complaints:'complaints',Customers:'customers',Technicians:'technicians',Sites:'sites',Devices:'devices',AMC:'amc_contracts','Service History':'service_history',Products:'products','Product Serials':'product_serials','Stock Movements':'stock_movements'}
export default function RoleDashboard({profile,onSelectModule}){
 const role=profile?.role||'customer',items=modules[role]||modules.customer,[counts,setCounts]=useState({})
 useEffect(()=>{if(role!=='admin'||!supabase)return;let cancelled=false;(async()=>{const out=await Promise.all(Object.entries(countTables).map(async([n,t])=>{const {count}=await supabase.from(t).select('id',{count:'exact',head:true});return[n,count||0]}));if(!cancelled)setCounts(Object.fromEntries(out))})();return()=>{cancelled=true}},[role])
 return <section className="role-dashboard"><div className="role-heading"><div><span className="badge">{roleLabel(role)}</span><h2>Welcome{profile?.full_name?`, ${profile.full_name}`:''}</h2><p>{role==='admin'?'Manage the complete Unique Market service operation.':'Use your workspace to manage the services available to your role.'}</p></div></div>{role==='admin'&&<div className="admin-stats">{adminModules.map(([name])=><div className="stat-card" key={name}><strong>{counts[name]??'—'}</strong><span>{name}</span></div>)}</div>}<div className="modules">{items.map(([item,description])=><button key={item} type="button" className="module-card" onClick={()=>onSelectModule?.(item)}><span>●</span><h3>{item}</h3><p>{description} →</p></button>)}</div></section>
}
