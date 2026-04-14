/* eslint-disable no-restricted-globals */
// Minimal Service Worker (MVP): cache app shell assets for faster launch.
// Note: This does NOT provide offline data sync.

const CACHE_NAME = 'nossocrm-shell-v5';
const SHELL_URLS = [
  '/',
  '/login',
  '/boards',
  '/inbox',
  '/contacts',
  '/activities',
  '/icons/icon.svg',
  '/icons/maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k))))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Bypass: requests cross-origin (unsplash, fonts, cdn.tailwindcss, etc.) são
  // deixadas para o browser. Interceptar e tentar cachear opaque responses
  // causa cancelamento silencioso e looping de load.
  const reqUrl = new URL(req.url);
  if (reqUrl.origin !== self.location.origin) return;

  // Network-first for navigations, fallback to cache if offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/')))
    );
    return;
  }

  // Never cache Next.js chunks (_next/static/chunks/*) — they have content-hash
  // filenames and are immutable. Caching them causes 404s after deploy because
  // the SW serves stale references to chunks that no longer exist on the server.
  // Let the browser's built-in HTTP cache handle them (Vercel sets proper headers).
  if (req.url.includes('/_next/')) return;

  // Stale-while-revalidate for other static assets (icons, images).
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

