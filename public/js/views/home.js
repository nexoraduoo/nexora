// Home: Nexora's catalogue (new, best of all time, classics, genres) + personal shelves.
// Everything on this page is a full-length song unless previews are switched on.
import { NewEverywhere } from './world.js';
import { html, cx, useState, useEffect, useRef, useStore, useAsync, timeAgo } from '../lib.js';
import { Icon } from '../icons.js';
import { app, lib, nav, region } from '../state.js';
import { ctl } from '../ctl.js';
import { Card, Shelf, Skeleton, Tile, Cover, Avatar } from '../ui.js';
import * as cat from '../catalog.js';
import { buildMixes } from '../mixes.js';
import { get } from '../api.js';
import { LANGUAGES, langName } from '../shared/sources.js';
import { t, nSongs } from '../i18n.js';

function useVisible(rootMargin = '300px') {
  const ref = useRef();
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || !ref.current) return undefined;
    if (!('IntersectionObserver' in window)) { setSeen(true); return undefined; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

export function PlayShelf({ title, subtitle, icon, tracks, more, context }) {
  const list = cat.hideExplicit(cat.fullOnly(tracks || []));
  if (!list.length) return null;
  const ctxLabel = context || title;
  return html`<${Shelf} title=${title} subtitle=${subtitle} icon=${icon} more=${more}>
    ${list.slice(0, 20).map((tr, i) => html`<${Card} key=${tr.id} item=${tr} onClick=${() => ctl.playTracks(list, i, { context: ctxLabel })} onPlay=${() => ctl.playTracks(list, i, { context: ctxLabel })} />`)}
  <//>`;
}

/** A shelf that loads when scrolled near, so the home page never fires a dozen requests at once. */
export function TrackShelf({ title, subtitle, icon, load, deps = [], more, lazy = true, hideEmpty = true, context, filter }) {
  const [ref, seen] = useVisible();
  const go = !lazy || seen;
  const { data, loading, error } = useAsync(() => (go ? load() : Promise.resolve(null)), [go, ...deps]);
  if (!go) return html`<div ref=${ref} class="shelf-placeholder"></div>`;
  if (loading) return html`<section class="shelf"><div class="shelf-head"><div><h2>${title}</h2></div></div><${Skeleton} cards /></section>`;
  if (error) return null;
  let tracks = Array.isArray(data) ? data : data?.tracks || [];
  if (filter) tracks = filter(tracks);
  if (!tracks.length && !hideEmpty) return html`<${Shelf} title=${title}><p class="muted">${t('Nothing here yet.')}</p><//>`;
  return html`<${PlayShelf} title=${title} subtitle=${subtitle} icon=${icon} tracks=${tracks} more=${more} context=${context} />`;
}

/** Daily mixes built from what you play; they change every day. */
function MixShelf() {
  const [ref, seen] = useVisible('200px');
  const d = useAsync(() => (seen ? buildMixes() : Promise.resolve(null)), [seen]);
  if (!seen) return html`<div ref=${ref} class="shelf-placeholder"></div>`;
  if (d.loading) return html`<section class="shelf"><div class="shelf-head"><div><h2>${t('Made for you')}</h2></div></div><${Skeleton} cards /></section>`;
  if (d.error || !d.data?.length) return null;
  return html`<${Shelf} title=${t('Made for you')} subtitle=${t('Fresh every day, from what you play')} icon="sparkle">
    ${d.data.map((m) => html`<div class="card mix" key=${m.id} style=${`--h:${m.hue}`} tabindex="0" onClick=${() => ctl.playTracks(m.tracks, 0, { context: m.title })} onKeyDown=${(e) => e.key === 'Enter' && ctl.playTracks(m.tracks, 0, { context: m.title })}>
      <div class="card-art"><div class="mix-art"><${Cover} src=${m.artwork} size=300 title=${m.title} /><b class="mix-label">${m.title}</b></div>
        <button class="card-play" aria-label=${t('Play')} onClick=${(e) => { e.stopPropagation(); ctl.playTracks(m.tracks, 0, { context: m.title }); }}><${Icon} name="play" size=${22} /></button></div>
      <div class="card-title">${m.title}</div><div class="card-sub">${m.sub}</div></div>`)}
  <//>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? t('Still up?') : h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening');
}

function QuickPicks() {
  const s = useStore(lib, (x) => ({ liked: x.liked.length, dl: x.downloads.size, pls: x.playlists, hist: x.history.length }));
  const picks = [
    { title: t('Liked Songs'), sub: nSongs(s.liked), grad: 'linear-gradient(135deg,#6a4cff,#b06cff)', icon: 'heart', to: '/library/liked' },
    s.dl ? { title: t('Downloads'), sub: nSongs(s.dl), grad: 'linear-gradient(135deg,#00b894,#00d4ff)', icon: 'download', to: '/library/downloads' } : null,
    s.hist ? { title: t('Recently played'), sub: '', grad: 'linear-gradient(135deg,#ff7a59,#ff4d8d)', icon: 'clock', to: '/library/recent' } : null,
    ...s.pls.slice(0, 5).map((p) => ({ title: p.name, sub: nSongs(p.count), cover: p.cover, to: `/playlist/${p.id}` })),
  ].filter(Boolean).slice(0, 6);
  return html`<div class="quick">${picks.map((p) => html`<button class="quick-item" onClick=${() => nav(p.to)}>
    ${p.cover ? html`<${Cover} src=${p.cover} size=96 title=${p.title} />` : html`<span class="quick-ic" style=${`background:${p.grad}`}><${Icon} name=${p.icon} size=${22} fill=${p.icon === 'heart'} /></span>`}
    <span><b>${p.title}</b>${p.sub ? html`<small>${p.sub}</small>` : null}</span></button>`)}</div>`;
}

function FriendsNow() {
  const people = useStore(lib, (s) => s.people);
  const live = people.filter((p) => p.nowPlaying);
  if (!live.length) return null;
  return html`<${Shelf} title=${t('Friends are listening')} icon="users">
    ${live.map((p) => html`<div class="friend-card">
      <${Avatar} user=${{ displayName: p.displayName, hue: p.hue }} size=${44} />
      <div><b>${p.displayName}</b><small>${t('is listening to')}</small></div>
      <div class="friend-np"><${Cover} src=${p.nowPlaying.artwork} size=96 title=${p.nowPlaying.title} /><span><b>${p.nowPlaying.title}</b><small>${p.nowPlaying.artist}</small></span></div>
    </div>`)}
  <//>`;
}

export function HomeView() {
  const user = useStore(app, (s) => s.user);
  const prefs = useStore(app, (s) => s.prefs);
  const config = useStore(app, (s) => s.config);
  const history = useStore(lib, (s) => s.history);
  const taste = useAsync(() => get('/api/taste').catch(() => ({ artists: [], langs: [] })), []);
  const feat = useAsync(() => cat.featured().catch(() => null), []);
  const country = region();
  const langs = (prefs.contentLangs?.length ? prefs.contentLangs : (taste.data?.langs || []).map((l) => l.name)).slice(0, 3);
  const topArtists = (taste.data?.artists || []).slice(0, 2);
  const f = feat.data;
  const empty = f && !f.new.length && !f.best.length;
  const showCharts = cat.previewsAllowed();

  return html`<div class="view-pad home">
    <h1 class="greet">${greeting()}, <span class="grad">${user?.displayName?.split(' ')[0] || ''}</span></h1>
    <${QuickPicks} />
    <${FriendsNow} />

    ${history.length ? html`<${PlayShelf} title=${t('Jump back in')} icon="clock" tracks=${history} more=${() => nav('/library/recent')} context=${t('Recently played')} />` : null}

    <${MixShelf} />
    <${NewEverywhere} />

    ${feat.loading ? html`<section class="shelf"><div class="shelf-head"><div><h2>${t('New on Nexora')}</h2></div></div><${Skeleton} cards /></section>` : null}
    ${empty ? html`<div class="note-card"><${Icon} name="sparkle" size=${20} /><div><b>${t('Your catalogue is filling up')}</b><p>${t('The Nexora agent adds new full-length music every 2 minutes by itself. The owner can press “Run now” in the Owner console to speed it up.')}</p></div></div>` : null}
    ${f ? html`
      <${PlayShelf} title=${t('New on Nexora')} subtitle=${t('Just released, full songs')} icon="sparkle" tracks=${f.new} more=${() => nav('/catalog/new')} context=${t('New on Nexora')} />
      <${PlayShelf} title=${t('Best of all time')} subtitle=${t('The most-loved full songs on Nexora')} icon="star" tracks=${f.best} more=${() => nav('/catalog/best')} context=${t('Best of all time')} />
      <${PlayShelf} title=${t('Classics and timeless')} subtitle=${t('Old recordings, jazz, classical and blues')} icon="disc" tracks=${f.classics} more=${() => nav('/catalog/old')} context=${t('Classics and timeless')} />
    ` : null}

    ${topArtists.map((a) => html`<${TrackShelf} key=${a.name} title=${`${t('More from')} ${a.name}`} icon="sparkle" lazy=${false}
      load=${() => cat.browse({ q: a.name, limit: 24 })} deps=${[a.name]} />`)}

    ${(f?.genres || []).map((g) => html`<${PlayShelf} key=${g.genre} title=${cat.GENRES.find((x) => x.cg === g.genre)?.title || g.genre} icon="music" tracks=${g.tracks} more=${() => nav(`/genre/${cat.GENRES.find((x) => x.cg === g.genre)?.id || ''}`)} />`)}

    <${TrackShelf} title=${t('Trending on Audius')} subtitle=${t('Full songs from independent artists')} icon="bolt" load=${() => cat.trending()} />

    ${langs.map((code) => html`<${TrackShelf} key=${code} title=${`${langName(code)} ${t('hits')}`} icon="globe" more=${() => nav(`/lang/${code}`)} load=${() => cat.languageSongs(code, 20).then((d) => d.free)} deps=${[code]} />`)}

    ${showCharts ? html`<${TrackShelf} title=${`${t('Top charts')} · ${country}`} subtitle=${config.youtube ? t('Plays in full through YouTube') : t('30-second previews')} icon="star" more=${() => nav(`/charts/${country}`)} load=${() => cat.charts(country, 30)} deps=${[country]} />` : null}

    <section class="shelf">
      <div class="shelf-head"><div><h2><${Icon} name="globe" size=${20} />${t('Music in every language')}</h2><p>${t('Pick the languages you love. They will show up here.')}</p></div>
        <div class="shelf-nav"><button class="link" onClick=${() => nav('/browse')}>${t('Show all')}</button></div></div>
      <div class="chips">${LANGUAGES.slice(0, 14).map(([c, n, native]) => html`<button class=${cx('chip big', (prefs.contentLangs || []).includes(c) && 'on')} onClick=${() => nav(`/lang/${c}`)}>${native}<small>${n}</small></button>`)}</div>
    </section>

    <${TrackShelf} title=${t('Live radio')} icon="radio" more=${() => nav('/radio')} load=${() => cat.radioFor({ language: langName(langs[0] || 'en').toLowerCase(), limit: 14 })} deps=${[langs[0]]} />

    <section class="shelf">
      <div class="shelf-head"><div><h2>${t('Moods')}</h2></div></div>
      <div class="tiles">${cat.MOODS.map((m) => html`<${Tile} title=${m.title} hue=${m.hue} icon=${m.icon} onClick=${() => nav(`/mood/${m.id}`)} />`)}</div>
    </section>
    <section class="shelf">
      <div class="shelf-head"><div><h2>${t('Genres')}</h2></div></div>
      <div class="tiles">${cat.GENRES.map((m) => html`<${Tile} title=${m.title} hue=${m.hue} icon="music" onClick=${() => nav(`/genre/${m.id}`)} />`)}</div>
    </section>
    ${f?.total ? html`<p class="muted tiny center pad">${f.total.toLocaleString()} ${t('full songs')} · ${t('updated')} ${timeAgo(f.updatedAt)} · ${t('new music every 2 minutes')}</p>` : null}
  </div>`;
}
