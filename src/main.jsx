import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
    });
  } else {
    // Dev: a service worker must never control the Vite dev server. sw.js is cache-first
    // for JS/CSS, so it pins stale hashed module chunks and ends up serving mismatched
    // React copies ("Invalid hook call" / useEffect of null). Tear down any SW + caches
    // left over from a prior build/preview on this origin, then reload once so the page
    // loads SW-free.
    navigator.serviceWorker.getRegistrations().then(async (regs) => {
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      await Promise.all(regs.map((reg) => reg.unregister()));
      if (navigator.serviceWorker.controller && !sessionStorage.getItem('sw-evicted')) {
        sessionStorage.setItem('sw-evicted', '1');
        window.location.reload();
      } else {
        sessionStorage.removeItem('sw-evicted');
      }
    });
  }
}
