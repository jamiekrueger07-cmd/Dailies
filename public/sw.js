// Dailies service worker: makes the app installable and quick to open.
// Pages always come from the network first (so every deploy shows up right away),
// with the last copy as a backup when offline. Supabase, Stripe and other sites are never touched.
const VERSION = 'v1'
const PAGES = `dailies-pages-${VERSION}`
const ASSETS = `dailies-assets-${VERSION}`
const MAX_ASSETS = 80

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.add(new Request('/app', { cache: 'reload' })))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dailies-') && k !== PAGES && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function trim(cache) {
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i])
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Built files have a fingerprint in the name, so a cached copy is always right.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) {
          cache.put(req, res.clone())
          trim(cache)
        }
        return res
      }),
    )
    return
  }

  // App screens: network first, fall back to the saved app shell when offline.
  if (req.mode === 'navigate' && (url.pathname === '/app' || url.pathname.startsWith('/app/'))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            event.waitUntil(caches.open(PAGES).then((c) => c.put('/app', copy)))
          }
          return res
        })
        .catch(() => caches.open(PAGES).then((c) => c.match('/app')).then((hit) => hit || Response.error())),
    )
  }
})
