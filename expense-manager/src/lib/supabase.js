import {createClient} from '@supabase/supabase-js'
const url=import.meta.env.VITE_SUPABASE_URL||'https://tfscvycomllamoubtlcf.supabase.co'
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_VeJIjcsILLniCHf2HjA20A_xlMydma0'
export const supabase=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})