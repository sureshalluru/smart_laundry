// Service Worker v6 — self-destruct version
// This version unregisters itself and clears all caches.
// Fixes stale-cache-after-deploy issue permanently by removing the SW.
// After this deploy, no service worker will be active, and the app
// will load fresh from the server every time (which is fine for a POS app).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(names.map((n) => caches.delete(n)));
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      // Force reload all tabs
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.navigate(client.url);
        });
      });
    }).then(() => {
      // Unregister self — no more service worker
      return self.registration.unregister();
    })
  );
});

// No fetch handling — let everything go to network
self.addEventListener('fetch', () => {});
