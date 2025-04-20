const CACHE_NAME = 'pwa-cache-v1';
const urlsToCache = [
  './', // Cache the root URL which serves index.html
  'index.html',
  'manifest.json',
  'service-worker.js',
  'icon-512x512.png'
  // Add other static assets here if needed, e.g., CSS, JS files, fonts
  // Note: External scripts like Tailwind CSS CDN are generally NOT cached by your SW
  // unless specifically added here and handled carefully.
  // For this basic example, we only cache the core PWA files.
];

// Install event: Cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('[Service Worker] Cache addAll failed:', error);
      })
  );
  self.skipWaiting(); // Allow the new service worker to activate immediately
});

// Activate event: Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all clients immediately
  event.waitUntil(self.clients.claim());
  console.log('[Service Worker] Activated and claimed clients.');
});

// Fetch event: Cache-first strategy
self.addEventListener('fetch', (event) => {
  // We only handle GET requests and requests for our origin
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
      return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // If cached, return the cached response
        if (cachedResponse) {
          console.log('[Service Worker] Serving from cache:', event.request.url);
          return cachedResponse;
        }

        // Otherwise, fetch from the network
        console.log('[Service Worker] Fetching from network:', event.request.url);
        return fetch(event.request)
          .then((response) => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              // If response is invalid, don't cache it
              console.log('[Service Worker] Network fetch failed or invalid response:', event.request.url);
              return response; // Return the potentially non-200 response
            }

            // Clone the response because it's a stream and can only be consumed once
            const responseToCache = response.clone();

            // Open cache and put the new response in it
            caches.open(CACHE_NAME)
              .then((cache) => {
                console.log('[Service Worker] Caching new resource:', event.request.url);
                cache.put(event.request, responseToCache);
              });

            return response; // Return the original response to the client
          })
          .catch((error) => {
            // Network request failed
            console.error('[Service Worker] Fetch failed:', event.request.url, error);
            // You could return a fallback response here if needed, e.g., an offline page
            // For this basic example, we'll just let the fetch promise reject.
            // If the request was for an asset in urlsToCache, caches.match would have handled it.
            // For other assets, they will fail if offline.
            throw error; // Rethrow the error
          });
      })
  );
});


// Periodic Background Sync event
self.addEventListener('periodicsync', (event) => {
  console.log(`[Service Worker] Periodic Sync event received: ${event.tag}`);
  if (event.tag === 'content-sync') {
    // This is where you would fetch updated content, e.g., a list of URLs to check
    // For demonstration, we'll just fetch a dummy URL.
    event.waitUntil(
      fetch('./ping.json') // Replace with your actual content update URL
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json(); // Or response.text(), etc.
        })
        .then((data) => {
          console.log('[Service Worker] Periodic Sync successful:', data);
          // Process fetched data here (e.g., update IndexedDB, send notification)
        })
        .catch((error) => {
          console.error('[Service Worker] Periodic Sync failed:', error);
          // Handle failure (e.g., log, schedule a retry if needed)
        })
    );
  }
});

// Background Sync event (one-time sync)
self.addEventListener('sync', (event) => {
  console.log(`[Service Worker] Background Sync event received: ${event.tag}`);
  if (event.tag === 'sync-data') {
    // This is where you would retry failed network requests or send queued data
    // For demonstration, we'll fetch a dummy URL.
    event.waitUntil(
      fetch('./sync.json', { method: 'POST', body: JSON.stringify({ status: 'retrying' }) }) // Replace with your actual sync endpoint
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          console.log('[Service Worker] Background Sync successful');
          // Handle success (e.g., clear queued data)
        })
        .catch((error) => {
          console.error('[Service Worker] Background Sync failed:', error);
          // Handle failure (e.g., re-queue data, rely on browser to retry later)
          // The browser will automatically retry 'sync' events with network connectivity.
          // You can request a retry manually if needed, but often it's best to let the browser handle it.
        })
    );
  }
});