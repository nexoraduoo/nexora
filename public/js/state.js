// Global state: small observable stores + router + toasts + synced preferences.
import { createStore, debounce, isTV } from './lib.js';

export function parseHash() {
  const raw = location.hash.slice(1) || '/home';
  const [path, qs] = raw.split('?');
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: Object.fromEntries(new URLSearchParams(qs || '')) };
}
export const nav = (path, replace = false) => {
  if (replace) location.replace(`#${path}`); else location.hash = path;
};

const read = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
export const local = { read, write };

export const DEFAULT_PREFS = {
  theme: 'dark', lang: 'en', country: '', voiceLang: '', voiceReplies: true, wake: false,
  crossfade: 0, normalize: false, speed: 1,
  eq: { on: false, preset: 'flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  contentLangs: [], hideExplicit: false, tv: false, ytAuto: true, previews: false,
};

function loadPrefs() {
  let p = {};
  try { p = JSON.parse(read('nx.prefs', '{}')); } catch { /* ignore */ }
  // a TV browser starts in TV mode (big text, remote-friendly) unless the person turned it off
  return { ...DEFAULT_PREFS, theme: read('nx.theme', 'dark'), lang: read('nx.lang', '') || DEFAULT_PREFS.lang, ...p, tv: read('nx.tv', isTV ? '1' : '0') === '1' };
}

export const app = createStore({
  ready: false, user: null, device: null, config: {}, server: {}, route: parseHash(), toast: null,
  online: navigator.onLine, installEvt: null, prefs: loadPrefs(), updateReady: false, pending: 0,
});

export const player = createStore({
  queue: [], index: -1, track: null, playing: false, loading: false, shuffle: false, repeat: 'off',
  vol: Number(read('nx.vol', '1')), muted: false, speed: 1, sleepAt: null, sleepEnd: false, error: null,
  context: '', fxOn: false, radio: false,
});
export const clock = createStore({ pos: 0, dur: 0, buffered: 0 });

export const lib = createStore({
  loaded: false, likedIds: new Set(), liked: [], playlists: [], albums: [], artists: [], stations: [], podcasts: [],
  downloads: new Map(), history: [], people: [],
});

export const conn = createStore({ online: false, devices: [], target: null, remote: {}, meId: null });

export const ui = createStore({ nowPlaying: false, panel: null, voice: false, menu: null, modal: null, nowTab: 'art' });

window.addEventListener('hashchange', () => app.set({ route: parseHash() }));
window.addEventListener('online', () => app.set({ online: true }));
window.addEventListener('offline', () => app.set({ online: false }));
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); app.set({ installEvt: e }); });
window.addEventListener('appinstalled', () => app.set({ installEvt: null }));

// ------------------------------------------------------------------ toasts
let toastId = 0;
export function toast(text, opts = {}) {
  const id = ++toastId;
  app.set({ toast: { id, text, kind: opts.kind || 'info', action: opts.action || null } });
  setTimeout(() => { if (app.get().toast?.id === id) app.set({ toast: null }); }, opts.ms || 4200);
}

// ------------------------------------------------------------------ preferences (local + account)
let pushPrefs = null;
export function setPrefs(patch, { sync = true } = {}) {
  const prefs = { ...app.get().prefs, ...patch };
  app.set({ prefs });
  write('nx.prefs', JSON.stringify(prefs));
  if (patch.theme) write('nx.theme', patch.theme);
  if (patch.lang) write('nx.lang', patch.lang);
  if (patch.tv !== undefined) write('nx.tv', patch.tv ? '1' : '0');
  if (sync && app.get().user) {
    pushPrefs = pushPrefs || debounce(async () => {
      const { api } = await import('./api.js');
      const { theme, lang, country, voiceLang, voiceReplies, wake, crossfade, normalize, eq, contentLangs, hideExplicit, ytAuto, autoplay, previews } = app.get().prefs;
      api('PATCH', '/api/me', { prefs: { theme, lang, country, voiceLang, voiceReplies, wake, crossfade, normalize, eq, contentLangs, hideExplicit, ytAuto, autoplay, previews } }).catch(() => {});
    }, 1200);
    pushPrefs();
  }
}

export function applyTheme() {
  let { theme } = app.get().prefs;
  if (theme === 'system') theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'light' ? '#f5f5fa' : '#0b0b12');
  document.documentElement.classList.toggle('tv', !!app.get().prefs.tv);
}

/** Region used for Apple store charts + search ranking */
export function region() {
  const p = app.get().prefs.country;
  if (p) return p;
  const m = (navigator.language || 'en-US').match(/-([A-Za-z]{2})$/);
  return m ? m[1].toUpperCase() : 'US';
}

export const isAdmin = () => app.get().user?.role === 'admin';
