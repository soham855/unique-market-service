import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tfscvycomllamoubtlcf.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_VeJIjcsILLniCHf2HjA20A_xlMydma0'

// A sessionStorage tab ID gives each browser tab/window its own auth namespace.
// localStorage is still used for Remember Me, but only under that tab's unique key.
const TAB_ID_KEY = 'unique-market-tab-id'
function getTabId() {
  let id = window.sessionStorage.getItem(TAB_ID_KEY)
  if (!id) {
    id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    window.sessionStorage.setItem(TAB_ID_KEY, id)
  }
  return id
}

const TAB_ID = getTabId()
export const REMEMBER_KEY = `unique-market-remember-until:${TAB_ID}`
export const AUTH_STORAGE_KEY = `unique-market-auth-token:${TAB_ID}`

function rememberIsActive() {
  const until = Number(window.localStorage.getItem(REMEMBER_KEY) || 0)
  return Number.isFinite(until) && until > Date.now()
}

// Each tab uses its own storage key so signing in or out in another tab
// cannot overwrite this tab's account session.
const authStorage = {
  getItem(key) {
    if (rememberIsActive()) {
      return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key)
    }
    return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key)
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
if (rememberUntil && rememberUntil <= Date.now()) {
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
