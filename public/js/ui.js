// Reusable UI components.
import { html, cx, fmtTime, useState, useEffect, useRef, useStore, useCallback } from './lib.js';
import { Icon } from './icons.js';
import { app, player, lib, ui, nav, toast } from './state.js';
import { ctl } from './ctl.js';
import { artSize } from './shared/sources.js';
import { isLiked, toggleLike, addToPlaylist, createPlaylist, saveItem, isSaved } from './library.js';
import * as offline from './offline.js';
import { engine } from './player.js';
import * as cat from './catalog.js';
import { t, nSongs } from './i18n.js';

// ------------------------------------------------------------------ artwork
const hueOf = (s = '') => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };

export function Cover({ src, size = 300, title = '', round = false, class: cls = '', icon = 'music' }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  const url = src && !bad ? artSize(src, size) : null;
  const h = hueOf(title);
  return html`<div class=${cx('cover', round && 'round', cls)} style=${url ? '' : `--h:${h}`}>
    ${url
      ? html`<img src=${url} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onError=${() => setBad(true)} />`
      : html`<div class="cover-fallback"><${Icon} name=${icon} size=${Math.max(18, Math.min(40, size / 6))} /></div>`}
  </div>`;
}

export function Avatar({ user, size = 36 }) {
  const name = user?.displayName || user?.username || '?';
  return html`<span class="avatar" style=${`--h:${user?.hue ?? hueOf(name)};width:${size}px;height:${size}px;font-size:${size * 0.42}px`}>${[...name][0]?.toUpperCase()}</span>`;
}

export function Badge({ children, kind = '' }) { return html`<span class=${cx('badge', kind)}>${children}</span>`; }

export function trackBadges(tr) {
  const out = [];
  if (tr.kind === 'radio') out.push(html`<${Badge} kind="live">LIVE<//>`);
  else if (tr.source === 'mb' && !tr.url) out.push(html`<${Badge} kind="preview" title=${t('Listing: audio is found when you press play')}>${tr.isrc ? 'ISRC' : t('Listing')}<//>`);
  else if (tr.preview) out.push(html`<${Badge} kind="preview" title="30-second preview">${t('Preview')}<//>`);
  if (tr.meta?.explicit) out.push(html`<${Badge} kind="e">E<//>`);
  if (lib.get().downloads.has(tr.id)) out.push(html`<${Badge} kind="off"><${Icon} name="check" size=${11} stroke=${3} /> ${t('Offline')}<//>`);
  return out;
}

// ------------------------------------------------------------------ small controls
export function IconBtn({ icon, label, onClick, active, size = 22, class: cls = '', disabled, fill, badge }) {
  return html`<button class=${cx('iconbtn', active && 'on', cls)} onClick=${onClick} aria-label=${label} title=${label} disabled=${disabled}>
    <${Icon} name=${icon} size=${size} fill=${fill} />${badge ? html`<i class="dot"></i>` : null}
  </button>`;
}

export function Slider({ value, max, onCommit, onLive, class: cls = '', label, step = 'any', disabled, buffered }) {
  const [drag, setDrag] = useState(null);
  const v = drag ?? value;
  const pct = max > 0 ? Math.min(100, Math.max(0, (v / max) * 100)) : 0;
  return html`<div class=${cx('slider', cls)} style=${`--p:${pct}%;--b:${max > 0 && buffered ? Math.min(100, (buffered / max) * 100) : 0}%`}>
    <input type="range" min="0" max=${max || 1} step=${step} value=${v} aria-label=${label} disabled=${disabled}
      onInput=${(e) => { const n = Number(e.target.value); setDrag(n); onLive?.(n); }}
      onChange=${(e) => { onCommit?.(Number(e.target.value)); setDrag(null); }} />
  </div>`;
}

export function Spinner({ size = 22 }) { return html`<span class="spinner" style=${`width:${size}px;height:${size}px`}></span>`; }

export function Empty({ icon = 'music', title, text, children }) {
  return html`<div class="empty"><div class="empty-ic"><${Icon} name=${icon} size=${34} /></div><h3>${title}</h3>${text ? html`<p>${text}</p>` : null}${children}</div>`;
}

export function Skeleton({ rows = 6, cards = false }) {
  if (cards) return html`<div class="shelf-row">${Array.from({ length: 8 }, () => html`<div class="card sk"><div class="cover skeleton"></div><div class="skeleton line"></div><div class="skeleton line short"></div></div>`)}</div>`;
  return html`<div class="tracks">${Array.from({ length: rows }, () => html`<div class="track sk"><div class="cover skeleton"></div><div><div class="skeleton line"></div><div class="skeleton line short"></div></div></div>`)}</div>`;
}

export function ErrorBox({ error, retry }) {
  const offline = error?.code === 'offline' || !navigator.onLine;
  return html`<${Empty} icon=${offline ? 'offline' : 'info'} title=${offline ? t("You're offline") : t('Something went wrong')} text=${error?.message || ''}>
    ${retry ? html`<button class="btn" onClick=${retry}>${t('Try again')}</button>` : null}
    ${offline ? html`<button class="btn ghost" onClick=${() => nav('/library/downloads')}>${t('Open downloads')}</button>` : null}
  <//>`;
}

// ------------------------------------------------------------------ menus + modals
export function openMenu(e, items) {
  e?.stopPropagation?.();
  e?.preventDefault?.();
  const r = e?.currentTarget?.getBoundingClientRect?.();
  const x = e?.clientX && e.type === 'contextmenu' ? e.clientX : r ? r.right : innerWidth / 2;
  const y = e?.clientY && e.type === 'contextmenu' ? e.clientY : r ? r.bottom : innerHeight / 2;
  ui.set({ menu: { x, y, items: items.filter(Boolean) } });
}

export function MenuHost() {
  const { menu } = useStore(ui, (s) => ({ menu: s.menu }));
  const ref = useRef();
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!menu) { setPos(null); return undefined; }
    const close = () => ui.set({ menu: null });
    const onKey = (e) => e.key === 'Escape' && close();
    const t0 = setTimeout(() => { addEventListener('click', close); addEventListener('contextmenu', close); addEventListener('scroll', close, true); }, 0);
    addEventListener('keydown', onKey);
    addEventListener('resize', close);
    return () => { clearTimeout(t0); removeEventListener('click', close); removeEventListener('contextmenu', close); removeEventListener('scroll', close, true); removeEventListener('keydown', onKey); removeEventListener('resize', close); };
  }, [menu]);
  useEffect(() => {
    if (!menu || !ref.current) return;
    const b = ref.current.getBoundingClientRect();
    const mobile = innerWidth < 700;
    if (mobile) { setPos({ sheet: true }); return; }
    setPos({ left: Math.max(8, Math.min(menu.x - b.width + (menu.x > innerWidth - 40 ? 0 : 0), innerWidth - b.width - 8)), top: Math.max(8, Math.min(menu.y + 4, innerHeight - b.height - 8)) });
  }, [menu]);
  if (!menu) return null;
  return html`<div class=${cx('menu-layer', pos?.sheet && 'sheet')}>
    <div class="menu" ref=${ref} role="menu" style=${pos && !pos.sheet ? `left:${pos.left}px;top:${pos.top}px` : pos ? '' : `left:${menu.x}px;top:${menu.y}px;visibility:hidden`}>
      ${menu.items.map((it) => it.sep
        ? html`<hr />`
        : it.header
          ? html`<div class="menu-head">${it.header}</div>`
          : html`<button role="menuitem" class=${cx('menu-item', it.danger && 'danger')} disabled=${it.disabled} onClick=${(e) => { e.stopPropagation(); ui.set({ menu: null }); it.onClick?.(); }}>
              ${it.icon ? html`<${Icon} name=${it.icon} size=${18} />` : html`<span class="ic-pad"></span>`}<span>${it.label}</span>${it.hint ? html`<small>${it.hint}</small>` : null}
            </button>`)}
    </div>
  </div>`;
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  return html`<div class="modal-back" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class=${cx('modal', wide && 'wide')} role="dialog" aria-modal="true" aria-label=${title}>
      <div class="modal-head"><h3>${title}</h3><${IconBtn} icon="x" label=${t('Close')} onClick=${onClose} /></div>
      <div class="modal-body">${children}</div>
    </div>
  </div>`;
}

export function ToastHost() {
  const { toast: tt } = useStore(app, (s) => ({ toast: s.toast }));
  if (!tt) return null;
  return html`<div class=${cx('toast', tt.kind)} role="status" key=${tt.id}>
    <span>${tt.text}</span>
    ${tt.action ? html`<button onClick=${() => { tt.action.fn(); app.set({ toast: null }); }}>${tt.action.label}</button>` : null}
  </div>`;
}

// ------------------------------------------------------------------ playlist picker
export function AddToPlaylist({ tracks, onClose }) {
  const { playlists } = useStore(lib, (s) => ({ playlists: s.playlists }));
  const [name, setName] = useState('');
  const mine = playlists.filter((p) => p.mine || p.collab);
  const add = async (p) => {
    try { await addToPlaylist(p.id, tracks); toast(`${t('Added to')} ${p.name}`, { kind: 'ok' }); onClose(); } catch (e) { toast(e.message, { kind: 'error' }); }
  };
  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try { await createPlaylist(name.trim(), tracks); toast(`${t('Created')} ${name.trim()}`, { kind: 'ok' }); onClose(); } catch (err) { toast(err.message, { kind: 'error' }); }
  };
  return html`<${Modal} title=${t('Add to playlist')} onClose=${onClose}>
    <form class="row-form" onSubmit=${create}>
      <input class="input" placeholder=${t('New playlist name')} value=${name} onInput=${(e) => setName(e.target.value)} maxlength="80" autofocus />
      <button class="btn primary" type="submit" disabled=${!name.trim()}>${t('Create')}</button>
    </form>
    <div class="pick-list">
      ${mine.map((p) => html`<button class="pick" onClick=${() => add(p)}><${Cover} src=${p.cover} size=96 title=${p.name} icon="list" /><span><b>${p.name}</b><small>${nSongs(p.count)}</small></span></button>`)}
      ${!mine.length ? html`<p class="muted">${t('No playlists yet. Name one above to create it.')}</p>` : null}
    </div>
  <//>`;
}

export const askPlaylist = (tracks) => ui.set({ modal: { kind: 'addToPlaylist', tracks: Array.isArray(tracks) ? tracks : [tracks] } });

// ------------------------------------------------------------------ track actions
export function trackMenu(track, { index, inPlaylist, onRemove } = {}) {
  const liked = isLiked(track.id);
  const saved = lib.get().downloads.has(track.id);
  const can = offline.canDownload(track);
  const artist = track.meta?.artistId;
  const album = track.meta?.albumId;
  const external = track.ext;
  const q = encodeURIComponent(`${track.title} ${track.artist}`.trim());
  if (track.source === 'local') {
    return [{ header: track.title }, { icon: 'play', label: t('Play next'), onClick: () => ctl.queueNext(track) }, { icon: 'queue', label: t('Add to queue'), onClick: () => ctl.queueAdd(track) }];
  }
  return [
    { header: track.title },
    ...(track.isrc ? [{ icon: 'link', label: `ISRC ${track.isrc}`, hint: t('Copy'), onClick: () => { navigator.clipboard?.writeText(track.isrc).then(() => toast(t('ISRC copied'), { kind: 'ok' })).catch(() => {}); } }] : []),
    track.preview && track.kind !== 'radio' && app.get().config.youtube ? { icon: 'play', label: t('Play full song (YouTube)'), onClick: () => engine.playFullOnYouTube(track) } : null,
    { icon: 'play', label: t('Play next'), onClick: () => ctl.queueNext(track) },
    { icon: 'queue', label: t('Add to queue'), onClick: () => ctl.queueAdd(track) },
    { sep: true },
    { icon: 'heart', label: liked ? t('Remove from Liked Songs') : t('Add to Liked Songs'), onClick: () => toggleLike(track) },
    track.kind === 'radio' ? { icon: 'radio', label: isSaved('station', track.id) ? t('Remove station') : t('Save station'), onClick: () => saveItem('station', { ...track, ref: track.id }) } : { icon: 'plus', label: t('Add to playlist…'), onClick: () => askPlaylist(track) },
    inPlaylist && onRemove ? { icon: 'trash', label: t('Remove from this playlist'), onClick: onRemove, danger: true } : null,
    { sep: true },
    can ? (saved
      ? { icon: 'check', label: t('Remove download'), onClick: () => offline.remove(track.id) }
      : { icon: 'download', label: t('Download for offline'), onClick: () => offline.save(track) }) : null,
    can ? { icon: 'download', label: t('Save as MP3 file'), onClick: () => offline.exportFile(track) } : null,
    track.kind !== 'radio' ? { icon: 'sparkle', label: t('Start song radio'), onClick: async () => { const more = await cat.similarTo(track, []); ctl.playTracks([track, ...more], 0, { context: `${track.title} radio` }); } } : null,
    { sep: true },
    artist ? { icon: 'user', label: t('Go to artist'), onClick: () => nav(`/artist/${artist.split(':')[0]}/${encodeURIComponent(artist.split(':')[1])}`) } : null,
    album ? { icon: 'disc', label: t('Go to album'), onClick: () => nav(`/album/${album.split(':')[0]}/${encodeURIComponent(album.split(':').slice(1).join(':'))}`) } : null,
    external ? { icon: 'external', label: t('Open original page'), onClick: () => window.open(external, '_blank', 'noopener') } : null,
    track.preview ? { icon: 'search', label: t('Find the full song on…'), hint: 'Apple Music', onClick: () => window.open(`https://music.apple.com/search?term=${q}`, '_blank', 'noopener') } : null,
    track.preview ? { icon: 'search', label: t('Find the full song on…'), hint: 'YouTube Music', onClick: () => window.open(`https://music.youtube.com/search?q=${q}`, '_blank', 'noopener') } : null,
    track.preview ? { icon: 'search', label: t('Find the full song on…'), hint: 'Spotify', onClick: () => window.open(`https://open.spotify.com/search/${q}`, '_blank', 'noopener') } : null,
  ];
}

// ------------------------------------------------------------------ track row + lists
export function Equalizer() { return html`<span class="eqbars" aria-hidden="true"><i></i><i></i><i></i></span>`; }

export function TrackRow({ track, index, list, context, showArt = true, showAlbum = true, inPlaylist, onRemove, number, dragProps }) {
  const cur = useStore(player, (s) => ({ id: s.track?.id, playing: s.playing }));
  const liked = useStore(lib, (s) => s.likedIds.has(track.id));
  const dl = useStore(lib, (s) => s.downloads.has(track.id));
  const here = cur.id === track.id;
  const play = () => {
    if (here) return ctl.toggle();
    ctl.playTracks(list || [track], list ? index : 0, { context });
  };
  const dis = !track.url && !dl && track.source !== 'mb';
  return html`<div class=${cx('track', here && 'current', dis && 'disabled', !showAlbum && 'noalbum')} onDblClick=${play} onContextMenu=${(e) => openMenu(e, trackMenu(track, { index, inPlaylist, onRemove }))} ...${dragProps || {}}>
    <button class="track-play" onClick=${play} aria-label=${here && cur.playing ? t('Pause') : t('Play')}>
      ${here && cur.playing ? html`<${Equalizer} />` : html`<span class="num">${number ?? (index != null ? index + 1 : '')}</span>`}
      <span class="hover-ic"><${Icon} name=${here && cur.playing ? 'pause' : 'play'} size=${16} /></span>
    </button>
    ${showArt ? html`<${Cover} src=${track.artwork} size=96 title=${track.title} class="track-art" icon=${track.kind === 'radio' ? 'radio' : 'music'} />` : null}
    <div class="track-main" onClick=${play}>
      <div class="track-title">${track.title} ${trackBadges(track)}</div>
      <div class="track-sub">${track.artist || ''}${track.meta?.podcast && track.releasedAt ? ` · ${new Date(track.releasedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</div>
    </div>
    ${showAlbum ? html`<div class="track-album">${track.album || ''}</div>` : null}
    <button class=${cx('iconbtn like', liked && 'on')} onClick=${() => toggleLike(track)} aria-label=${t('Like')}><${Icon} name="heart" size=${18} fill=${liked} /></button>
    <div class="track-dur">${track.kind === 'radio' ? '' : fmtTime(track.preview ? track.duration : track.duration)}</div>
    <button class="iconbtn" onClick=${(e) => openMenu(e, trackMenu(track, { index, inPlaylist, onRemove }))} aria-label=${t('More')}><${Icon} name="more" size=${20} /></button>
  </div>`;
}

export function TrackList({ tracks, context, inPlaylist, onRemove, showAlbum = true, limit }) {
  const list = limit ? tracks.slice(0, limit) : tracks;
  return html`<div class="tracks">${list.map((tr, i) => html`<${TrackRow} key=${tr.entry ?? tr.qid ?? `${tr.id}:${i}`} track=${tr} index=${i} list=${tracks} context=${context} inPlaylist=${inPlaylist} showAlbum=${showAlbum} onRemove=${onRemove ? () => onRemove(tr, i) : null} />`)}</div>`;
}

// ------------------------------------------------------------------ cards + shelves
export function Card({ item, onClick, onPlay, round, sub, size = 300 }) {
  return html`<div class=${cx('card', round && 'round')} tabindex="0" role="button" onClick=${onClick}>
    <div class="card-art">
      <${Cover} src=${item.artwork} size=${size} title=${item.title} round=${round} icon=${item.kind === 'radio' ? 'radio' : item.kind === 'artist' ? 'user' : 'music'} />
      ${onPlay ? html`<button class="card-play" onClick=${(e) => { e.stopPropagation(); onPlay(); }} aria-label=${t('Play')}><${Icon} name="play" size=${22} /></button>` : null}
      ${item.preview ? html`<span class="card-tag">${t('Preview')}</span>` : null}
    </div>
    <div class="card-title">${item.title}</div>
    <div class="card-sub">${sub ?? item.artist ?? ''}</div>
  </div>`;
}

export function Shelf({ title, subtitle, children, more, icon }) {
  const row = useRef();
  const scroll = (d) => row.current?.scrollBy({ left: d * row.current.clientWidth * 0.85, behavior: 'smooth' });
  return html`<section class="shelf">
    <div class="shelf-head">
      <div><h2>${icon ? html`<${Icon} name=${icon} size=${20} />` : null}${title}</h2>${subtitle ? html`<p>${subtitle}</p>` : null}</div>
      <div class="shelf-nav">
        ${more ? html`<button class="link" onClick=${more}>${t('Show all')}</button>` : null}
        <button class="iconbtn sm hide-touch" onClick=${() => scroll(-1)} aria-label="Scroll left"><${Icon} name="left" size=${18} /></button>
        <button class="iconbtn sm hide-touch" onClick=${() => scroll(1)} aria-label="Scroll right"><${Icon} name="right" size=${18} /></button>
      </div>
    </div>
    <div class="shelf-row" ref=${row}>${children}</div>
  </section>`;
}

export function Tile({ title, hue, icon, onClick, sub }) {
  return html`<button class="tile" style=${`--h:${hue}`} onClick=${onClick}><${Icon} name=${icon || 'music'} size=${26} /><b>${title}</b>${sub ? html`<small>${sub}</small>` : null}</button>`;
}

// ------------------------------------------------------------------ navigation helpers
export const goArtist = (item) => nav(`/artist/${item.id.split(':')[0]}/${encodeURIComponent(item.id.split(':').slice(1).join(':'))}`);
export const goAlbum = (item) => nav(`/album/${item.id.split(':')[0]}/${encodeURIComponent(item.id.split(':').slice(1).join(':'))}`);

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

export { engine, useCallback };
