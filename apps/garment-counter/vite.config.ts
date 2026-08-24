/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Standalone garment-counter PWA.
// Requirement 11.5: this app must not import from or modify the admin app.
export default defineConfig({
  // Served from the /counter/ subpath in production (FastAPI static route), so
  // asset URLs must be prefixed accordingly. In dev this is '/counter/' too;
  // the dev server still serves at that base.
  base: '/counter/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Do not run the service worker in `vite dev` — a cached SW can
      // intercept the /single_cloth/ polling requests and serve stale data.
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Garment Counter',
        short_name: 'Counter',
        description: 'Real-time garment counting for laundry facilities',
        // Kiosk-style, full-screen operation (Req 7.1, 11.6)
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        // Served under /counter/ in production.
        scope: '/counter/',
        start_url: '/counter/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5180,
  },
  build: {
    // Kiosk PWA loads once and is cached by the service worker; the Chakra +
    // framer-motion vendor bundle exceeds the default 500 kB warning limit
    // without being a runtime concern.
    chunkSizeWarningLimit: 800,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
  },
});
