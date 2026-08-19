// Bump this whenever shipped assets change, so clients drop the old cache.
const CACHE_NAME = 'messconnect-v2';

// Only paths that exist in a production build. /src/* are dev-server URLs, and
// addAll() rejects the whole install if any single request 404s — which meant
// the worker never installed once built.
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install Event - Cache App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell & static assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean Up Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network First Strategy with Offline Fallback
self.addEventListener('fetch', (event) => {
  // Ignore non-GET requests or browser extension URLs
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  // API Requests - Try Network, return cached or offline JSON fallback if network fails
  if (event.request.url.includes('/api/v1/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          return response;
        })
        .catch(() => {
          return new Response(
            JSON.stringify({
              offline: true,
              message: 'You are currently offline. Displaying cached data.'
            }),
            {
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }

  // Static Assets - Network First, fallback to Cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache valid static responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || caches.match('/');
        });
      })
  );
});

// Push Notifications Handler (Cutoff Reminders)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'MessConnect Reminder', body: 'Meal cutoff at 9:00 PM IST!' };
  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: '/?tab=calendar' }
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
