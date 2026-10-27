// 미리 — 오프라인용. 항상 네트워크를 먼저 쓰고, 안 되면 저장해 둔 파일을 쓴다.
// 앱 파일은 브라우저 HTTP 캐시도 건너뛰고 서버에 확인해서(no-cache) 새 버전이 바로 보이게 한다.
const CACHE = 'miri-v7';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './calc.js',
  './store.js',
  './icons.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === location.origin;
  e.respondWith(
    (sameOrigin ? fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(e.request))
      .then((res) => {
        if (res.ok && (sameOrigin || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
