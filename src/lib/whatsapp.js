import { supabase } from './supabase'

export async function sendWhatsAppNotification({ phone, message }) {
  if (!supabase || !phone || !message) return { sent:false }
  const { data, error } = await supabase.functions.invoke('send-whatsapp-notification', { body:{ phone, message } })
  if (error) throw error
  return data
}
