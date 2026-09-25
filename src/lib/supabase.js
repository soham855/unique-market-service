import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tfscvycomllamoubtlcf.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_VeJIjcsILLniCHf2HjA20A_xlMydma0'

const REMEMBER_KEY = 'unique-market-remember-until'
const rememberUntil = Number(window.localStorage.getItem(REMEMBER_KEY) || 0)
const rememberActive = Number.isFinite(rememberUntil) && rememberUntil > Date.now()

if (rememberUntil && !rememberActive) {
  window.localStorage.removeItem(REMEMBER_KEY)
  window.localStorage.removeItem('unique-market-auth-token')
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: rememberActive ? window.localStorage : window.sessionStorage,
        storageKey: 'unique-market-auth-token'
      }
    })
  : null

export { REMEMBER_KEY }
