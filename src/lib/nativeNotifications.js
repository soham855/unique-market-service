import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

let initialized = false

export async function initNativePushNotifications() {
  if (!Capacitor.isNativePlatform() || initialized || !supabase) return
  initialized = true

  const permission = await PushNotifications.checkPermissions()
  if (permission.receive !== 'granted') {
    const requested = await PushNotifications.requestPermissions()
    if (requested.receive !== 'granted') {
      console.warn('Push notification permission not granted:', requested.receive)
      return
    }
  }

  await PushNotifications.register()

  await PushNotifications.addListener('registration', async ({ value }) => {
    const user = (await supabase.auth.getUser()).data.user
    if (!user || !value) return

    await supabase.from('push_tokens').upsert({
      user_id: user.id,
      token: value,
      platform: 'android',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,token' })
  })

  await PushNotifications.addListener('registrationError', error => {
    console.error('FCM registration error:', error)
  })

  await PushNotifications.addListener('pushNotificationReceived', notification => {
    console.info('FCM notification received:', notification.title)
  })
}
