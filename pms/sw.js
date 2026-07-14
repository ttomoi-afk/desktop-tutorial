// sw.js — offline app shell for プロジェクト管理シート (scope: ./pms/).
// App assets are cache-first; Firebase auth/database traffic is never cached.
const CACHE = 'pms-v1';
const CORE = [
  './', './index.html', './styles.css', './app.js', './store.js', './sync.js',
  './firebase-config.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-180.png', './icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Let live data/auth pass straight through (never cache).
  const isFirebaseData = url.hostname.endsWith('firebaseio.com')
    || (url.hostname.endsWith('googleapis.com') && url.pathname.includes('identitytoolkit'))
    || url.hostname.endsWith('firebasedatabase.app');
  if (isFirebaseData) return;

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
