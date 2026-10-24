// UI toolkit: Preact + htm (vendored, no build step) and a few helpers.
export {
  html, render, h, Component, createContext, useState, useReducer, useEffect, useLayoutEffect,
  useRef, useMemo, useCallback, useContext,
} from '../vendor/preact-htm.js';
import { useState, useEffect, useRef } from '../vendor/preact-htm.js';

export const cx = (...a) => a.flat(Infinity).filter(Boolean).join(' ');

export function fmtTime(s) {
  s = Math.max(0, Math.round(Number(s) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export function fmtDuration(s) {
  const m = Math.round((s || 0) / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} hr ${m % 60} min`;
}

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

export function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function throttle(fn, ms) {
  let last = 0, timer;
  return (...a) => {
    const wait = ms - (Date.now() - last);
    clearTimeout(timer);
    if (wait <= 0) { last = Date.now(); fn(...a); } else timer = setTimeout(() => { last = Date.now(); fn(...a); }, wait);
  };
}

export function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Tiny observable store. */
export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      for (const f of [...subs]) f(state);
    },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
}

const same = (a, b) => {
  if (Object.is(a, b)) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && Object.getPrototypeOf(a) === Object.prototype) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.is(a[k], b[k]));
  }
  return false;
};

/** Subscribe a component to part of a store. selector must return primitives or a flat object. */
export function useStore(store, selector = (s) => s) {
  const [val, setVal] = useState(() => selector(store.get()));
  const sel = useRef(selector);
  sel.current = selector;
  useEffect(() => {
    setVal(sel.current(store.get()));
    return store.subscribe((s) => {
      const n = sel.current(s);
      setVal((prev) => (same(prev, n) ? prev : n));
    });
  }, [store]);
  return val;
}

/** Run an async loader when deps change; returns { data, error, loading, reload }. */
export function useAsync(loader, deps = []) {
  const [st, setSt] = useState({ data: null, error: null, loading: true });
  const run = useRef(0);
  const load = () => {
    const id = ++run.current;
    setSt((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve().then(loader).then(
      (data) => id === run.current && setSt({ data, error: null, loading: false }),
      (error) => id === run.current && setSt({ data: null, error, loading: false })
    );
  };
  useEffect(() => { load(); return () => { run.current++; }; }, deps);
  return { ...st, reload: load };
}

export function useEvent(target, name, fn, deps = []) {
  useEffect(() => {
    target.addEventListener(name, fn);
    return () => target.removeEventListener(name, fn);
  }, deps);
}

export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isTV = /Tizen|Web0S|webOS|SMART-TV|SmartTV|BRAVIA|AFTB|AFTT|AFTM|AFTS|AFTN|AFTK|Android TV|GoogleTV|CrKey|HbbTV|NetCast|VIDAA|Hisense|PHILIPS-AOC/i.test(navigator.userAgent);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** Dominant colour of an image URL as [r,g,b] (best-effort; CORS-blocked images return null). */
const colourCache = new Map();
export function dominantColour(url) {
  if (!url) return Promise.resolve(null);
  if (colourCache.has(url)) return Promise.resolve(colourCache.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 16;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, 16, 16);
        const d = x.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const max = Math.max(d[i], d[i + 1], d[i + 2]), min = Math.min(d[i], d[i + 1], d[i + 2]);
          const sat = max ? (max - min) / max : 0;
          const w = 0.2 + sat * 2; // favour vivid pixels
          r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; n += w;
        }
        const col = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
        colourCache.set(url, col);
        resolve(col);
      } catch { colourCache.set(url, null); resolve(null); }
    };
    img.onerror = () => { colourCache.set(url, null); resolve(null); };
    img.src = url;
  });
}
