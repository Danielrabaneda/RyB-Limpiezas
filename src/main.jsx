import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register';

// Register service worker for PWA only if not in a client portal,
// otherwise unregister any existing service worker to avoid caching issues on client portals.
if (!window.location.pathname.includes('/portal/')) {
  registerSW({ immediate: true });
} else {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for (let registration of registrations) {
        registration.unregister();
      }
    });
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Señalizar que la aplicación se ha montado correctamente
window.dispatchEvent(new CustomEvent('app-mounted'));
