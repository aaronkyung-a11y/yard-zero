// YARD ZERO 서비스 워커: 한 번 열면 오프라인에서도 실행되도록 캐시한다. build.mjs가 버전을 채워 루트 sw.js로 내보낸다.
const VERSION = 'v0.9';
const CACHE = 'yard-zero-' + VERSION;
const CORE = ['index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  // 새 판을 받아 둘 때 브라우저 HTTP 캐시에 남은 옛 파일을 집지 않도록 서버에서 다시 받는다
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
// 열린 화면이 서비스 워커의 버전을 물어본다. 화면이 옛 판일 때만 "새 버전 적용" 버튼을 띄우는 데 쓴다
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'yz-ver' && e.ports && e.ports[0]) e.ports[0].postMessage({ v: VERSION });
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('yard-zero-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === 'navigate') {
      // 페이지: 온라인이면 최신본을 받아 캐시를 갱신하고, 4초 안에 응답이 없거나 오프라인이면 캐시본
      e.respondWith(
        Promise.race([fetch(req), timeout(4000)])
          .then((res) => {
            if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('index.html', copy)); }
            return res;
          })
          .catch(() => caches.match('index.html').then((hit) => hit || fetch(req)))
      );
      return;
    }
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }
  if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    // 글꼴: 캐시 우선, 뒤에서 갱신
    e.respondWith(
      caches.open(CACHE).then((c) => c.match(req).then((hit) => {
        const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      }))
    );
  }
});
