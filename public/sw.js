// Bump this on every deploy so the worker reinstalls and old caches are evicted.
const CACHE_NAME = "optigains-v4";

// Cap runtime-cached assets so hashed bundles don't accumulate forever.
const MAX_RUNTIME_ENTRIES = 60;

// Derive base path from where the SW was registered (e.g. "/OptiGainsOS/" or "/")
const BASE = new URL(self.registration.scope).pathname;

// App shell — cached on first install for offline support
const APP_SHELL = [BASE, BASE + "index.html", BASE + "manifest.json", BASE + "optigains-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Pass through all Supabase API, auth, and storage calls
  if (url.hostname.includes("supabase.co")) return;
  if (url.origin !== location.origin) return;

  // Network-first for navigation requests (keeps app fresh); refresh the
  // precached shell on success so offline launches get the latest index.html
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(BASE + "index.html", clone));
          }
          return response;
        })
        .catch(() => caches.match(BASE + "index.html"))
    );
    return;
  }

  // Cache-first for static assets (JS/CSS/images)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) =>
            cache.put(event.request, clone).then(() => trimCache(cache))
          );
        }
        return response;
      });
    })
  );
});

// Evict the oldest runtime-cached assets beyond the cap, keeping the app shell.
async function trimCache(cache) {
  const keys = await cache.keys();
  const disposable = keys.filter((req) => !APP_SHELL.includes(new URL(req.url).pathname));
  const excess = disposable.length - MAX_RUNTIME_ENTRIES;
  if (excess > 0) {
    await Promise.all(disposable.slice(0, excess).map((k) => cache.delete(k)));
  }
}

// Push notification received
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "OptiGainsOS", body: event.data.text() };
  }
  const { title, body, url = BASE + "dashboard", icon = BASE + "optigains-icon.svg" } = payload;
  // Edge functions send app-relative paths ("/physique", "/"). On GitHub Pages the
  // app is served under a sub-path, so a bare "/foo" 404s. Rebase anything that
  // isn't already under BASE.
  const target = url.startsWith(BASE) ? url : BASE + String(url).replace(/^\/+/, "");

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: BASE + "optigains-icon.svg",
      data: { url: target },
      vibrate: [200, 100, 200],
    })
  );
});

// Notification tap → navigate to relevant page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || BASE + "dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const existing = windowClients.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(url);
      } else {
        clients.openWindow(url);
      }
    })
  );
});

// ── Rest timer, fired from the worker instead of the page ──────────────────
//
// The page cannot wake itself to do this. A backgrounded tab's setInterval is
// throttled to roughly once a minute and suspended outright when the phone
// locks, which is precisely the state a rest-over alert exists for: the athlete
// put the phone down, sat back, and is waiting to be told. The old call site
// fired showLocalNotification from that page timer, so the notification could
// only arrive when he was already looking at a screen counting down in front of
// him.
//
// So the page hands over the absolute end timestamp at rest START and the
// worker holds the timer. A service worker can still be terminated while idle,
// so this is not a guarantee — it is a large improvement over a timer that
// provably cannot fire.
let restTimeoutId = null;

self.addEventListener("message", (event) => {
  const data = event.data || {};

  if (data.type === "SCHEDULE_REST") {
    clearTimeout(restTimeoutId);
    const delay = Math.max(0, (Number(data.at) || 0) - Date.now());
    restTimeoutId = setTimeout(() => {
      restTimeoutId = null;
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((windowClients) => {
          // A visible window is already showing him the countdown hitting zero
          // in the bottom bar. Firing on top of that just vibrates twice for one
          // event, so the worker owns the backgrounded case and only that.
          if (windowClients.some((c) => c.visibilityState === "visible")) return;
          return self.registration.showNotification("Rest over", {
            body: "Time to get back to work.",
            icon: BASE + "optigains-icon.svg",
            badge: BASE + "optigains-icon.svg",
            data: { url: BASE + "dashboard" },
            vibrate: [200, 100, 200],
            tag: "optigains-rest",
            renotify: true,
          });
        })
        .catch(() => {});
    }, delay);
  }

  if (data.type === "CANCEL_REST") {
    clearTimeout(restTimeoutId);
    restTimeoutId = null;
  }
});
