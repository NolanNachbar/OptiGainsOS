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
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((reg) => {
        // A PWA added to the home screen never does a real navigation after the
        // initial launch, so a long-lived session (e.g. left open across a screen
        // lock) can sit on JS that's days old even though a new build shipped —
        // there was previously no path that ever noticed. `controllerchange` fires
        // once the new worker (skipWaiting + clients.claim in sw.js) actually takes
        // over; reload then so the next launch/resume picks up the new build. In-
        // progress workouts survive this: sessions persist server-side and the
        // resume dialog can no longer be dismissed by an accidental tap (see
        // WorkoutDetail/QuickWorkout), so a reload just re-shows the real Resume
        // prompt instead of losing anything.
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloading) return;
          reloading = true;
          window.location.reload();
        });
        // Long-lived PWA sessions poll for a waiting update whenever the app comes
        // back into view (screen unlock, app switch back) instead of only once at
        // launch.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      }).catch(() => {});
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
