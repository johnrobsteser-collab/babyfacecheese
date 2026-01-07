/**
 * Service Worker for CHEESE Native Wallet
 */

// CRITICAL: V18 - REMOVED LEGACY WALLET WARNING PERMANENTLY - JAN 5 2026
// Force clear ALL old caches
const CACHE_NAME = 'cheese-native-wallet-v18-no-legacy';
const urlsToCache = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './blockchain-api.js',
    './wallet-core.js',
    './fiat-gateway.js',
    './swap-engine.js',
    './connect-manager.js',
    './wallet-enhancements.js',
    './wallet-security.js',
    './token-manager.js',
    './token-search.js', // CRITICAL: Added token-search.js to cache
    './mobile-miner.js',
    './bsc-verifier.js',
    './bridge-engine.js',
    './founder-income.js',
    './cross-chain-balance.js',
    './elliptic-loader.js',
    './manifest.json'
];

// Install
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching files');
                return cache.addAll(urlsToCache);
            })
            .catch((error) => {
                console.error('Cache error:', error);
            })
    );
    self.skipWaiting();
});

// Activate
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Delete ALL old caches to force fresh start
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // CRITICAL: Force clear all caches and reload clients
            return self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
                clients.forEach(client => {
                    // Send message to clear cache and reload
                    client.postMessage({
                        type: 'CLEAR_PRICE_CACHE',
                        action: 'clearNCHEESEPrice',
                        forceReload: true
                    });
                    // Force reload the client
                    if (client.focus) {
                        client.focus();
                    }
                });
            });
        }).then(() => {
            // Immediately claim clients to activate new service worker
            return self.clients.claim();
        })
    );
    // Skip waiting to activate immediately
    self.skipWaiting();
});

// Fetch - Network first strategy for better updates
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip external API requests - always fetch fresh
    // CRITICAL: Include CHEESE blockchain API
    if (event.request.url.includes('cheese-blockchain') ||
        event.request.url.includes('34.142.182.218') ||
        event.request.url.includes('moonpay') ||
        event.request.url.includes('ramp') ||
        event.request.url.includes('/api/')) {
        return fetch(event.request);
    }

    // For HTML files, always try network first
    if (event.request.headers.get('accept').includes('text/html')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // If network succeeds, update cache
                    if (response && response.status === 200) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Fallback to cache if network fails
                    return caches.match(event.request) || caches.match('./index.html');
                })
        );
        return;
    }

    // For JS/CSS files, use network first but with cache fallback
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Network succeeded - update cache
                if (response && response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // Network failed - try cache
                return caches.match(event.request);
            })
    );
});

