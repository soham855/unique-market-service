import { useState } from 'react'
import { supabase } from '../lib/supabase'

const steps = [
  { key: 'raised', label: 'Raised', icon: '✓' },
  { key: 'assigned', label: 'Assigned', icon: '👤' },
  { key: 'on_way', label: 'Technician On Way', icon: '🚗' },
  { key: 'in_progress', label: 'In Progress', icon: '🛠️' },
  { key: 'completed', label: 'Completed', icon: '✓' },
]

const normalize = status => {
  if (status === 'open' || status === 'new') return 'raised'
  if (status === 'resolved' || status === 'closed') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  return status || 'raised'
}

export default function PublicServiceTracker() {
  const [ticket, setTicket] = useState('')
  const [result, setResult] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function track(e) {
    e.preventDefault()
    const value = ticket.trim().toUpperCase()
    if (!value) return setMessage('Enter your Customer ID or Complaint ID.')
    setLoading(true); setMessage(''); setResult(null)
    try {
      const { data, error } = await supabase.rpc('public_service_status', { p_reference: value })
      if (error) throw error
      if (!data?.length) throw new Error('No service record found. Please check the ID and try again.')
      setResult(data[0])
    } catch (error) {
      setMessage(error.message || 'Unable to track service right now.')
    } finally { setLoading(false) }
  }

  const current = normalize(result?.status)
  const currentIndex = steps.findIndex(s => s.key === current)
  const completedIndex = current === 'cancelled' ? -1 : currentIndex

  return <main className="public-tracker" style={{minHeight:'100vh',padding:'32px 18px',background:'linear-gradient(180deg,#f8fafc,#eef2f7)',fontFamily:'inherit'}}>
    <div style={{maxWidth:760,margin:'0 auto'}}>
      <div style={{textAlign:'center',marginBottom:28}}>
        <div style={{fontSize:13,fontWeight:800,letterSpacing:2,opacity:.65}}>UNIQUE MARKET</div>
        <h1 style={{margin:'8px 0',fontSize:'clamp(28px,6vw,46px)'}}>Track Your Service</h1>
        <p style={{margin:0,opacity:.7}}>Enter your Customer ID or Complaint ID to see the latest service status.</p>
      </div>

      <form onSubmit={track} style={{display:'flex',gap:10,background:'#fff',padding:10,borderRadius:18,boxShadow:'0 12px 35px rgba(15,23,42,.08)',border:'1px solid #e5e7eb'}}>
        <input value={ticket} onChange={e=>setTicket(e.target.value)} placeholder="e.g. UM-2630/01 or Customer ID" aria-label="Customer ID or Complaint ID" style={{flex:1,minWidth:0,border:0,outline:0,padding:'14px 12px',fontSize:16,background:'transparent'}} />
        <button disabled={loading} style={{border:0,borderRadius:13,padding:'0 20px',fontWeight:800,cursor:loading?'wait':'pointer',background:'#111827',color:'#fff'}}>{loading?'Checking…':'Track'}</button>
      </form>

      {message && <div role="alert" style={{marginTop:14,padding:14,borderRadius:14,background:'#fff1f2',border:'1px solid #fecdd3',color:'#9f1239'}}>{message}</div>}

      {result && <section style={{marginTop:22,background:'#fff',border:'1px solid #e5e7eb',borderRadius:22,padding:'22px 18px',boxShadow:'0 15px 40px rgba(15,23,42,.08)'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'flex-start'}}>
          <div><div style={{fontSize:12,fontWeight:800,opacity:.55,letterSpacing:1}}>COMPLAINT ID</div><div style={{fontSize:25,fontWeight:900,marginTop:4}}>{result.ticket_no}</div></div>
          <div style={{textAlign:'right'}}><div style={{fontSize:12,fontWeight:800,opacity:.55}}>CURRENT STATUS</div><div style={{fontWeight:900,fontSize:18,marginTop:4}}>{current==='cancelled'?'Cancelled':steps.find(s=>s.key===current)?.label||String(result.status||'Raised').replaceAll('_',' ')}</div></div>
        </div>

        {current === 'cancelled' ? <div style={{marginTop:24,padding:18,borderRadius:16,background:'#fff1f2',color:'#9f1239',fontWeight:700}}>This service complaint has been cancelled. Please contact Unique Market if you need further assistance.</div> :
        <div style={{marginTop:30}}>
          <div style={{display:'grid',gridTemplateColumns:`repeat(${steps.length},minmax(0,1fr))`,gap:5,alignItems:'start'}}>
            {steps.map((step,index)=>{const done=index<=completedIndex;const active=index===completedIndex;return <div key={step.key} style={{textAlign:'center',minWidth:0}}>
              <div style={{width:42,height:42,margin:'0 auto 9px',borderRadius:'50%',display:'grid',placeItems:'center',fontWeight:900,fontSize:17,background:done?'#111827':'#e5e7eb',color:done?'#fff':'#6b7280',boxShadow:active?'0 0 0 6px rgba(17,24,39,.1)':'none'}}>{step.icon}</div>
              <div style={{fontSize:'clamp(10px,2.5vw,13px)',fontWeight:done?800:600,lineHeight:1.25,color:done?'#111827':'#6b7280'}}>{step.label}</div>
            </div>})}
          </div>
          <div style={{height:5,margin:'-59px 42px 50px',background:'#e5e7eb',borderRadius:99,position:'relative',zIndex:0}}><div style={{height:'100%',width:`${Math.max(0,Math.min(100,(completedIndex/(steps.length-1))*100))}%`,background:'#111827',borderRadius:99}} /></div>
        </div>}

        <div style={{marginTop:22,paddingTop:18,borderTop:'1px solid #e5e7eb',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14}}>
          {result.category && <div><small style={{opacity:.55}}>SERVICE</small><div style={{fontWeight:750,marginTop:3}}>{result.category}</div></div>}
          {result.created_at && <div><small style={{opacity:.55}}>RAISED</small><div style={{fontWeight:750,marginTop:3}}>{new Date(result.created_at).toLocaleString('en-IN')}</div></div>}
          {result.updated_at && <div><small style={{opacity:.55}}>LAST UPDATED</small><div style={{fontWeight:750,marginTop:3}}>{new Date(result.updated_at).toLocaleString('en-IN')}</div></div>}
        </div>
      </section>}
      <p style={{textAlign:'center',marginTop:24,fontSize:12,opacity:.55}}>For privacy, only service tracking information is displayed.</p>
    </div>
  </main>
}
