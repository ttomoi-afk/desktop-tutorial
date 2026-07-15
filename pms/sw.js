// sw.js — offline app shell for プロジェクト管理シート (scope: ./pms/).
// Strategy:
//   • Same-origin app files (html/js/css) → NETWORK-FIRST so a new deploy shows
//     up on the next load; falls back to cache when offline. (Cache-first here
//     was the bug that made updates invisible until the cache was cleared.)
//   • Cross-origin static (Google Fonts, Firebase SDK on gstatic) → cache-first.
//   • Firebase auth/database traffic → never touched (live data).
// Bump CACHE only to purge everything; freshness no longer depends on it.
const CACHE = 'pms-v2';
const CORE = [
  './', './index.html', './styles.css', './app.js', './store.js', './sync.js',
  './notify/chat.mjs', './firebase-config.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-180.png', './icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const putCache = (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Let live data/auth pass straight through (never cache).
  const isFirebaseData = url.hostname.endsWith('firebaseio.com')
    || (url.hostname.endsWith('googleapis.com') && url.pathname.includes('identitytoolkit'))
    || url.hostname.endsWith('firebasedatabase.app');
  if (isFirebaseData) return;

  if (url.origin === self.location.origin) {
    // network-first: always try the latest, fall back to cache offline.
    e.respondWith(
      fetch(req).then((res) => putCache(req, res)).catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
    );
  } else {
    // cache-first: versioned/stable third-party assets (fonts, Firebase SDK).
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => putCache(req, res)).catch(() => undefined))
    );
  }
});
