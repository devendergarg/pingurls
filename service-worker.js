const CACHE_NAME = 'pwa-cache-v1';
const FILES_TO_CACHE = [
  './', // Cache the root path, often serves index.html
  'index.html',
  'manifest.json',
  'service-worker.js',
  'icon-512x512.png'
  // Note: CDN assets like the tailwindcss script are not included in this basic pre-cache list.
  // They will be fetched from the network if not already cached by the browser.
];

// Install event: cache necessary files
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(FILES_TO_CACHE).catch(error => {
            console.error('Service Worker: addAll failed during install', error);
            // Allow installation to proceed even if some files fail to cache
        });
      })
      .then(() => self.skipWaiting()) // Forces the waiting service worker to become the active service worker
      .catch(error => {
        console.error('Service Worker: Installation failed', error);
      })
  );
});

// Activate event: clean up old caches and claim clients
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    // Delete old caches
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
          return null;
        })
      ).then(() => {
         console.log('Service Worker: Old caches cleared');
         return self.clients.claim(); // Take control of all clients immediately
      });
    }).catch(error => {
      console.error('Service Worker: Activation failed', error);
    })
  );
});

// Fetch event: serve from cache first, fallback to network
self.addEventListener('fetch', (event) => {
  // Only intercept HTTP/HTTPS requests, not chrome-extension:// etc.
  if (event.request.url.startsWith('http')) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          // Cache hit - return response
          if (response) {
            // console.log('Service Worker: Serving from cache', event.request.url);
            return response;
          }

          // No cache hit - fetch from network
          // console.log('Service Worker: Fetching from network', event.request.url);
          return fetch(event.request)
            .then((fetchResponse) => {
              // Check if we received a valid response
              // We can cache 'basic' responses (from our origin) and 'opaque' (e.g., cross-origin like CDN)
              // Caching opaque responses is possible but has limitations (cannot read status, headers, etc.)
              // For a basic cache-first, let's cache successful responses regardless of type,
              // but only if the status is OK (or type is opaque where status is not available).
              const shouldCache = fetchResponse &&
                                  (fetchResponse.status === 200 || fetchResponse.type === 'opaque');

              if (shouldCache) {
                  // IMPORTANT: Clone the response. A response is a stream
                  // and can only be consumed once. We must consume the stream
                  // to cache it, and we must also return the response to the browser.
                  const responseToCache = fetchResponse.clone();

                  caches.open(CACHE_NAME)
                    .then((cache) => {
                      cache.put(event.request, responseToCache).catch(error => {
                          console.error('Service Worker: Failed to cache response for', event.request.url, error);
                      });
                    });
              } else if (fetchResponse && fetchResponse.status !== 200) {
                  console.warn('Service Worker: Not caching response with status', fetchResponse.status, event.request.url);
              } else if (!fetchResponse) {
                   console.warn('Service Worker: Not caching empty response for', event.request.url);
              }


              return fetchResponse;
            })
            .catch((error) => {
              // Network request failed. Handle offline case or fallback.
              console.error('Service Worker: Fetch failed:', event.request.url, error);
              // You could return a specific offline page here if desired
              // return caches.match('/offline.page');
              // For now, just let the browser handle the network error
              throw error; // Re-throw the error so the page knows it failed
            });
        })
    );
  }
  // For non-http requests (e.g., chrome-extension://), let the default fetch handle it
});