import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { AuthProvider } from './Context/AuthContext';
import { BrowserRouter } from 'react-router-dom';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <AuthProvider>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </AuthProvider>
    </React.StrictMode>
);

reportWebVitals();

// Service Worker management — handles stale cache issues (especially Safari/iOS)
if ('serviceWorker' in navigator) {
  // Unregister any stale service worker from previous deploys that used different scope
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      // If the SW is outdated (no controller means it never activated), unregister it
      if (!navigator.serviceWorker.controller) {
        registration.unregister();
      }
    }
  });

  // Register our SW with no-cache to ensure Safari always checks for updates
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    .then((registration) => {
      // Check for updates every 5 minutes (Safari won't auto-check frequently)
      setInterval(() => registration.update(), 5 * 60 * 1000);
    })
    .catch(() => {});

  // Listen for SW update notification — auto-reload to pick up new code
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_UPDATED') {
      // Reload the page to pick up new bundles — but only if not mid-interaction
      // Small delay to let the SW finish activating
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  });
}

// ── Stale Bundle Detection (Safari/iOS fix) ──────────────────────────────────
// Safari can serve cached JS even after a new deploy. This detects version
// mismatch and forces a hard reload. Checks on visibility change (tab focus)
// which catches the bfcache case.
(function staleCheckInit() {
  let knownVersion = null;

  async function checkVersion() {
    try {
      const resp = await fetch('/api/version', { cache: 'no-store' });
      if (!resp.ok) return;
      const data = await resp.json();
      if (knownVersion === null) {
        knownVersion = data.version;
      } else if (data.version !== knownVersion) {
        // Server has been redeployed — force reload to get new bundles
        window.location.reload();
      }
    } catch (e) {
      // Network error — ignore, will retry next time
    }
  }

  // Check on page load
  checkVersion();

  // Check when tab becomes visible (catches Safari bfcache)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkVersion();
    }
  });

  // Also check periodically (every 10 minutes)
  setInterval(checkVersion, 10 * 60 * 1000);
})();
