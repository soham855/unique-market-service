import { supabase } from './supabase'

export function subscribeToComplaints(onChange) {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('complaints-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, (payload) => {
      onChange(payload)
    })
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}
