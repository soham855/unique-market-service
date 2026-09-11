import { createClient } from '@supabase/supabase-js'

// Vercel/Capacitor builds can use Vite environment variables when configured.
// Keep the active public Supabase configuration as a safe fallback so the
// deployed web app and Android build do not fail with "Supabase is not configured"
// when those build-time variables are missing.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tfscvycomllamoubtlcf.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_VeJIjcsILLniCHf2HjA20A_xlMydma0'

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
