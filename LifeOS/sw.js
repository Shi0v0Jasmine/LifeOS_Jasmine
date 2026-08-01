const STATIC_CACHE = 'lifeos-static-v20260801-2';
const DATA_CACHE = 'lifeos-data-v20260730-1';
const RUNTIME_CACHE = 'lifeos-runtime-v20260730-1';

const STATIC_ASSETS = [
    './',
    './index.html',
    './timeline.html',
    './tasks.html',
    './habits.html',
    './nutrition.html',
    './review.html',
    './learning.html',
    './characters.html',
    './settings.html',
    './test.html',
    './css/style.css',
    './js/core.js',
    './js/nutrition.js',
    './js/sync.js',
    './js/mobile-nav.js',
    './js/pwa.js',
    './data/food-nutrition.json',
    './assets/icons/lifeos-app.svg',
    './assets/icons/lifeos-app-192.png',
    './assets/icons/lifeos-app-512.png',
    './assets/icons/apple-touch-icon.png',
    './assets/icons/blue-moon-flower.svg',
    './assets/icons/cat.svg',
    './assets/icons/chalice.svg',
    './assets/icons/dog.svg',
    './assets/icons/enkidu-knot.svg',
    './assets/icons/fuji.svg',
    './assets/icons/leaf.svg',
    './assets/icons/microphone.svg',
    './assets/icons/sash.svg',
    './assets/icons/volleyball.svg'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(function(cache) { return cache.addAll(STATIC_ASSETS); })
            .then(function() { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function(event) {
    const keep = [STATIC_CACHE, DATA_CACHE, RUNTIME_CACHE];
    event.waitUntil(
        caches.keys()
            .then(function(keys) {
                return Promise.all(keys.map(function(key) {
                    if (keep.indexOf(key) === -1) return caches.delete(key);
                    return Promise.resolve(false);
                }));
            })
            .then(function() { return self.clients.claim(); })
    );
});

function isApiGet(request, url) {
    return request.method === 'GET' &&
        url.origin === self.location.origin &&
        url.pathname.indexOf('/api/') === 0;
}

function isNavigation(request) {
    return request.mode === 'navigate' ||
        (request.method === 'GET' && (request.headers.get('accept') || '').indexOf('text/html') !== -1);
}

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
    }
}

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
        const cache = await caches.open(STATIC_CACHE);
        cache.put(request, response.clone());
    }
    return response;
}

async function cacheFirstRuntime(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone());
    }
    return response;
}

self.addEventListener('fetch', function(event) {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;

    if (isApiGet(request, url)) {
        event.respondWith(networkFirst(request, DATA_CACHE));
        return;
    }

    if (isNavigation(request)) {
        event.respondWith(
            networkFirst(request, STATIC_CACHE)
                .catch(function() { return caches.match('./index.html'); })
        );
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(cacheFirst(request));
        return;
    }

    if (url.hostname === 'cdn.jsdelivr.net') {
        event.respondWith(cacheFirstRuntime(request));
    }
});
