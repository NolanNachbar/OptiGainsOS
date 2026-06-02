const CACHE_NAME = "optigains-v1";

// App shell — cached on first install for offline support
const APP_SHELL = ["/", "/index.html", "/manifest.json", "/optigains-icon.svg"];

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

  // Network-first for navigation requests (keeps app fresh)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match("/index.html"))
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
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// Push notification received
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "OptiGainsOS", body: event.data.text() };
  }
  const { title, body, url = "/dashboard", icon = "/optigains-icon.svg" } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: "/optigains-icon.svg",
      data: { url },
      vibrate: [200, 100, 200],
    })
  );
});

// Notification tap → navigate to relevant page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
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
