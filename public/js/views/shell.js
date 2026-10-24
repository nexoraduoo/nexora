// App chrome: sidebar, top bar, mobile tab bar, voice overlay, modal host.
import { html, cx, useState, useEffect, useRef, useStore } from '../lib.js';
import { Icon } from '../icons.js';
import { app, lib, ui, nav, isAdmin } from '../state.js';
import { Avatar, IconBtn, Cover, openMenu, AddToPlaylist } from '../ui.js';
import { SearchBox } from './search.js';
import { voice, voiceSupported, startListening, stopListening, runText } from '../voice.js';
import { EXAMPLES } from '../nlu.js';
import { t } from '../i18n.js';
import { isStandalone } from '../lib.js';

const NAV = [['home', 'home', 'Home'], ['search', 'search', 'Search'], ['browse', 'globe', 'Browse'], ['library', 'library', 'Your Library']];

export function Sidebar({ route }) {
  const user = useStore(app, (s) => s.user);
  const pls = useStore(lib, (s) => s.playlists);
  const evt = useStore(app, (s) => s.installEvt);
  const pending = useStore(app, (s) => s.pending);
  const here = route.parts[0];
  return html`<aside class="sidebar">
    <a class="brand" href="#/home"><img src="/icons/icon.svg" width="34" height="34" alt="" /><span>NEXORA</span></a>
    <nav class="side-nav">
      ${NAV.map(([k, i, l]) => html`<a href=${`#/${k}`} class=${cx(here === k && 'active')}><${Icon} name=${i} size=${22} /> ${t(l)}</a>`)}
      <a href="#/radio" class=${cx(here === 'radio' && 'active')}><${Icon} name="radio" size=${22} /> ${t('Live radio')}</a>
      <a href="#/podcasts" class=${cx((here === 'podcasts' || here === 'podcast') && 'active')}><${Icon} name="podcast" size=${22} /> ${t('Podcasts')}</a>
      <a href="#/friends" class=${cx(here === 'friends' && 'active')}><${Icon} name="users" size=${22} /> ${t('Friends')}</a>
    </nav>
    <div class="side-lib">
      <div class="side-lib-head"><span>${t('Playlists')}</span><${IconBtn} icon="plus" label=${t('New playlist')} size=${18} onClick=${() => nav('/library/playlists')} /></div>
      <a href="#/library/liked" class="side-pl"><span class="mini-ic liked"><${Icon} name="heart" size=${14} fill /></span> ${t('Liked Songs')}</a>
      ${pls.slice(0, 40).map((p) => html`<a href=${`#/playlist/${p.id}`} class=${cx('side-pl', route.parts[0] === 'playlist' && route.parts[1] === p.id && 'active')}><${Cover} src=${p.cover} size=48 title=${p.name} icon="list" /> <span>${p.name}</span></a>`)}
    </div>
    ${evt && !isStandalone() ? html`<button class="btn install" onClick=${async () => { evt.prompt(); await evt.userChoice; app.set({ installEvt: null }); }}><${Icon} name="download" size=${18} /> ${t('Install app')}</button>` : null}
    <a class="side-user" href="#/settings"><${Avatar} user=${user} size=${34} /><span><b>${user?.displayName}</b><small>${t('Settings')}</small></span>${pending ? html`<i class="badge-dot" title=${t('People are waiting for approval')}>${pending}</i>` : null}</a>
  </aside>`;
}

export function Topbar({ route }) {
  const user = useStore(app, (s) => s.user);
  const online = useStore(app, (s) => s.online);
  const [q, setQ] = useState('');
  useEffect(() => { if (route.parts[0] === 'search') setQ(decodeURIComponent(route.parts[1] || '')); }, [route.path]);
  useEffect(() => {
    if (route.parts[0] !== 'search' && !q) return undefined;
    const id = setTimeout(() => { if (q.trim() && decodeURIComponent(route.parts[1] || '') !== q.trim()) nav(`/search/${encodeURIComponent(q.trim())}`, route.parts[0] === 'search'); }, 450);
    return () => clearTimeout(id);
  }, [q]);
  return html`<header class="topbar">
    <div class="nav-btns">
      <${IconBtn} icon="left" label=${t('Back')} onClick=${() => history.back()} />
      <${IconBtn} icon="right" label=${t('Forward')} onClick=${() => history.forward()} />
    </div>
    <div class="top-search"><${SearchBox} value=${q} onInput=${(v) => { setQ(v); if (!v && route.parts[0] === 'search') nav('/search', true); }} /></div>
    <div class="top-right">
      ${!online ? html`<span class="pill warn"><${Icon} name="offline" size=${14} /> ${t('Offline')}</span>` : null}
      <button class="top-mic" onClick=${() => { ui.set({ voice: true }); startListening(); }} aria-label=${t('Voice assistant')}><${Icon} name="mic" size=${20} /><span>${t('Ask Nexora')}</span></button>
      <button class="top-avatar" onClick=${(e) => openMenu(e, [
        { header: user.displayName },
        { icon: 'user', label: t('Settings'), onClick: () => nav('/settings') },
        { icon: 'users', label: t('Friends'), onClick: () => nav('/friends') },
        { icon: 'download', label: t('Install app'), onClick: () => nav('/settings/install') },
        isAdmin() ? { icon: 'shield', label: `${t('Owner console')}${app.get().pending ? ` (${app.get().pending} ${t('waiting')})` : ''}`, onClick: () => nav('/admin') } : null,
        { sep: true },
        { icon: 'logout', label: t('Sign out'), danger: true, onClick: () => window.dispatchEvent(new Event('nexora:logout')) },
      ])} aria-label=${t('Account')}><${Avatar} user=${user} size=${32} /></button>
    </div>
  </header>`;
}

export function TabBar({ route }) {
  // phone navigation: Home, Search, Library, Playlists (Browse lives on the Search page; settings behind your avatar)
  const [p0, p1] = route.parts;
  const here = p0 === 'playlist' || (p0 === 'library' && p1 === 'playlists') ? 'playlists' : p0 === 'browse' || p0 === 'charts' || p0 === 'lang' || p0 === 'mood' || p0 === 'genre' || p0 === 'catalog' ? 'search' : p0;
  const tabs = [['home', '/home', 'home', 'Home'], ['search', '/search', 'search', 'Search'], ['library', '/library/liked', 'library', 'Library'], ['playlists', '/library/playlists', 'list', 'Playlists']];
  return html`<nav class="tabbar">${tabs.map(([k, to, i, l]) => html`<a href=${`#${to}`} class=${cx(here === k && 'active')}><${Icon} name=${i} size=${24} /><span>${t(l)}</span></a>`)}</nav>`;
}

export function ModalHost() {
  const m = useStore(ui, (s) => s.modal);
  if (!m) return null;
  const close = () => ui.set({ modal: null });
  if (m.kind === 'addToPlaylist') return html`<${AddToPlaylist} tracks=${m.tracks} onClose=${close} />`;
  return null;
}

// ------------------------------------------------------------------ voice assistant overlay
export function VoiceOverlay({ route }) {
  const open = useStore(ui, (s) => s.voice);
  const v = useStore(voice);
  const [text, setText] = useState('');
  const input = useRef();
  useEffect(() => { if (route.parts[0] === 'voice') { ui.set({ voice: true }); startListening(); nav('/home', true); } }, [route.path]);
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => e.key === 'Escape' && close();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [open]);
  if (!open) return null;
  const close = () => { stopListening(); ui.set({ voice: false }); };
  const submit = async (e) => { e.preventDefault(); const x = text.trim(); if (!x) return; setText(''); await runText(x); };
  const r = v.result;
  const nf = r?.notFound ? encodeURIComponent(r.notFound) : null;
  return html`<div class="voice" role="dialog" aria-modal="true" aria-label=${t('Voice assistant')}>
    <button class="voice-close iconbtn" onClick=${close} aria-label=${t('Close')}><${Icon} name="x" size=${26} /></button>
    <div class="voice-main">
      <button class=${cx('orb', v.listening && 'live', v.busy && 'busy')} onClick=${() => (v.listening ? stopListening() : startListening())} aria-label=${v.listening ? t('Stop listening') : t('Start listening')} disabled=${!voiceSupported}>
        <i></i><i></i><i></i><${Icon} name="mic" size=${46} />
      </button>
      <h2 class="voice-status">${v.listening ? t('Listening…') : v.busy ? t('Working on it…') : voiceSupported ? t('Tap the mic and speak') : t('Type a command below')}</h2>
      <p class="voice-heard">${v.interim || v.heard || ''}</p>
      ${v.error ? html`<div class="alert">${v.error}</div>` : null}
      ${r ? html`<div class=${cx('voice-result', r.ok ? 'ok' : 'bad')}><${Icon} name=${r.ok ? 'check' : 'info'} size=${20} /> <span>${r.say}</span></div>` : null}
      ${nf ? html`<div class="row gap wrap center"><a class="btn ghost sm" target="_blank" rel="noopener" href=${`https://music.apple.com/search?term=${nf}`}>Apple Music</a><a class="btn ghost sm" target="_blank" rel="noopener" href=${`https://music.youtube.com/search?q=${nf}`}>YouTube Music</a><a class="btn ghost sm" target="_blank" rel="noopener" href=${`https://open.spotify.com/search/${nf}`}>Spotify</a><button class="btn ghost sm" onClick=${() => { close(); nav(`/search/${nf}`); }}>${t('Search Nexora')}</button></div>` : null}
      <form class="voice-type" onSubmit=${submit}>
        <${Icon} name="keyboard" size=${18} /><input ref=${input} class="input" value=${text} onInput=${(e) => setText(e.target.value)} placeholder=${t('Or type: “play something relaxing”')} />
        <button class="btn primary sm" type="submit" disabled=${!text.trim()}>${t('Go')}</button>
      </form>
      <div class="chips center">${EXAMPLES.map((x) => html`<button class="chip" onClick=${() => runText(x)}>${x}</button>`)}</div>
      ${v.history.length > 1 ? html`<div class="voice-hist">${v.history.slice(1, 5).map((h) => html`<div><small>“${h.text}”</small> → ${h.say}</div>`)}</div>` : null}
      <p class="tiny muted">${t('Say “Hey Nexora” followed by what you want, in any language you choose in Settings → Voice.')}</p>
    </div>
  </div>`;
}
