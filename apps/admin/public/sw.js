// Minimal service worker for PWA install support
// This makes the app installable as a desktop shortcut

const CACHE_NAME = 'slb-pos-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Network-first strategy — always fetch from network, fall back to cache
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
