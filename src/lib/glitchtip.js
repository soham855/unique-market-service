import * as Sentry from '@sentry/browser'

const dsn = import.meta.env.VITE_GLITCHTIP_DSN

export const glitchtipEnabled = Boolean(dsn)

export function initGlitchTip() {
  if (!dsn) return false

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE || 'production',
    release: import.meta.env.VITE_APP_VERSION || undefined,
    tracesSampleRate: 0.01,
    autoSessionTracking: false,
  })

  return true
}

export function captureGlitchTipError(error, context = {}) {
  if (!glitchtipEnabled) return
  Sentry.withScope(scope => {
    Object.entries(context).forEach(([key, value]) => scope.setExtra(key, value))
    Sentry.captureException(error)
  })
}

export function setGlitchTipTag(key, value) {
  if (!glitchtipEnabled) return
  Sentry.setTag(key, String(value))
}
