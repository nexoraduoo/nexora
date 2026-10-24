// Your library: playlists, liked songs, saved albums/artists/stations, downloads, uploads, history, import.
import { html, cx, useState, useEffect, useRef, useStore, useAsync, fmtBytes } from '../lib.js';
import { Icon } from '../icons.js';
import { app, lib, nav, toast, ui } from '../state.js';
import { ctl } from '../ctl.js';
import { Card, TrackList, Empty, Modal, Spinner, goAlbum, goArtist } from '../ui.js';
import * as offline from '../offline.js';
import * as cat from '../catalog.js';
import { get, del } from '../api.js';
import { createPlaylist } from '../library.js';
import { uploadFile, playLocalFiles, AUDIO_ACCEPT } from '../uploads.js';
import { fromItunes, bestMatch, score } from '../shared/sources.js';
import { t, nSongs } from '../i18n.js';
import { sleep } from '../lib.js';
import { FilteredList } from './filters.js';

const TABS = [['playlists', 'Playlists'], ['liked', 'Liked Songs'], ['albums', 'Albums'], ['artists', 'Artists'], ['stations', 'Radio'], ['podcasts', 'Podcasts'], ['downloads', 'Downloads'], ['recent', 'Recent'], ['uploads', 'My files']];

function PlayAll({ tracks, context }) {
  const ok = tracks.filter((x) => x.url || x.source === 'mb' || lib.get().downloads.has(x.id));
  if (!ok.length) return null;
  return html`<div class="row gap pad-x"><button class="btn primary" onClick=${() => ctl.playTracks(ok, 0, { context })}><${Icon} name="play" size=${18} /> ${t('Play')}</button>
    <button class="btn ghost" onClick=${() => ctl.playTracks(ok, 0, { context, shuffle: true })}><${Icon} name="shuffle" size=${18} /> ${t('Shuffle')}</button>
    <span class="muted">${nSongs(ok.length)}</span></div>`;
}

function NewPlaylist({ onClose }) {
  const [name, setName] = useState('');
  return html`<${Modal} title=${t('New playlist')} onClose=${onClose}>
    <form class="row-form" onSubmit=${async (e) => { e.preventDefault(); if (!name.trim()) return; const id = await createPlaylist(name.trim()); onClose(); nav(`/playlist/${id}`); }}>
      <input class="input" placeholder=${t('Playlist name')} value=${name} onInput=${(e) => setName(e.target.value)} maxlength="80" autofocus />
      <button class="btn primary" type="submit" disabled=${!name.trim()}>${t('Create')}</button>
    </form>
  <//>`;
}

function Uploads() {
  const cfg = useStore(app, (s) => s.config);
  const d = useAsync(() => get('/api/uploads'), []);
  const [prog, setProg] = useState(null);
  const input = useRef();
  const local = useRef();
  const upload = async (files) => {
    for (const f of files) {
      setProg({ name: f.name, pct: 0 });
      try { await uploadFile(f, (pct) => setProg({ name: f.name, pct })); toast(`${t('Uploaded')} ${f.name}`, { kind: 'ok' }); } catch (e) { toast(e.message, { kind: 'error' }); }
    }
    setProg(null); d.reload();
  };
  const tracks = d.data?.uploads.map((u) => u.track).filter(Boolean) || [];
  return html`<div>
    <div class="row gap pad-x wrap">
      <input ref=${local} type="file" accept=${AUDIO_ACCEPT} multiple hidden onChange=${(e) => { playLocalFiles(e.target.files); e.target.value = ''; }} />
      <button class="btn primary" onClick=${() => local.current.click()}><${Icon} name="folder" size=${18} /> ${t('Play files from this device')}</button>
      ${cfg.locker ? html`<input ref=${input} type="file" accept=${AUDIO_ACCEPT} multiple hidden onChange=${(e) => { upload([...e.target.files]); e.target.value = ''; }} />
        <button class="btn ghost" onClick=${() => input.current.click()}><${Icon} name="upload" size=${18} /> ${t('Upload to my cloud locker')}</button>` : null}
    </div>
    <p class="muted tiny pad-x">${t('Only upload music you own or have the right to use. Files in your locker are private to you.')}</p>
    ${!cfg.locker ? html`<div class="note-card"><${Icon} name="info" size=${18} /><div><b>${t('Cloud locker is not switched on')}</b><p>${t('You can still play any file from this device. To keep a private library in the cloud, the owner turns on Cloudflare R2 storage (free up to 10 GB). See the README.')}</p></div></div>` : null}
    ${prog ? html`<div class="uploading"><${Spinner} size=${16} /> ${prog.name} · ${prog.pct}%<div class="bar"><i style=${`width:${prog.pct}%`}></i></div></div>` : null}
    ${d.data && cfg.locker ? html`<p class="muted tiny pad-x">${fmtBytes(d.data.used)} ${t('of')} ${fmtBytes(d.data.quota)} ${t('used')}</p>` : null}
    ${tracks.length ? html`<${PlayAll} tracks=${tracks} context=${t('My files')} />
      <${TrackList} tracks=${tracks} context=${t('My files')} />
      <div class="pad-x"><button class="link danger" onClick=${async () => { if (!confirm(t('Delete all of your uploaded files?'))) return; for (const u of d.data.uploads) await del(`/api/uploads/${u.uploadId}`).catch(() => {}); d.reload(); }}>${t('Delete all uploads')}</button></div>` : null}
  </div>`;
}

function Downloads() {
  const dl = useStore(lib, (s) => s.downloads);
  const active = useStore(offline.dl, (s) => s.active);
  const tracks = [...dl.values()].sort((a, b) => b.at - a.at).map((d) => d.track);
  return html`<div>
    <p class="muted pad-x"><${Icon} name="offline" size=${14} /> ${t('These songs play with no internet connection.')} ${fmtBytes(offline.totalBytes())} ${t('on this device')}.</p>
    ${Object.entries(active).map(([id, pct]) => html`<div class="uploading"><${Spinner} size=${16} /> ${t('Downloading')}… ${pct}%<div class="bar"><i style=${`width:${pct}%`}></i></div></div>`)}
    ${tracks.length ? html`<${PlayAll} tracks=${tracks} context=${t('Downloads')} /><${FilteredList} tracks=${tracks}>${(shown) => html`<${TrackList} tracks=${shown} context=${t('Downloads')} />`}<//>
      <div class="pad-x"><button class="link danger" onClick=${() => confirm(t('Remove all downloads from this device?')) && offline.clearAll()}>${t('Remove all downloads')}</button></div>`
      : html`<${Empty} icon="download" title=${t('No downloads yet')} text=${t('Open the ⋯ menu on a song and choose “Download for offline”. Previews and live radio cannot be downloaded.')} />`}
  </div>`;
}

export function LibraryView({ route }) {
  const tab = route.parts[1] || 'playlists';
  const s = useStore(lib, (x) => x);
  const [newPl, setNewPl] = useState(false);
  const body = () => {
    if (tab === 'playlists') return html`<div>
      <div class="row gap pad-x wrap"><button class="btn primary" onClick=${() => setNewPl(true)}><${Icon} name="plus" size=${18} /> ${t('New playlist')}</button><button class="btn ghost" onClick=${() => nav('/import')}><${Icon} name="upload" size=${18} /> ${t('Import a playlist')}</button></div>
      <div class="grid">
        <${Card} item=${{ title: t('Liked Songs'), artwork: null, kind: 'liked' }} sub=${`${nSongs(s.liked.length)}`} onClick=${() => nav('/library/liked')} />
        ${s.playlists.map((p) => html`<${Card} key=${p.id} item=${{ title: p.name, artwork: p.cover }} sub=${`${p.mine ? '' : `${p.ownerName} · `}${nSongs(p.count)}`} onClick=${() => nav(`/playlist/${p.id}`)} />`)}
      </div></div>`;
    if (tab === 'liked') return s.liked.length ? html`<div><${PlayAll} tracks=${s.liked} context=${t('Liked Songs')} /><${FilteredList} tracks=${s.liked}>${(shown) => html`<${TrackList} tracks=${shown} context=${t('Liked Songs')} />`}<//></div>` : html`<${Empty} icon="heart" title=${t('Songs you like will appear here')} text=${t('Tap the heart on any song.')} />`;
    if (tab === 'albums') return s.albums.length ? html`<div class="grid">${s.albums.map((a) => html`<${Card} key=${a.ref} item=${{ ...a, id: a.ref }} onClick=${() => goAlbum({ id: a.ref })} />`)}</div>` : html`<${Empty} icon="disc" title=${t('No saved albums')} text=${t('Open an album and tap the heart to keep it here.')} />`;
    if (tab === 'artists') return s.artists.length ? html`<div class="grid">${s.artists.map((a) => html`<${Card} key=${a.ref} round item=${{ ...a, id: a.ref }} sub=${t('Artist')} onClick=${() => goArtist({ id: a.ref })} />`)}</div>` : html`<${Empty} icon="user" title=${t('Not following any artists')} />`;
    if (tab === 'stations') return s.stations.length ? html`<div class="grid">${s.stations.map((a) => html`<${Card} key=${a.ref} item=${{ ...a, id: a.ref, kind: 'radio' }} sub=${t('Live radio')} onClick=${() => ctl.playTracks(s.stations.map((x) => ({ id: x.ref, source: 'radio', kind: 'radio', title: x.title, artist: x.artist || '', album: 'Live radio', duration: 0, artwork: x.artwork, url: x.url })), s.stations.indexOf(a), { context: t('Live radio') })} />`)}</div>` : html`<${Empty} icon="radio" title=${t('No saved stations')} text=${t('Save a station from its ⋯ menu.')}><button class="btn" onClick=${() => nav('/radio')}>${t('Find radio stations')}</button><//>`;
    if (tab === 'podcasts') return s.podcasts.length ? html`<div class="grid">${s.podcasts.map((p) => html`<${Card} key=${p.ref} item=${{ ...p, id: p.ref }} sub=${p.artist} onClick=${() => nav(`/podcast/${String(p.ref).replace('itunes:', '')}`)} />`)}</div>` : html`<${Empty} icon="podcast" title=${t('No podcasts followed')} text=${t('Follow a show to keep it here.')}><button class="btn" onClick=${() => nav('/podcasts')}>${t('Find podcasts')}</button><//>`;
    if (tab === 'downloads') return html`<${Downloads} />`;
    if (tab === 'recent') return s.history.length ? html`<div><${PlayAll} tracks=${s.history} context=${t('Recently played')} /><${FilteredList} tracks=${s.history}>${(shown) => html`<${TrackList} tracks=${shown} context=${t('Recently played')} />`}<//></div>` : html`<${Empty} icon="clock" title=${t('Nothing played yet')} />`;
    if (tab === 'uploads') return html`<${Uploads} />`;
    return null;
  };
  return html`<div class="view-pad">
    <h1 class="page-title">${t('Your Library')}</h1>
    <div class="tabs scroll">${TABS.map(([k, l]) => html`<button class=${cx('tab', tab === k && 'on')} onClick=${() => nav(`/library/${k}`)}>${t(l)}${k === 'liked' ? ` · ${s.liked.length}` : k === 'downloads' && s.downloads.size ? ` · ${s.downloads.size}` : ''}</button>`)}</div>
    ${body()}
    ${newPl ? html`<${NewPlaylist} onClose=${() => setNewPl(false)} />` : null}
  </div>`;
}

// ------------------------------------------------------------------ import a playlist from another service
function parseLines(text) {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!rows.length) return [];
  // CSV exports (Exportify, TuneMyMusic, Apple Music...) have a header with track / artist columns
  const first = rows[0];
  if (first.includes(',') && /track|title|song|name/i.test(first) && /artist/i.test(first)) {
    const split = (line) => { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
    const head = split(first).map((h) => h.toLowerCase());
    const ti = head.findIndex((h) => /^(track name|track|title|song|name)/.test(h));
    const ai = head.findIndex((h) => /artist/.test(h));
    return rows.slice(1).map((r) => { const c = split(r); return `${c[ti] || ''} ${(c[ai] || '').split(/[;,]/)[0]}`.trim(); }).filter(Boolean);
  }
  return rows.filter((l) => !l.startsWith('#')).map((l) => l.replace(/^\d+[.)]\s*/, '').replace(/\s+-\s+/g, ' ').replace(/\s{2,}/g, ' ')).filter(Boolean);
}

export function ImportView() {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [yt, setYt] = useState('');
  const [ytBusy, setYtBusy] = useState(false);
  const [state, setState] = useState(null); // { done, total, found, missed }
  const run = useRef({ cancel: false });
  const file = useRef();
  const lines = parseLines(text).slice(0, 300);
  const start = async () => {
    run.current.cancel = false;
    const found = [], missed = [];
    setState({ done: 0, total: lines.length, found, missed });
    for (let i = 0; i < lines.length; i++) {
      if (run.current.cancel) break;
      const q = lines[i];
      try {
        const [it, au] = await Promise.all([
          cat.S.itunesSearch(q, { country: 'US', limit: 6 }).then((r) => r.map(fromItunes).filter(Boolean)).catch(() => []),
          cat.S.audiusSearch(q, { limit: 5 }).catch(() => []),
        ]);
        const pool = [...au.filter((x) => score(q, x) >= 0.8), ...it];
        const best = bestMatch(q, pool);
        if (best && score(q, best) >= 0.55) found.push(best); else missed.push(q);
      } catch { missed.push(q); }
      setState({ done: i + 1, total: lines.length, found: [...found], missed: [...missed] });
      await sleep(3300); // stay under Apple's ~20 requests/minute allowance
    }
  };
  const save = async () => {
    const id = await createPlaylist(name.trim() || t('Imported playlist'), state.found);
    toast(`${t('Created playlist with')} ${nSongs(state.found.length)}`, { kind: 'ok' });
    nav(`/playlist/${id}`);
  };
  useEffect(() => () => { run.current.cancel = true; }, []);
  const running = state && state.done < state.total && !run.current.cancel;
  return html`<div class="view-pad narrow">
    <h1 class="page-title">${t('Import a playlist')}</h1>
    <p class="muted">${t('Bring your playlists from Spotify, Apple Music, YouTube Music or anywhere. Export them as a CSV/text list with a free tool such as Exportify or TuneMyMusic, then paste or upload the list here. Nexora finds each song in its own catalogue.')}</p>
    ${app.get().config.youtube ? html`<label class="field"><span>${t('YouTube / YouTube Music playlist link')}</span>
      <div class="row-form"><input class="input" value=${yt} onInput=${(e) => setYt(e.target.value)} placeholder="https://music.youtube.com/playlist?list=..." />
        <button class="btn" disabled=${!yt.trim() || ytBusy} onClick=${async () => { setYtBusy(true); try { const r = await get(`/api/yt/playlist?url=${encodeURIComponent(yt.trim())}`); setText(r.lines.join('\n')); if (!name && r.title) setName(r.title); toast(`${r.lines.length} ${t('songs found in that playlist')}`, { kind: 'ok' }); } catch (e) { toast(e.message, { kind: 'error' }); } finally { setYtBusy(false); } }}>${ytBusy ? html`<${Spinner} size=${16} />` : null} ${t('Fetch')}</button></div></label>` : null}
    <label class="field"><span>${t('Playlist name')}</span><input class="input" value=${name} onInput=${(e) => setName(e.target.value)} placeholder=${t('My gym mix')} /></label>
    <label class="field"><span>${t('Songs, one per line (Title - Artist) or a CSV file')}</span>
      <textarea class="input" rows="9" value=${text} onInput=${(e) => setText(e.target.value)} placeholder=${'Blinding Lights - The Weeknd\nTum Hi Ho - Arijit Singh\nNaatu Naatu - Rahul Sipligunj'}></textarea></label>
    <div class="row gap wrap">
      <input ref=${file} type="file" accept=".csv,.txt,.m3u,.m3u8,text/*" hidden onChange=${async (e) => { const f = e.target.files[0]; if (f) setText(await f.text()); e.target.value = ''; }} />
      <button class="btn ghost" onClick=${() => file.current.click()}><${Icon} name="upload" size=${18} /> ${t('Choose a file')}</button>
      <button class="btn primary" disabled=${!lines.length || running} onClick=${start}>${running ? html`<${Spinner} size=${16} />` : null} ${t('Find these songs')} (${lines.length})</button>
      ${running ? html`<button class="btn ghost" onClick=${() => { run.current.cancel = true; setState((s) => ({ ...s })); }}>${t('Stop')}</button>` : null}
    </div>
    <p class="muted tiny">${t('To respect free-service limits, matching runs at about 18 songs a minute. You can leave this page open while it works.')}</p>
    ${state ? html`<div class="import-status">
      <div class="bar"><i style=${`width:${(state.done / Math.max(1, state.total)) * 100}%`}></i></div>
      <p><b>${state.found.length}</b> ${t('found')} · <b>${state.missed.length}</b> ${t('not found')} · ${state.done}/${state.total}</p>
      ${state.found.length ? html`<button class="btn primary" onClick=${save} disabled=${running}><${Icon} name="check" size=${18} /> ${t('Create playlist')} (${state.found.length})</button>` : null}
      ${state.missed.length ? html`<details><summary>${t('Songs I could not find')}</summary><ul class="missed">${state.missed.map((m) => html`<li>${m}</li>`)}</ul><p class="muted tiny">${t('These may only exist on paid services. Upload your own copy to My files if you have it.')}</p></details>` : null}
    </div>` : null}
  </div>`;
}
