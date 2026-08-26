import { supabase } from './supabase'

export async function getMyProfile() {
  if (!supabase) return null
  const { data, error } = await supabase.from('profiles').select('id, full_name, phone, role').single()
  if (error) throw error
  return data
}
