const CACHE_NAME = 'stphub-v6';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/logo.png'
];

self.addEventListener('install', (event) => {
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', (event) => {
    // Clear old caches
    event.waitUntil(
        caches.keys().then(async (cacheNames) => {
            // Disable navigation preload to avoid warnings if it became inadvertently enabled by a previous SW version
            if (self.registration.navigationPreload) {
                await self.registration.navigationPreload.disable();
            }
            
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🧹 Clearing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip cross-origin requests to avoid CORS / opaque response caching errors in SW
    if (url.origin !== self.location.origin) {
        return;
    }

    // NEVER intercept JS/CSS chunk files – let the browser fetch these directly from the server.
    // This prevents "Failed to fetch dynamically imported module" errors after deployments
    // when chunk hashes change and the SW would otherwise serve stale/404 responses.
    if (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
        return;
    }

    // NEVER intercept API calls or upload requests – they must always go to the server.
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) {
        return;
    }

    // For navigation requests (HTML pages in an SPA), serve index.html from cache as fallback
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match('/index.html'))
        );
        return;
    }

    // For everything else (images, manifest, logo), use network-first with cache fallback
    event.respondWith(
        (async () => {
            try {
                const preloadedResponse = await event.preloadResponse;
                if (preloadedResponse) {
                    return preloadedResponse;
                }
                return await fetch(event.request);
            } catch (err) {
                const cachedResponse = await caches.match(event.request);
                return cachedResponse || Response.error();
            }
        })()
    );
});

// Listen for CLEAR_CACHE message from the app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        });
    }
});

self.addEventListener('push', (event) => {
    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: 'New Notification', body: event.data.text() };
        }
    }

    const title = data.title || 'New Notification';
    const options = {
        body: data.body || 'You have a new update from StartupHub.',
        icon: data.icon || '/logo.png',
        image: data.image, // Show big picture in notification bar
        badge: '/logo.png',
        data: data.url || '/',
        vibrate: [100, 50, 100],
        requireInteraction: !!data.image, // Keep on screen if image present
        actions: [
            { action: 'open', title: 'Open App' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = event.notification.data || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If a window is already open, focus it
            for (const client of clientList) {
                if (client.url === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open a new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
