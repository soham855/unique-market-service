import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

let initialized = false

async function saveToken(token) {
  if (!token || !supabase) return

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase.from('push_tokens').upsert({
    user_id: user.id,
    token,
    platform: 'android',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,token' })

  if (error) {
    console.error('FCM token save failed:', error)
  } else {
    console.info('FCM token saved successfully')
  }
}

export async function initNativePushNotifications() {
  if (!Capacitor.isNativePlatform() || initialized || !supabase) return
  initialized = true

  try {
    // Register listeners BEFORE register(); otherwise Android can emit the
    // registration event before the listener is attached and the token is lost.
    await PushNotifications.addListener('registration', async ({ value }) => {
      console.info('FCM registration token received')
      await saveToken(value)
    })

    await PushNotifications.addListener('registrationError', error => {
      console.error('FCM registration error:', error)
    })

    await PushNotifications.addListener('pushNotificationReceived', notification => {
      console.info('FCM notification received:', notification.title)
    })

    const permission = await PushNotifications.checkPermissions()
    if (permission.receive !== 'granted') {
      const requested = await PushNotifications.requestPermissions()
      if (requested.receive !== 'granted') {
        console.warn('Push notification permission not granted:', requested.receive)
        return
      }
    }

    await PushNotifications.register()
  } catch (error) {
    console.error('Native push initialization failed:', error)
    initialized = false
  }
}
