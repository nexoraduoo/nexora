// Search across every source at once.
import { html, cx, useState, useEffect, useStore, useAsync } from '../lib.js';
import { Icon } from '../icons.js';
import { app, lib, nav, local, setPrefs } from '../state.js';
import { ctl } from '../ctl.js';
import { WorldResults } from './world.js';
import { Card, Shelf, TrackList, Empty, ErrorBox, Cover, Tile, goAlbum, goArtist, Spinner } from '../ui.js';
import * as cat from '../catalog.js';
import { get } from '../api.js';
import { t, nSongs } from '../i18n.js';
import { startListening } from '../voice.js';
import { ui } from '../state.js';

const recents = () => { try { return JSON.parse(local.read('nx.recent', '[]')); } catch { return []; } };
const pushRecent = (q) => local.write('nx.recent', JSON.stringify([q, ...recents().filter((x) => x !== q)].slice(0, 12)));

export function SearchBox({ value, onInput, autofocus, big }) {
  return html`<div class=${cx('searchbox', big && 'big')}>
    <${Icon} name="search" size=${20} />
    <input id="search-input" type="search" inputmode="search" enterkeyhint="search" placeholder=${t('What do you want to listen to?')} value=${value} autofocus=${autofocus}
      onInput=${(e) => onInput(e.target.value)} autocomplete="off" spellcheck="false" aria-label=${t('Search')} />
    ${value ? html`<button class="iconbtn sm" onClick=${() => onInput('')} aria-label=${t('Clear')}><${Icon} name="x" size=${16} /></button>` : null}
    <button class="iconbtn sm mic" onClick=${() => { ui.set({ voice: true }); startListening(); }} aria-label=${t('Voice assistant')}><${Icon} name="mic" size=${18} /></button>
  </div>`;
}

export function SearchView({ route }) {
  const q = (route.parts[1] || '').trim();
  const [input, setInput] = useState(q);
  const [filter, setFilter] = useState('all');
  const prefs = useStore(app, (x) => x.prefs);
  const config = useStore(app, (x) => x.config);
  const showPrev = cat.previewsAllowed();
  const [more, setMore] = useState(false);
  useEffect(() => setInput(q), [q]);
  useEffect(() => {
    if (input.trim() === q) return undefined;
    const id = setTimeout(() => nav(input.trim() ? `/search/${encodeURIComponent(input.trim())}` : '/search', true), 420);
    return () => clearTimeout(id);
  }, [input]);

  const res = useAsync(async () => {
    if (!q) return null;
    pushRecent(q);
    const [web, mine] = await Promise.all([
      cat.search(q),
      get(`/api/catalog?q=${encodeURIComponent(q)}&limit=12`).then((d) => d.tracks).catch(() => []),
    ]);
    return { ...web, mine };
  }, [q, showPrev]);

  const playlists = useStore(lib, (s) => s.playlists);
  const togglePrev = () => setPrefs({ previews: !prefs.previews });

  if (!q) {
    const rec = recents();
    return html`<div class="view-pad">
      <div class="only-mobile"><${SearchBox} value=${input} onInput=${setInput} big autofocus /></div>
      ${rec.length ? html`<section class="shelf"><div class="shelf-head"><div><h2>${t('Recent searches')}</h2></div><div class="shelf-nav"><button class="link" onClick=${() => { local.write('nx.recent', '[]'); app.set({}); setInput(''); nav('/search', true); }}>${t('Clear')}</button></div></div>
        <div class="chips">${rec.map((r) => html`<button class="chip" onClick=${() => nav(`/search/${encodeURIComponent(r)}`)}><${Icon} name="clock" size=${14} /> ${r}</button>`)}</div></section>` : null}
      <section class="shelf"><div class="shelf-head"><div><h2>${t('Explore')}</h2></div></div>
        <div class="tiles">
          <${Tile} title=${t('Languages')} hue=${200} icon="globe" onClick=${() => nav('/browse')} />
          <${Tile} title=${t('New releases')} hue=${310} icon="sparkle" onClick=${() => nav('/catalog/new')} />
          <${Tile} title=${t('Best of all time')} hue=${40} icon="star" onClick=${() => nav('/catalog/best')} />
          <${Tile} title=${t('Live radio')} hue=${150} icon="radio" onClick=${() => nav('/radio')} />
          <${Tile} title=${t('Podcasts')} hue=${260} icon="podcast" onClick=${() => nav('/podcasts')} />
        </div></section>
      <section class="shelf"><div class="shelf-head"><div><h2>${t('Browse all')}</h2></div></div>
        <div class="tiles">${[...cat.MOODS.map((m) => ({ ...m, to: `/mood/${m.id}` })), ...cat.GENRES.map((g) => ({ ...g, to: `/genre/${g.id}`, icon: 'music' }))].map((m) => html`<${Tile} title=${m.title} hue=${m.hue} icon=${m.icon} onClick=${() => nav(m.to)} />`)}</div></section>
    </div>`;
  }

  const d = res.data;
  const songsAll = d ? [...d.mine.filter((m) => !d.songs.some((s) => s.id === m.id)), ...d.songs] : [];
  const songs = (showPrev ? songsAll : songsAll.filter((s) => !s.preview)).filter((s) => s.url);
  const top = songs[0];
  const myPls = playlists.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const show = (k) => filter === 'all' || filter === k;
  const none = d && !songs.length && !d.albums.length && !d.artists.length && !d.radio.length;
  const q2 = encodeURIComponent(q);

  return html`<div class="view-pad">
    <div class="only-mobile"><${SearchBox} value=${input} onInput=${setInput} big /></div>
    <div class="filters">
      ${[['all', t('All')], ['songs', t('Songs')], ['albums', t('Albums')], ['artists', t('Artists')], ['radio', t('Radio')]].map(([k, l]) => html`<button class=${cx('chip', filter === k && 'on')} onClick=${() => setFilter(k)}>${l}</button>`)}
      <span class="grow"></span>
      ${config.youtube ? html`<span class="muted tiny">${t('Previews play in full through YouTube')}</span>` : html`<label class="switch sm"><input type="checkbox" checked=${!!prefs.previews} onChange=${togglePrev} /><i></i><span>${t('Include 30-second previews')}</span></label>`}
    </div>
    ${res.loading ? html`<div class="center pad"><${Spinner} size=${28} /></div>` : null}
    ${res.error ? html`<${ErrorBox} error=${res.error} retry=${res.reload} />` : null}
    ${d && Object.keys(d.errors || {}).length ? html`<p class="muted tiny pad-x">${t('Some sources did not respond:')} ${Object.keys(d.errors).join(', ')}</p>` : null}

    ${none ? html`<${Empty} icon="search" title=${`${t('No results for')} “${q}”`} text=${showPrev ? t('Check the spelling, try the artist name, or search in another language. Songs that are only on paid services cannot be streamed here.') : t('No full-length song matched. Check the spelling or try the artist name. If this is a big commercial song, only a 30-second preview exists: switch on previews, or ask the owner to add the YouTube option.')}>
      <div class="row gap"><a class="btn ghost" target="_blank" rel="noopener" href=${`https://music.apple.com/search?term=${q2}`}>Apple Music</a><a class="btn ghost" target="_blank" rel="noopener" href=${`https://music.youtube.com/search?q=${q2}`}>YouTube Music</a><a class="btn ghost" target="_blank" rel="noopener" href=${`https://open.spotify.com/search/${q2}`}>Spotify</a></div><//>` : null}

    ${d && top && (filter === 'all' || filter === 'songs') ? html`<div class="search-top">
      <section><h2 class="sec">${t('Top result')}</h2>
        <div class="topcard" onClick=${() => ctl.playTracks(songs, 0, { context: `${t('Search')}: ${q}` })}>
          <${Cover} src=${top.artwork} size=300 title=${top.title} />
          <div><h3>${top.title}</h3><p>${top.artist}</p><span class="chip sm">${top.preview ? t('30-second preview') : t('Full song')}</span></div>
          <button class="card-play on" aria-label=${t('Play')}><${Icon} name="play" size=${24} /></button>
        </div></section>
      <section class="grow"><h2 class="sec">${t('Songs')}</h2>
        <${TrackList} tracks=${songs.slice(0, more ? 30 : 6)} context=${`${t('Search')}: ${q}`} showAlbum=${false} />
        ${songs.length > 6 ? html`<button class="link pad" onClick=${() => setMore(!more)}>${more ? t('Show less') : `${t('Show more')} (${Math.min(30, songs.length) - 6})`}</button>` : null}
      </section></div>` : null}

    ${d && d.mine.length && show('songs') ? html`<${Shelf} title=${t('Verified by Nexora')} subtitle=${t('Full-length songs from the catalogue agent')} icon="shield">${d.mine.map((tr, i) => html`<${Card} key=${tr.id} item=${tr} onClick=${() => ctl.playTracks(d.mine, i, { context: t('Nexora catalogue') })} onPlay=${() => ctl.playTracks(d.mine, i, { context: t('Nexora catalogue') })} />`)}<//>` : null}
    ${d && d.artists.length && show('artists') ? html`<${Shelf} title=${t('Artists')}>${d.artists.map((a) => html`<${Card} key=${a.id} item=${a} round sub=${t('Artist')} onClick=${() => goArtist(a)} />`)}<//>` : null}
    ${d && d.albums.length && show('albums') ? html`<${Shelf} title=${t('Albums & collections')}>${d.albums.map((a) => html`<${Card} key=${a.id} item=${a} sub=${`${a.artist || ''}${a.year ? ` · ${a.year}` : ''}`} onClick=${() => goAlbum(a)} />`)}<//>` : null}
    ${d && d.radio.length && show('radio') ? html`<${Shelf} title=${t('Live radio')} icon="radio">${d.radio.map((r, i) => html`<${Card} key=${r.id} item=${r} sub=${r.artist} onClick=${() => ctl.playTracks(d.radio, i, { context: t('Live radio') })} onPlay=${() => ctl.playTracks(d.radio, i, { context: t('Live radio') })} />`)}<//>` : null}
    ${filter === 'all' || filter === 'songs' ? html`<${WorldResults} q=${q} />` : null}
    ${myPls.length && filter === 'all' ? html`<${Shelf} title=${t('Your playlists')}>${myPls.map((p) => html`<${Card} key=${p.id} item=${{ title: p.name, artwork: p.cover }} sub=${`${nSongs(p.count)}`} onClick=${() => nav(`/playlist/${p.id}`)} />`)}<//>` : null}
  </div>`;
}
