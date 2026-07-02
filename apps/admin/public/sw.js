// Minimal service worker for PWA install support
// This makes the app installable as a desktop shortcut

const CACHE_NAME = 'slb-pos-v2';

self.addEventListener('install', (event) => {
  // Force the new service worker to activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Delete ALL old caches to ensure fresh content loads
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Network-first strategy — always fetch from network, fall back to cache
// For navigation requests (HTML pages), return a basic response if offline
// so the SPA can handle routing client-side
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests to avoid CORS issues in the SW
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
      .then((response) => {
        if (response) return response;
        // For navigation requests, serve the app shell so React Router handles it
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html') || fetch('/index.html');
        }
        return new Response('', { status: 408, statusText: 'Offline' });
      })
  );
});
