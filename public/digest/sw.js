// Service worker for SourcemAI Digest PWA
// Handles: install, push notification display, cache management.

const CACHE_VERSION = 'v1';
const STATIC_ASSETS = [
  '/digest/index.html',
  '/digest/app.js',
];

// Install — cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[sw] Cache addAll failed (may be fine):', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network first, fall back to cache
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    // Don't cache API requests
    return;
  }
  if (url.pathname.startsWith('/digest/')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
});

// Push notification handler
self.addEventListener('push', event => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'SourcemAI Digest', body: event.data.text() };
  }

  const { title = 'SourcemAI', body = 'Your digest is ready', tag = 'digest' } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: 'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_160798/images/6ac4f552-fd8a-4c97-a90d-230e373fff98.png',
      badge: 'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_160798/images/6ac4f552-fd8a-4c97-a90d-230e373fff98.png',
      data: data.data || {},
      vibrate: [200, 100, 200],
    })
  );
});

// Notification click — open the digest app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes('/digest') && 'focus' in client) {
          return client.focus();
        }
      }
      // Open digest app
      if (self.clients.openWindow) {
        return self.clients.openWindow('/digest/');
      }
    })
  );
});