const CACHE_NAME = 'unique-market-app-v2'
const APP_SHELL = ['/', '/manifest.webmanifest', '/unique-market-logo.svg', '/app-icon.svg']
const STATIC_ASSET_PATHS = new Set([
  '/manifest.webmanifest',
  '/unique-market-logo.svg',
  '/app-icon.svg',
  '/brand-logo.css',
  '/spacing-refresh.css'
])

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((error) => console.warn('App shell cache skipped:', error))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith('unique-market-app-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Never cache authenticated or customer-specific API responses.
  const privatePrefixes = ['/rest/v1/', '/auth/v1/', '/functions/v1/', '/storage/v1/', '/api/']
  if (privatePrefixes.some((prefix) => url.pathname.startsWith(prefix))) return

  // Keep page navigation fresh; use only the public app shell as offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok && url.pathname === '/') {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy))
        }
        return response
      }).catch(async () => (await caches.match('/')) || Response.error())
    )
    return
  }

  const isHashedAsset = url.pathname.startsWith('/assets/')
  const isPublicStaticAsset = STATIC_ASSET_PATHS.has(url.pathname)
  if (!isHashedAsset && !isPublicStaticAsset) return

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached
      const response = await fetch(request)
      const cacheControl = response.headers.get('cache-control') || ''
      if (response.ok && response.type === 'basic' && !/private|no-store/i.test(cacheControl)) {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
      }
      return response
    })
  )
})
