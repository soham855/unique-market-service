import { supabase } from './supabase'

export async function getMyProfile() {
  if (!supabase) return null
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role, company_name, site_address')
    .eq('id', user.id)
    .maybeSingle()

  if (error) throw error
  return { ...data, email: user.email || '' }
}

export async function updateMyProfile({ full_name, phone, company_name, site_address, email }) {
  if (!supabase) throw new Error('Service database is unavailable.')
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('You must be signed in.')

  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name, phone, company_name, site_address, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('id, full_name, phone, role, company_name, site_address')
    .single()
  if (error) throw error

  let updatedEmail = user.email || ''
  if (email && email.trim() && email.trim() !== (user.email || '')) {
    const { error: emailError } = await supabase.auth.updateUser({ email: email.trim() })
    if (emailError) throw emailError
    updatedEmail = email.trim()
  }
  return { ...data, email: updatedEmail }
}
