import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function NotificationBell({ userId }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)

  async function load() {
    if (!supabase || !userId) return
    const { data } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending:false }).limit(30)
    setItems(data || [])
  }

  useEffect(() => {
    load()
    if (!supabase || !userId) return
    const channel = supabase.channel(`notifications-${userId}`).on('postgres_changes', { event:'*', schema:'public', table:'notifications', filter:`user_id=eq.${userId}` }, load).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  async function markRead(id) {
    await supabase.from('notifications').update({ read_at:new Date().toISOString() }).eq('id', id)
    load()
  }

  const unread = items.filter(x => !x.read_at).length
  return <div className="notification-bell">
    <button type="button" className="secondary" onClick={()=>setOpen(v=>!v)}>🔔 {unread > 0 && <span>{unread}</span>}</button>
    {open && <div className="notification-popover"><h3>Notifications</h3>{items.length === 0 ? <p className="muted">No notifications.</p> : items.map(item => <button type="button" className={item.read_at ? 'notification read' : 'notification'} key={item.id} onClick={()=>markRead(item.id)}><strong>{item.title || 'Service update'}</strong><small>{item.message || ''}</small></button>)}</div>}
  </div>
}
