import { supabase } from './supabase'

export async function signIn(email, password) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signUp({ name, company_name, mobile, email, address, password }) {
  if (!supabase) throw new Error('Supabase is not configured')
  if (!name?.trim() || !mobile?.trim() || !email?.trim() || !address?.trim()) {
    throw new Error('Name, mobile number, email ID and address are required.')
  }
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(), password,
    options: { data: { role: 'customer', name: name.trim(), mobile: mobile.trim(), company_name: company_name?.trim() || null, address: address.trim() } }
  })
  if (error) throw error
  return data
}

export async function signOut() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) throw error
}

export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthStateChange(callback) {
  if (!supabase) return { data: { subscription: { unsubscribe() {} } } }
  return supabase.auth.onAuthStateChange(callback)
}
