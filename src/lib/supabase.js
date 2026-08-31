import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// sessionStorage is isolated per browser tab/window. This allows Admin,
// Customer and Technician accounts to stay independently signed in in
// different tabs of the same browser, while still surviving a reload in
// the same tab.
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.sessionStorage,
        storageKey: 'unique-market-auth-token'
      }
    })
  : null
