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

// Service Worker cleanup — unregister any existing SW to prevent stale cache issues
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
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
