// Einfacher Service Worker: App-Hülle offline, Kartenkacheln und API immer aus dem Netz.
const CACHE = 'kneipen-v2';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest'])));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});

// Push-Mitteilungen: Titel, Text und Ziel kommen von der Edge Function „push“
self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: 'Tresenschicht', body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    Promise.all([
      self.registration.showNotification(d.title || 'Tresenschicht', {
        body: d.body || '',
        tag: d.tag,
        data: { url: d.url || './' },
        icon: './icons/apple-touch-icon.png',
        badge: './icons/apple-touch-icon.png',
      }),
      // Zahl am App-Icon (ungelesene Mitteilungen)
      self.navigator && 'setAppBadge' in self.navigator && d.badge ? self.navigator.setAppBadge(d.badge).catch(() => {}) : null,
    ])
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope));
      if (open) {
        open.postMessage({ type: 'open', url });
        return open.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
