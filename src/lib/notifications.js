import { supabase } from './supabase'

export async function getMyNotifications(limit = 30) {
  if (!supabase) return []
  const { data, error } = await supabase.from('notifications').select('id,complaint_id,title,message,type,read_at,created_at').order('created_at', { ascending:false }).limit(limit)
  if (error) throw error
  return data || []
}

export async function markNotificationRead(id) {
  if (!supabase) return
  const { error } = await supabase.from('notifications').update({ read_at:new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export function subscribeToNotifications(onChange) {
  if (!supabase) return () => {}
  const channel = supabase.channel('notifications-live').on('postgres_changes', { event:'INSERT', schema:'public', table:'notifications' }, payload => onChange(payload.new)).subscribe()
  return () => supabase.removeChannel(channel)
}
