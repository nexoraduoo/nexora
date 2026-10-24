// Exercises public/sw.js in a simulated service-worker environment (no browser needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const pub = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');

function makeCaches() {
  const stores = new Map();
  const key = (r) => (typeof r === 'string' ? new URL(r, 'https://nexora.test').href : r.url);
  const mk = () => {
    const m = new Map();
    return {
      m,
      async add(r) { const req = typeof r === 'string' ? new Request(new URL(r, 'https://nexora.test')) : r; const res = await fetchImpl(req); if (!res.ok) throw new Error('bad'); m.set(key(req), res.clone()); },
      async put(r, res) { m.set(key(r), res); },
      async match(r, opts) { const k = key(r); const u = new URL(k); return (m.get(k) || (opts?.ignoreSearch && m.get(u.origin + u.pathname)))?.clone(); },
      async keys() { return [...m.keys()].map((u) => new Request(u)); },
      async delete(r) { return m.delete(key(r)); },
    };
  };
  return {
    stores,
    async open(n) { if (!stores.has(n)) stores.set(n, mk()); return stores.get(n); },
    async keys() { return [...stores.keys()]; },
    async delete(n) { return stores.delete(n); },
    async match(r, o) { for (const s of stores.values()) { const hit = await s.match(r, o); if (hit) return hit; } return undefined; },
  };
}

let fetchImpl;
function boot({ online = true, files = {} } = {}) {
  const listeners = {};
  const flags = { skipped: false, claimed: false };
  fetchImpl = async (req) => {
    if (!online) throw new TypeError('offline');
    const url = new URL(typeof req === 'string' ? req : req.url).pathname;
    if (url in files) return new Response(files[url], { status: 200, headers: { 'content-type': 'text/plain' } });
    return new Response('nope', { status: 404 });
  };
  const caches = makeCaches();
  const self = {
    addEventListener: (n, f) => { listeners[n] = f; },
    skipWaiting: async () => { flags.skipped = true; },
    clients: { claim: async () => { flags.claimed = true; } },
    __setOnline: (v) => { online = v; },
  };
  // in a real service worker, relative URLs resolve against the worker's own origin
  class SWRequest extends Request {
    constructor(u, i) { super(typeof u === 'string' ? new URL(u, 'https://nexora.test').href : u, i); }
  }
  const ctx = vm.createContext({
    self, caches, Request: SWRequest, Response, URL, Promise, console, clearTimeout,
    setTimeout: (f, ms) => setTimeout(f, ms / 100), // run the worker's 4-second timer in 40 ms
    location: { origin: 'https://nexora.test' },
    fetch: (r) => fetchImpl(r),
    importScripts: () => { self.__VERSION = 't1'; self.__PRECACHE = ['/', '/index.html', '/js/app.js']; },
  });
  vm.runInContext(readFileSync(join(pub, 'sw.js'), 'utf8'), ctx);
  const dispatch = async (name, init = {}) => {
    const pending = [];
    let responded = null;
    const ev = { ...init, waitUntil: (p) => pending.push(p), respondWith: (p) => { responded = p; } };
    listeners[name](ev);
    await Promise.all(pending);
    return responded ? await responded : undefined;
  };
  return { dispatch, caches, flags, self, setOnline: (v) => { online = v; } };
}

const files = { '/': 'shell', '/index.html': '<html>app</html>', '/js/app.js': 'code' };
const req = (url, init = {}) => new Request(new URL(url, 'https://nexora.test'), init);

test('install precaches the app shell and activates immediately', async () => {
  const sw = boot({ files });
  await sw.dispatch('install');
  assert.ok(sw.flags.skipped);
  const shell = sw.caches.stores.get('nexora-shell-t1');
  assert.deepEqual([...shell.m.keys()].sort(), ['https://nexora.test/', 'https://nexora.test/index.html', 'https://nexora.test/js/app.js']);
});

test('install survives a missing file', async () => {
  const sw = boot({ files: { '/': 'x' } });
  await sw.dispatch('install');
  assert.equal(sw.caches.stores.get('nexora-shell-t1').m.size, 1);
});

test('activate deletes old shell caches only', async () => {
  const sw = boot({ files });
  await sw.caches.open('nexora-shell-old');
  await sw.caches.open('nexora-images-v1');
  await sw.caches.open('someone-elses');
  await sw.dispatch('activate');
  assert.ok(sw.flags.claimed);
  assert.deepEqual([...sw.caches.stores.keys()].sort(), ['nexora-images-v1', 'someone-elses']);
});

test('navigation works offline from the cached shell', async () => {
  const sw = boot({ files });
  await sw.dispatch('install');
  sw.setOnline(false);
  const res = await sw.dispatch('fetch', { request: Object.assign(req('/#/library'), {}) , });
  // Request.mode is "cors" for a plain Request; emulate a navigation
  const nav = new Request(new URL('https://nexora.test/'), { method: 'GET' });
  Object.defineProperty(nav, 'mode', { value: 'navigate' });
  const res2 = await sw.dispatch('fetch', { request: nav });
  assert.equal(await res2.text(), '<html>app</html>');
  void res;
});

test('a slow first visit with nothing cached still waits for the network (never an error page)', async () => {
  const sw = boot({ files });
  fetchImpl = async () => { await new Promise((r) => setTimeout(r, 300)); return new Response('slow but fine', { status: 200 }); };
  const res = await sw.dispatch('fetch', { request: req('/js/app.js') });
  assert.equal(await res.text(), 'slow but fine');
});

test('a slow network falls back to the saved copy when one exists', async () => {
  const sw = boot({ files });
  await sw.dispatch('install');
  fetchImpl = async () => { await new Promise((r) => setTimeout(r, 300)); return new Response('late', { status: 200 }); };
  const res = await sw.dispatch('fetch', { request: req('/js/app.js') });
  assert.equal(await res.text(), 'code');
});

test('static files are served fresh when online and from cache when offline', async () => {
  const sw = boot({ files });
  await sw.dispatch('install');
  const online = await sw.dispatch('fetch', { request: req('/js/app.js') });
  assert.equal(await online.text(), 'code');
  sw.setOnline(false);
  const off = await sw.dispatch('fetch', { request: req('/js/app.js') });
  assert.equal(await off.text(), 'code');
});

test('API calls and non-GET requests are never intercepted', async () => {
  const sw = boot({ files });
  assert.equal(await sw.dispatch('fetch', { request: req('/api/me') }), undefined);
  assert.equal(await sw.dispatch('fetch', { request: req('/js/app.js', { method: 'POST' }) }), undefined);
});

test('cross-origin audio is left alone; cover art is cached for offline', async () => {
  const sw = boot({ files });
  const audio = Object.defineProperty(new Request('https://audio.example/a.mp3'), 'destination', { value: 'audio' });
  assert.equal(await sw.dispatch('fetch', { request: audio }), undefined);
  const img = Object.defineProperty(new Request('https://img.example/cover.jpg'), 'destination', { value: 'image' });
  fetchImpl = async () => new Response('jpegbytes', { status: 200 });
  const first = await sw.dispatch('fetch', { request: img });
  assert.equal(await first.text(), 'jpegbytes');
  await new Promise((r) => setTimeout(r, 20)); // background cache.put
  sw.setOnline(false);
  const again = await sw.dispatch('fetch', { request: img });
  assert.equal(await again.text(), 'jpegbytes');
});

test('the install page and the downloads are plain pages: the app shell is never served in their place', async () => {
  const sw = boot({ files });
  for (const p of ['/install', '/install.html', '/downloads/Nexora-Setup.exe', '/downloads/install-linux.sh']) {
    const r = req(p);
    Object.defineProperty(r, 'mode', { value: 'navigate' });
    assert.equal(await sw.dispatch('fetch', { request: r }), undefined, p);
  }
});
