import { supabase } from './supabase'

export async function getMyProfile() {
  if (!supabase) return null
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role')
    .eq('id', user.id)
    .maybeSingle()

  if (error) throw error
  return data
}
