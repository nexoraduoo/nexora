// Nexora service worker: makes the app open instantly, work offline, and cache cover art.
// Music is NOT handled here: downloaded songs live in IndexedDB and stream/radio goes straight to the network.
importScripts('/sw-manifest.js');

const SHELL = `nexora-shell-${self.__VERSION}`;
const IMAGES = 'nexora-images-v1';
const MAX_IMAGES = 400;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // add one by one so a single missing file can never block the install
    await Promise.all((self.__PRECACHE || []).map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('nexora-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// Network first. A saved copy is used only if the network is offline or very slow AND we actually have
// one; with nothing saved we always wait for the real network (never invent an error page).
async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(SHELL);
  const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
  net.catch(() => {});
  const saved = (await cache.match(req, { ignoreSearch: true })) || (fallbackUrl && (await cache.match(fallbackUrl)));
  if (!saved) return net;
  try {
    return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
  } catch {
    return saved;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/api/')) return; // always live
    if (/^\/(install|downloads)(\/|\.html|$)/.test(url.pathname)) return; // the install page and its files are plain pages, not the app
    if (req.mode === 'navigate') { e.respondWith(networkFirst(new Request('/index.html'), '/index.html')); return; }
    if (/^\/(icons|vendor)\//.test(url.pathname)) {
      e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { const c = r.clone(); caches.open(SHELL).then((ch) => ch.put(req, c)); return r; })));
      return;
    }
    e.respondWith(networkFirst(req));
    return;
  }

  // album art from other hosts: cache-first, refreshed in the background
  if (req.destination === 'image') {
    e.respondWith((async () => {
      const cache = await caches.open(IMAGES);
      const hit = await cache.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') { cache.put(req, r.clone()); trim(IMAGES, MAX_IMAGES); } return r; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
});
