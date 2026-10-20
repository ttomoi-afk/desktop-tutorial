// sw.js — マネーノートのオフライン用アプリシェル（scope: ./money/）。
//   • 同一オリジンのアプリファイル → ネットワーク優先（新しいデプロイが次回起動で反映）、オフライン時はキャッシュ
//   • 外部の静的資産（Google Fonts / Firebase SDK） → キャッシュ優先
//   • Firebase の認証・データ通信 → 触らない（常にライブ）
const CACHE = 'money-v1';
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

const putCache = (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFirebaseData = url.hostname.endsWith('firebaseio.com')
    || (url.hostname.endsWith('googleapis.com') && url.pathname.includes('identitytoolkit'))
    || url.hostname.endsWith('firebasedatabase.app');
  if (isFirebaseData) return;

  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then((res) => putCache(req, res)).catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
    );
  } else {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => putCache(req, res)).catch(() => undefined))
    );
  }
});
