// Offline cache for Neon Swarm (home-screen install)
const CACHE = 'neon-swarm-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function put(req, res) { if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; }
function fromCache(req) { return caches.match(req, { ignoreSearch: true }); }
// Page: try network briefly so updates arrive, fall back to cache when offline
function networkFirst(req) {
  const net = fetch(req).then(res => put(req, res));
  const timeout = new Promise(resolve => setTimeout(resolve, 3500));
  return Promise.race([net, timeout]).then(res => res || fromCache(req).then(c => c || net))
    .catch(() => fromCache(req).then(c => c || caches.match('./index.html')));
}
// Icons, fonts: cache first
function cacheFirst(req) {
  return fromCache(req).then(c => c || fetch(req).then(res => put(req, res)).catch(() => new Response('', { status: 504 })));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
    e.respondWith(isPage ? networkFirst(req) : cacheFirst(req));
  } else if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(cacheFirst(req));
  }
});
