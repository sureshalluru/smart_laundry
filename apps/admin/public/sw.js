// Service Worker v4 — aggressive cache busting for Safari compatibility
// Safari (especially iOS) caches aggressively. This SW ensures:
// 1. Old caches are purged immediately on activation
// 2. Navigation requests ALWAYS go to network (no stale HTML)
// 3. JS/CSS bundles with hashes are cached, everything else is network-first

const CACHE_VERSION = 5;
const CACHE_NAME = `slb-pos-v${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  // Force immediate activation — don't wait for old tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // Take control of ALL open tabs immediately
      return self.clients.claim();
    }).then(() => {
      // Force-reload all open windows to pick up new bundles
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.navigate(client.url);
        });
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  // Navigation requests (HTML pages) — ALWAYS network, never cache
  // This is critical for Safari which can serve stale HTML from bfcache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match('/index.html'))
        .then((response) => response || new Response('Offline', { status: 503 }))
    );
    return;
  }

  // Hashed static assets (main.abc123.js) — cache-first since hash changes on rebuild
  if (url.pathname.startsWith('/static/') && /\.[a-f0-9]{8,}\./i.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      }).catch(() => new Response('', { status: 408 }))
    );
    return;
  }

  // API calls and everything else — network only, no caching
  event.respondWith(
    fetch(event.request)
      .catch(() => new Response('', { status: 408, statusText: 'Offline' }))
  );
});

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
