import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tfscvycomllamoubtlcf.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_VeJIjcsILLniCHf2HjA20A_xlMydma0'

const REMEMBER_KEY = 'unique-market-remember-until'
const AUTH_STORAGE_KEY = 'unique-market-auth-token'

function rememberIsActive() {
  const until = Number(window.localStorage.getItem(REMEMBER_KEY) || 0)
  return Number.isFinite(until) && until > Date.now()
}

// Resolve storage dynamically so the Remember Me choice made on the login screen
// applies to the very same Supabase client that performs the sign-in.
const authStorage = {
  getItem(key) {
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key)
  },
  setItem(key, value) {
    if (rememberIsActive()) {
      window.sessionStorage.removeItem(key)
      window.localStorage.setItem(key, value)
    } else {
      window.localStorage.removeItem(key)
      window.sessionStorage.setItem(key, value)
    }
  },
  removeItem(key) {
    window.localStorage.removeItem(key)
    window.sessionStorage.removeItem(key)
  }
}

const rememberUntil = Number(window.localStorage.getItem(REMEMBER_KEY) || 0)
const rememberActive = Number.isFinite(rememberUntil) && rememberUntil > Date.now()

if (rememberUntil && !rememberActive) {
  window.localStorage.removeItem(REMEMBER_KEY)
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: authStorage,
        storageKey: AUTH_STORAGE_KEY
      }
    })
  : null

export { REMEMBER_KEY }
