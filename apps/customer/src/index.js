import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

// Unregister any stale service workers (CRA default or previous deploys)
// This ensures Safari doesn't serve stale cached content
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
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
