const CACHE_NAME = 'rplay-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './assets/favicon_io/favicon.ico',
  './assets/favicon_io/apple-touch-icon.png',
  './assets/favicon_io/android-chrome-192x192.png',
  './assets/favicon_io/android-chrome-512x512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Let external API and media stream requests bypass static asset cache
  if (e.request.url.includes('/api/v1/') || e.request.url.includes('googlevideo.com')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});