import { supabase } from './supabase'

function normalizePhone(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('+')) return raw
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+91${digits}`
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`
  return `+${digits}`
}

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
  const phone = normalizePhone(mobile)
  if (!/^\+\d{10,15}$/.test(phone)) throw new Error('Please enter a valid mobile number.')

  const { data, error } = await supabase.auth.signInWithOtp({
    phone,
    options: {
      shouldCreateUser: true,
      data: {
        role: 'customer',
        name: name.trim(),
        mobile: phone,
        email: email.trim().toLowerCase(),
        company_name: company_name?.trim() || null,
        address: address.trim()
      }
    }
  })
  if (error) throw error
  return { ...data, phone }
}

export async function verifyCustomerOtp({ phone, token, email, password, name, company_name, address }) {
  if (!supabase) throw new Error('Supabase is not configured')
  const normalizedPhone = normalizePhone(phone)
  const { data, error } = await supabase.auth.verifyOtp({
    phone: normalizedPhone,
    token: token.trim(),
    type: 'sms'
  })
  if (error) throw error

  const { data: updated, error: updateError } = await supabase.auth.updateUser({
    email: email.trim().toLowerCase(),
    password,
    data: {
      role: 'customer',
      name: name.trim(),
      mobile: normalizedPhone,
      email: email.trim().toLowerCase(),
      company_name: company_name?.trim() || null,
      address: address.trim()
    }
  })
  if (updateError) throw updateError

  return { ...data, user: updated.user }
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
