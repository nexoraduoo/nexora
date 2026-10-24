// Playlist, album and artist pages.
import { html, cx, useState, useEffect, useStore, useAsync, fmtDuration, dominantColour } from '../lib.js';
import { Icon } from '../icons.js';
import { app, lib, nav, toast, ui } from '../state.js';
import { ctl } from '../ctl.js';
import { FilteredList } from './filters.js';
import { Cover, TrackList, TrackRow, Card, Shelf, Skeleton, Empty, ErrorBox, IconBtn, openMenu, Modal, Avatar } from '../ui.js';
import * as cat from '../catalog.js';
import * as offline from '../offline.js';
import { get, post, patch, del } from '../api.js';
import { refreshPlaylists, saveItem, isSaved } from '../library.js';
import { t, nSongs } from '../i18n.js';
import { goAlbum } from '../ui.js';

function Mosaic({ tracks }) {
  const arts = [...new Set(tracks.map((x) => x.artwork).filter(Boolean))].slice(0, 4);
  if (arts.length < 4) return html`<${Cover} src=${arts[0]} size=400 title="playlist" icon="list" />`;
  return html`<div class="mosaic">${arts.map((a) => html`<${Cover} src=${a} size=200 />`)}</div>`;
}

function Header({ kind, title, sub, art, children, color }) {
  const [col, setCol] = useState(null);
  useEffect(() => { let live = true; dominantColour(color).then((c) => live && setCol(c)); return () => { live = false; }; }, [color]);
  return html`<header class="hero detail" style=${col ? `--c:${col.join(',')}` : ''}>
    <div class="hero-art">${art}</div>
    <div class="hero-text"><small>${kind}</small><h1>${title}</h1><p class="hero-sub">${sub}</p>${children}</div>
  </header>`;
}

function Actions({ tracks, context, extra }) {
  const ok = tracks.filter((x) => x.url || x.source === 'mb' || lib.get().downloads.has(x.id));
  const dlAble = tracks.filter(offline.canDownload);
  const saved = useStore(lib, (s) => dlAble.length > 0 && dlAble.every((x) => s.downloads.has(x.id)));
  const downloadAll = async () => {
    if (saved) { for (const x of dlAble) await offline.remove(x.id); toast(t('Removed downloads'), { ms: 1800 }); return; }
    toast(`${t('Downloading')} ${nSongs(dlAble.length)}…`);
    for (const x of dlAble) await offline.save(x);
  };
  return html`<div class="hero-actions">
    <button class="btn primary big" disabled=${!ok.length} onClick=${() => ctl.playTracks(ok, 0, { context })}><${Icon} name="play" size=${20} /> ${t('Play')}</button>
    <button class="btn ghost big" disabled=${!ok.length} onClick=${() => ctl.playTracks(ok, 0, { context, shuffle: true })}><${Icon} name="shuffle" size=${20} /> ${t('Shuffle')}</button>
    ${dlAble.length ? html`<${IconBtn} icon=${saved ? 'check' : 'download'} label=${saved ? t('Downloaded') : t('Download all')} active=${saved} onClick=${downloadAll} size=${24} />` : null}
    ${extra}
  </div>`;
}

// ------------------------------------------------------------------ playlist
export function PlaylistView({ route }) {
  const id = route.parts[1];
  const token = route.query.token;
  const d = useAsync(() => get(`/api/playlists/${id}${token ? `?token=${encodeURIComponent(token)}` : ''}`), [id]);
  const [share, setShare] = useState(false);
  const [drag, setDrag] = useState(null);
  const user = useStore(app, (s) => s.user);
  if (d.loading) return html`<div class="view-pad"><${Skeleton} rows=${8} /></div>`;
  if (d.error) return html`<div class="view-pad"><${ErrorBox} error=${d.error} retry=${d.reload} /></div>`;
  const { playlist: p, tracks } = d.data;
  const mine = p.mine;
  const total = tracks.reduce((s, x) => s + (x.preview ? 0 : x.duration), 0);
  const remove = async (tr) => { await del(`/api/playlists/${id}/tracks/${tr.entry}${token ? `?token=${token}` : ''}`).catch((e) => toast(e.message, { kind: 'error' })); d.reload(); refreshPlaylists(); };
  const move = async (entry, before) => { await post(`/api/playlists/${id}/move`, { entry, before }).catch((e) => toast(e.message, { kind: 'error' })); d.reload(); };
  const rename = async () => {
    const name = prompt(t('Playlist name'), p.name);
    if (name && name.trim()) { await patch(`/api/playlists/${id}`, { name: name.trim() }); d.reload(); refreshPlaylists(); }
  };
  const destroy = async () => {
    if (!confirm(`${t('Delete')} “${p.name}”?`)) return;
    await del(`/api/playlists/${id}`); await refreshPlaylists(); nav('/library/playlists');
  };
  const saveToLibrary = async () => { await post(`/api/playlists/${id}/save`, { token }); await refreshPlaylists(); toast(t('Saved to your library'), { kind: 'ok' }); };
  const inLib = lib.get().playlists.some((x) => x.id === id);
  const link = `${location.origin}/#/playlist/${id}${p.shareToken ? `?token=${p.shareToken}` : ''}`;

  return html`<div class="view-pad">
    <${Header} kind=${t('Playlist')} title=${p.name} art=${html`<${Mosaic} tracks=${tracks} />`} color=${tracks.find((x) => x.artwork)?.artwork}
      sub=${html`<span class="by"><${Avatar} user=${{ displayName: p.owner.name }} size=${22} /> ${p.owner.name}</span> · ${nSongs(tracks.length)}${total ? `, ${fmtDuration(total)}` : ''}${p.description ? html`<br />${p.description}` : ''}`}>
      <${Actions} tracks=${tracks} context=${p.name} extra=${html`
        ${mine ? html`<${IconBtn} icon="share" label=${t('Share')} onClick=${() => setShare(true)} size=${24} />` : !inLib ? html`<button class="btn ghost" onClick=${saveToLibrary}><${Icon} name="plus" size=${18} /> ${t('Save to my library')}</button>` : null}
        ${mine ? html`<${IconBtn} icon="more" label=${t('More')} size=${24} onClick=${(e) => openMenu(e, [
          { icon: 'edit', label: t('Rename'), onClick: rename },
          { icon: 'search', label: t('Add songs'), onClick: () => nav('/search') },
          { sep: true },
          { icon: 'trash', label: t('Delete playlist'), danger: true, onClick: destroy },
        ])} />` : null}`} />
    <//>
    ${tracks.length
      ? html`<${FilteredList} tracks=${tracks}>${(shown) => html`<div class="tracks">${shown.map((tr, i) => html`<${TrackRow} key=${tr.entry} track=${tr} index=${i} list=${shown} context=${p.name} inPlaylist=${mine || p.collab} onRemove=${mine || tr.addedBy === user?.id ? () => remove(tr) : null}
          dragProps=${mine ? { draggable: true, onDragStart: () => setDrag(tr.entry), onDragOver: (e) => e.preventDefault(), onDrop: () => { if (drag && drag !== tr.entry) move(drag, tr.entry); setDrag(null); } } : null} />`)}</div>`}<//>`
      : html`<${Empty} icon="list" title=${t('This playlist is empty')} text=${t('Find songs and use “Add to playlist” from the ⋯ menu.')}><button class="btn primary" onClick=${() => nav('/search')}>${t('Find songs')}</button><//>`}
    ${share ? html`<${Modal} title=${t('Share playlist')} onClose=${() => setShare(false)}>
      <${ShareBox} playlist=${p} id=${id} link=${link} onChange=${() => { d.reload(); refreshPlaylists(); }} />
    <//>` : null}
  </div>`;
}

function ShareBox({ playlist: p, id, link, onChange }) {
  const [busy, setBusy] = useState(false);
  const act = async (body) => { setBusy(true); try { await patch(`/api/playlists/${id}`, body); onChange(); } catch (e) { toast(e.message, { kind: 'error' }); } finally { setBusy(false); } };
  return html`<div class="share">
    <label class="switch"><input type="checkbox" checked=${!!p.shareToken} disabled=${busy} onChange=${(e) => act({ share: e.target.checked })} /><i></i><span>${t('Anyone in your circle with the link can open it')}</span></label>
    ${p.shareToken ? html`
      <div class="row-form"><input class="input mono" readonly value=${link} onFocus=${(e) => e.target.select()} />
        <button class="btn primary" onClick=${async () => { try { await navigator.clipboard.writeText(link); toast(t('Link copied'), { kind: 'ok' }); } catch { toast(t('Select the link and copy it')); } }}><${Icon} name="link" size=${16} /> ${t('Copy')}</button></div>
      <label class="switch"><input type="checkbox" checked=${p.collab} disabled=${busy} onChange=${(e) => act({ collab: e.target.checked })} /><i></i><span>${t('Collaborative: friends can add songs')}</span></label>
      <label class="switch"><input type="checkbox" checked=${p.isPublic} disabled=${busy} onChange=${(e) => act({ isPublic: e.target.checked })} /><i></i><span>${t('Show on my profile for other members')}</span></label>
      ${navigator.share ? html`<button class="btn ghost" onClick=${() => navigator.share({ title: p.name, url: link }).catch(() => {})}><${Icon} name="share" size=${16} /> ${t('Share…')}</button>` : null}
    ` : html`<p class="muted">${t('Turn this on to get a link you can send to friends who already have a Nexora account.')}</p>`}
  </div>`;
}

// ------------------------------------------------------------------ album
export function AlbumView({ route }) {
  const [src, id] = [route.parts[1], route.parts[2]];
  const d = useAsync(() => cat.loadAlbum(src, id), [src, id]);
  const ref = `${src}:${id}`;
  const saved = useStore(lib, () => isSaved('album', ref));
  if (d.loading) return html`<div class="view-pad"><${Skeleton} rows=${10} /></div>`;
  if (d.error || !d.data) return html`<div class="view-pad"><${ErrorBox} error=${d.error || { message: t('Album not found') }} retry=${d.reload} /></div>`;
  const a = d.data;
  const total = a.tracks.reduce((s, x) => s + (x.preview ? x.meta?.fullDuration || 0 : x.duration), 0);
  return html`<div class="view-pad">
    <${Header} kind=${t('Album')} title=${a.title} art=${html`<${Cover} src=${a.artwork} size=500 title=${a.title} />`} color=${a.artwork}
      sub=${html`<b>${a.artist}</b>${a.year ? ` · ${a.year}` : ''} · ${nSongs(a.tracks.length)}${total ? `, ${fmtDuration(total)}` : ''}${a.license && a.source === 'ia' ? html`<br /><small>${t('Licence')}: ${String(a.license).replace(/^https?:\/\//, '')}</small>` : ''}`}>
      <${Actions} tracks=${a.tracks} context=${a.title} extra=${html`<${IconBtn} icon="heart" label=${saved ? t('Remove from library') : t('Save to library')} active=${saved} fill=${saved} size=${24} onClick=${() => saveItem('album', { ...a, ref })} />`} />
    <//>
    ${a.tracks.some((x) => x.preview) ? html`<p class="muted tiny pad-x"><${Icon} name="info" size=${13} /> ${t('Tracks from this album play as 30-second previews.')}</p>` : null}
    <${TrackList} tracks=${a.tracks} context=${a.title} showAlbum=${false} />
  </div>`;
}

// ------------------------------------------------------------------ artist
export function ArtistView({ route }) {
  const [src, id] = [route.parts[1], route.parts[2]];
  const d = useAsync(() => cat.loadArtist(src, id), [src, id]);
  const ref = `${src}:${id}`;
  const saved = useStore(lib, () => isSaved('artist', ref));
  if (d.loading) return html`<div class="view-pad"><${Skeleton} rows=${10} /></div>`;
  if (d.error || !d.data) return html`<div class="view-pad"><${ErrorBox} error=${d.error || { message: t('Artist not found') }} retry=${d.reload} /></div>`;
  const a = d.data;
  return html`<div class="view-pad">
    <${Header} kind=${a.verified ? t('Verified artist') : t('Artist')} title=${a.title} art=${html`<${Cover} src=${a.artwork} size=500 title=${a.title} round icon="user" />`} color=${a.artwork}
      sub=${html`${a.genre || ''}${a.followers ? ` · ${a.followers.toLocaleString()} ${t('followers')}` : ''}${a.bio ? html`<br /><span class="clamp">${a.bio}</span>` : ''}`}>
      <${Actions} tracks=${a.tracks} context=${a.title} extra=${html`<button class=${cx('btn ghost', saved && 'on')} onClick=${() => saveItem('artist', { ...a, ref })}>${saved ? t('Following') : t('Follow')}</button>`} />
    <//>
    <h2 class="sec">${t('Popular')}</h2>
    <${TrackList} tracks=${a.tracks} context=${a.title} limit=${12} />
    ${a.albums?.length ? html`<${Shelf} title=${t('Albums')}>${a.albums.map((al) => html`<${Card} key=${al.id} item=${al} sub=${al.year || ''} onClick=${() => goAlbum(al)} />`)}<//>` : null}
  </div>`;
}
