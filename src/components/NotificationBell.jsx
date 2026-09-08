import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function NotificationBell({ userId }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [popup, setPopup] = useState(null)
  const previousIds = useRef(new Set())
  const firstLoad = useRef(true)

  async function load(showPopup = false) {
    if (!supabase || !userId) return
    const { data, error } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending:false }).limit(50)
    if (error) return
    const next = data || []
    if (showPopup && !firstLoad.current) {
      const fresh = next.find(item => !previousIds.current.has(item.id))
      if (fresh) {
        setPopup(fresh)
        window.setTimeout(() => setPopup(null), 6000)
      }
    }
    previousIds.current = new Set(next.map(item => item.id))
    firstLoad.current = false
    setItems(next)
  }

  useEffect(() => {
    firstLoad.current = true
    previousIds.current = new Set()
    load(false)
    if (!supabase || !userId) return
    const channel = supabase.channel(`notifications-${userId}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'notifications', filter:`user_id=eq.${userId}` }, () => load(true))
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'notifications', filter:`user_id=eq.${userId}` }, () => load(false))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  async function markRead(id) {
    if (!supabase) return
    await supabase.from('notifications').update({ read_at:new Date().toISOString() }).eq('id', id).eq('user_id', userId)
    load(false)
  }

  async function markAllRead() {
    if (!supabase || !userId) return
    await supabase.from('notifications').update({ read_at:new Date().toISOString() }).eq('user_id', userId).is('read_at', null)
    load(false)
  }

  const unread = items.filter(x => !x.read_at).length

  return <div className="notification-bell" style={{ position:'relative' }}>
    <button type="button" className="secondary notification-bell-button" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={() => setOpen(v => !v)} style={{ position:'relative', minWidth:52, fontSize:20 }}>
      🔔
      {unread > 0 && <span style={{ position:'absolute', top:-7, right:-7, minWidth:21, height:21, padding:'0 5px', borderRadius:999, background:'#dc2626', color:'#fff', fontSize:11, fontWeight:800, display:'grid', placeItems:'center', border:'2px solid #fff' }}>{unread > 99 ? '99+' : unread}</span>}
    </button>

    {popup && <div role="status" onClick={() => { markRead(popup.id); setOpen(true); setPopup(null) }} style={{ position:'fixed', top:78, right:18, zIndex:9999, width:'min(380px, calc(100vw - 36px))', padding:'14px 16px', borderRadius:14, background:'#111827', color:'#fff', boxShadow:'0 14px 40px rgba(0,0,0,.25)', cursor:'pointer' }}>
      <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
        <span style={{ fontSize:22 }}>🔔</span>
        <div style={{ flex:1 }}><strong style={{ display:'block', marginBottom:4 }}>{popup.title}</strong><span style={{ display:'block', opacity:.9, fontSize:13 }}>{popup.message}</span></div>
        <button type="button" onClick={e => { e.stopPropagation(); setPopup(null) }} style={{ border:0, background:'transparent', color:'#fff', fontSize:18, cursor:'pointer' }}>×</button>
      </div>
    </div>}

    {open && <div className="notification-popover" style={{ position:'absolute', right:0, top:'calc(100% + 10px)', zIndex:9998, width:'min(390px, calc(100vw - 30px))', maxHeight:'70vh', overflowY:'auto', background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, boxShadow:'0 18px 45px rgba(0,0,0,.18)', padding:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:10 }}>
        <div><h3 style={{ margin:0 }}>Notifications</h3><small style={{ color:'#6b7280' }}>{unread} unread</small></div>
        {unread > 0 && <button type="button" className="secondary" onClick={markAllRead}>Mark all read</button>}
      </div>
      {items.length === 0 ? <p className="muted">No notifications.</p> : items.map(item => <button type="button" key={item.id} className={item.read_at ? 'notification read' : 'notification'} onClick={() => markRead(item.id)} style={{ width:'100%', textAlign:'left', display:'block', border:0, borderRadius:12, padding:'11px 12px', marginBottom:7, background:item.read_at ? '#f8fafc' : '#fff1f2', cursor:'pointer' }}>
        <span style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
          {!item.read_at && <i style={{ width:8, height:8, borderRadius:'50%', background:'#dc2626', marginTop:6, flex:'0 0 auto' }} />}
          <span><strong style={{ display:'block' }}>{item.title || 'Service update'}</strong><small style={{ display:'block', marginTop:3, color:'#4b5563' }}>{item.message || ''}</small><small style={{ display:'block', marginTop:5, color:'#9ca3af' }}>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</small></span>
        </span>
      </button>)}
    </div>}
  </div>
}
