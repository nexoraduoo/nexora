// Nexora - app bootstrap and routing.
import { html, render, cx, useStore, useEffect } from './lib.js';
import { app, lib, player, ui, conn, nav, setPrefs, applyTheme } from './state.js';
import * as together from './together.js';
import { checkOnce as checkAssets } from './assets.js';
import { api } from './api.js';
import { setLanguage, t } from './i18n.js';
import { engine } from './player.js';
import { ctl } from './ctl.js';
import * as connect from './connect.js';
import * as offline from './offline.js';
import * as cat from './catalog.js';
import { loadLibrary, toggleLike } from './library.js';
import { fx } from './fx.js';
import { startWake, stopWake } from './voice.js';
import { MenuHost, ToastHost } from './ui.js';
import { AuthView } from './views/auth.js';
import { HomeView } from './views/home.js';
import { SearchView } from './views/search.js';
import { BrowseView, LangView, MoodView, ChartsView, RadioView, CatalogView } from './views/browse.js';
import { LibraryView, ImportView } from './views/library.js';
import { PodcastsView, PodcastView } from './views/podcasts.js';
import { JoinRoomView } from './views/together.js';
import { Tour, ErrorFence, OfflineBar, InstallHint } from './views/polish.js';
import { ReleaseView } from './views/world.js';
import { PlaylistView, AlbumView, ArtistView } from './views/detail.js';
import { SettingsView, FriendsView, AdminView } from './views/settings.js';
import { Sidebar, Topbar, TabBar, ModalHost, VoiceOverlay } from './views/shell.js';
import { PlayerBar, SidePanel, NowPlaying } from './views/player-ui.js';

// ------------------------------------------------------------------ session lifecycle
async function enter(user, cfg) {
  app.set({ user, config: cfg || app.get().config, pending: (cfg && cfg.pending) || 0 });
  try { localStorage.setItem('nx.user', JSON.stringify(user)); } catch { /* ignore */ }
  // account preferences follow you to every device
  if (user.prefs && Object.keys(user.prefs).length) {
    setPrefs({ ...user.prefs }, { sync: false });
    if (user.prefs.lang) await setLanguage(user.prefs.lang);
    applyTheme();
  }
  const p = app.get().prefs;
  if (p.eq?.on) { /* graph is created lazily on first playback tap */ }
  connect.start();
  loadLibrary();
  checkAssets(); // refresh saved songs whose audio was replaced
  if (p.wake) startWake();
}

async function afterAuth(user) {
  const me = await api('GET', '/api/me').catch(() => ({ user, device: null, config: {} }));
  app.set({ device: me.device });
  await enter(me.user || user, me.config);
  nav('/home', true);
}

async function logout() {
  try { await api('POST', '/api/auth/logout', {}); } catch { /* offline: still sign out locally */ }
  engine.pause();
  together.leave(true);
  stopWake();
  connect.stop();
  try { localStorage.removeItem('nx.user'); localStorage.removeItem('nx.queue'); } catch { /* ignore */ }
  player.set({ queue: [], index: -1, track: null, playing: false });
  lib.set({ loaded: false, liked: [], likedIds: new Set(), playlists: [], albums: [], artists: [], stations: [], history: [], people: [] });
  app.set({ user: null, device: null });
  nav('/login', true);
}
window.addEventListener('nexora:logout', logout);

// the owner's "people are waiting" badge: look again every minute while the app is open
setInterval(async () => {
  if (document.hidden || app.get().user?.role !== 'admin' || !app.get().online) return;
  try { const me = await api('GET', '/api/me'); app.set({ pending: me.config.pending || 0 }); } catch { /* offline */ }
}, 60_000);

async function boot() {
  await setLanguage(app.get().prefs.lang || 'en');
  applyTheme();
  await offline.init();
  engine.restore();
  engine.autoplayProvider = (track, queue) => (app.get().prefs.autoplay === false ? [] : cat.similarTo(track, queue));
  try {
    const me = await api('GET', '/api/me');
    app.set({ device: me.device });
    await enter(me.user, me.config);
    if (['login', 'join'].includes(app.get().route.parts[0])) nav('/home', true);
  } catch (e) {
    if (e.code === 'offline') {
      // no connection: open the app from the last session so downloaded music still plays
      try { const u = JSON.parse(localStorage.getItem('nx.user') || 'null'); if (u) { app.set({ user: u, online: false }); lib.set({ loaded: true }); } } catch { /* ignore */ }
    }
    if (!app.get().user && !['login', 'join'].includes(app.get().route.parts[0])) nav('/login', true);
  }
  app.set({ ready: true });
}

// ------------------------------------------------------------------ routes
function View({ route }) {
  const p = route.parts;
  switch (p[0]) {
    case 'search': return html`<${SearchView} route=${route} />`;
    case 'browse': return html`<${BrowseView} />`;
    case 'lang': return html`<${LangView} route=${route} key=${p[1]} />`;
    case 'mood': case 'genre': return html`<${MoodView} route=${route} key=${p[1]} />`;
    case 'charts': return html`<${ChartsView} route=${route} />`;
    case 'release': return html`<${ReleaseView} route=${route} key=${p[1]} />`;
    case 'together': return html`<${JoinRoomView} route=${route} key=${p[1]} />`;
    case 'podcasts': return html`<${PodcastsView} />`;
    case 'podcast': return html`<${PodcastView} route=${route} key=${p[1]} />`;
    case 'catalog': return html`<${CatalogView} route=${route} key=${p[1]} />`;
    case 'radio': return html`<${RadioView} route=${route} />`;
    case 'library': return html`<${LibraryView} route=${route} />`;
    case 'import': return html`<${ImportView} />`;
    case 'playlist': return html`<${PlaylistView} route=${route} key=${p[1]} />`;
    case 'album': return html`<${AlbumView} route=${route} key=${p[2]} />`;
    case 'artist': return html`<${ArtistView} route=${route} key=${p[2]} />`;
    case 'settings': return html`<${SettingsView} route=${route} />`;
    case 'friends': return html`<${FriendsView} />`;
    case 'admin': return html`<${AdminView} />`;
    case 'home': default: return html`<${HomeView} />`;
  }
}

function App() {
  const { ready, user, route, lang, online, updateReady } = useStore(app, (s) => ({ ready: s.ready, user: s.user, route: s.route, lang: s.prefs.lang, online: s.online, updateReady: s.updateReady }));
  const hasTrack = useStore(player, (s) => !!s.track);
  const tv = useStore(app, (s) => s.prefs.tv);
  useEffect(() => { document.getElementById('view')?.scrollTo?.(0, 0); }, [route.path]);
  if (!ready) return html`<div class="splash"><div class="splash-mark"></div><div class="splash-name">NEXORA</div></div>`;
  if (!user) return html`<${AuthView} route=${route} onDone=${afterAuth} /><${ToastHost} />`;
  return html`<div class=${cx('app', hasTrack && 'has-player', tv && 'tv-mode')} key=${lang}>
    <${Sidebar} route=${route} />
    <div class="main">
      <${Topbar} route=${route} />
      ${updateReady ? html`<div class="banner"><span>${t('A new version of Nexora is ready.')}</span><button class="btn sm" onClick=${() => location.reload()}>${t('Reload')}</button></div>` : null}
      <${OfflineBar} />
      <${InstallHint} />
      <main class="view" id="view" tabindex="-1"><${ErrorFence} resetKey=${route.path}><${View} route=${route} /><//></main>
    </div>
    <${SidePanel} />
    <${PlayerBar} />
    <${TabBar} route=${route} />
    <${NowPlaying} />
    <${VoiceOverlay} route=${route} />
    <${ModalHost} />
    <${Tour} />
    <${MenuHost} />
    <${ToastHost} />
  </div>`;
}

// ------------------------------------------------------------------ keyboard shortcuts + TV remote navigation
const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
addEventListener('keydown', (e) => {
  if (!app.get().user || e.ctrlKey || e.metaKey || e.altKey) return;
  if (typing(e)) return;
  const k = e.key;
  if (k === ' ' && !/^(BUTTON|A)$/.test(e.target.tagName)) { e.preventDefault(); ctl.toggle(); }
  else if (k === 'ArrowRight' && e.shiftKey) ctl.next();
  else if (k === 'ArrowLeft' && e.shiftKey) ctl.prev();
  else if (k === 'j') engine.seekBy(-10);
  else if (k === 'l') engine.seekBy(10);
  else if (k === 'm') ctl.mute();
  else if (k === 'n') ctl.next();
  else if (k === 'p') ctl.prev();
  else if (k === 's') ctl.shuffle();
  else if (k === 'r') ctl.repeat();
  else if (k === 'f') { const t0 = player.get().track; if (t0) toggleLike(t0); }
  else if (k === '/') { e.preventDefault(); document.getElementById('search-input')?.focus(); }
  else if (k === 'q') ui.set({ panel: ui.get().panel === 'queue' ? null : 'queue' });
  else if (k === 'v') { ui.set({ voice: true }); import('./voice.js').then((m) => m.startListening()); }
  else if (k === 'ArrowUp' && e.shiftKey) ctl.volume(Math.min(1, player.get().vol + 0.1));
  else if (k === 'ArrowDown' && e.shiftKey) ctl.volume(Math.max(0, player.get().vol - 0.1));
});

// Remotes: Enter / OK presses whatever is focused (cards and tiles are not real buttons)
addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.defaultPrevented && e.target.matches?.('[tabindex="0"]') && !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) { e.preventDefault(); e.target.click(); }
});

// Remotes: Back, and the play / pause / skip keys of Samsung, LG and Android TV remotes
function goBack() {
  const u = ui.get();
  if (u.voice) return ui.set({ voice: false });
  if (u.modal) return ui.set({ modal: null });
  if (u.menu) return ui.set({ menu: null });
  if (u.nowPlaying) return ui.set({ nowPlaying: false });
  if (u.panel) return ui.set({ panel: null });
  if (history.length > 1 && app.get().route.parts[0] !== 'home') return history.back();
  return undefined;
}
const REMOTE = { 415: 'play', 19: 'pause', 413: 'pause', 417: 'next', 412: 'prev', 10252: 'toggle', 179: 'toggle' };
addEventListener('keydown', (e) => {
  if (!app.get().user) return;
  if (e.keyCode === 10009 || e.keyCode === 461 || e.key === 'BrowserBack' || e.key === 'GoBack' || (e.key === 'Escape' && !typing(e) && !ui.get().modal)) { e.preventDefault(); goBack(); return; }
  const cmd = REMOTE[e.keyCode];
  if (cmd && !typing(e)) { e.preventDefault(); ctl[cmd](); }
});

// TV mode: move focus with the arrow keys / D-pad
addEventListener('keydown', (e) => {
  if (!app.get().prefs.tv || typing(e) || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) || e.shiftKey) return;
  const items = [...document.querySelectorAll('a[href],button:not([disabled]),[tabindex="0"],input,select')].filter((el) => el.offsetParent !== null);
  const cur = document.activeElement && items.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) { items[0]?.focus(); e.preventDefault(); return; }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null;
  for (const el of items) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
    const ok = e.key === 'ArrowRight' ? dx > 4 : e.key === 'ArrowLeft' ? dx < -4 : e.key === 'ArrowDown' ? dy > 4 : dy < -4;
    if (!ok) continue;
    const dist = e.key === 'ArrowLeft' || e.key === 'ArrowRight' ? Math.abs(dx) + Math.abs(dy) * 3 : Math.abs(dy) + Math.abs(dx) * 3;
    if (!best || dist < best.dist) best = { el, dist };
  }
  if (best) { best.el.focus(); best.el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); e.preventDefault(); }
});

// ------------------------------------------------------------------ service worker (offline app shell + updates)
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) app.set({ updateReady: true }); });
    });
  }).catch(() => {});
}

// handy for debugging in the console
window.nexora = { app, player, lib, conn, ui, engine, ctl, fx };

const mount = document.getElementById('app');
mount.textContent = ''; // remove the static splash before Preact takes over
render(html`<${App} />`, mount);
boot();
