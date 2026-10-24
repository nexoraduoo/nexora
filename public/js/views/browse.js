// Browse by language, mood, genre; charts; live radio.
import { html, cx, useState, useEffect, useStore, useAsync } from '../lib.js';
import { Icon } from '../icons.js';
import { app, nav, region, setPrefs } from '../state.js';
import { ctl } from '../ctl.js';
import { Card, Shelf, TrackList, Skeleton, Empty, ErrorBox, Tile } from '../ui.js';
import * as cat from '../catalog.js';
import { LANGUAGES, langName } from '../shared/sources.js';
import { t } from '../i18n.js';

export function Hero({ title, sub, hue = 260, icon = 'music', children, art }) {
  return html`<header class="hero" style=${`--h:${hue}`}>
    <div class="hero-art">${art || html`<span class="hero-ic"><${Icon} name=${icon} size=${54} /></span>`}</div>
    <div class="hero-text"><small>${sub}</small><h1>${title}</h1>${children}</div>
  </header>`;
}

function PlayButtons({ tracks, context }) {
  const ok = tracks.filter((x) => x.url);
  return html`<div class="hero-actions">
    <button class="btn primary big" disabled=${!ok.length} onClick=${() => ctl.playTracks(ok, 0, { context })}><${Icon} name="play" size=${20} /> ${t('Play')}</button>
    <button class="btn ghost big" disabled=${!ok.length} onClick=${() => ctl.playTracks(ok, 0, { context, shuffle: true })}><${Icon} name="shuffle" size=${20} /> ${t('Shuffle')}</button>
  </div>`;
}

export function BrowseView() {
  const prefs = useStore(app, (s) => s.prefs);
  return html`<div class="view-pad">
    <h1 class="page-title">${t('Browse')}</h1>
    <section class="shelf"><div class="shelf-head"><div><h2><${Icon} name="shield" size=${20} />${t('Nexora catalogue')}</h2><p>${t('Full-length songs only. Updated by itself every 2 minutes.')}</p></div></div>
      <div class="tiles"><${Tile} title=${t('New releases')} hue=${310} icon="sparkle" onClick=${() => nav('/catalog/new')} /><${Tile} title=${t('Best of all time')} hue=${45} icon="star" onClick=${() => nav('/catalog/best')} /><${Tile} title=${t('Classics and oldest')} hue=${200} icon="disc" onClick=${() => nav('/catalog/old')} /><${Tile} title=${t('Podcasts')} hue=${280} icon="podcast" onClick=${() => nav('/podcasts')} /></div></section>
    <section class="shelf"><div class="shelf-head"><div><h2><${Icon} name="globe" size=${20} />${t('Languages')}</h2><p>${t('Music from every corner of the world. Tap the ★ on a language page to follow it.')}</p></div></div>
      <div class="tiles langs">${LANGUAGES.map(([c, n, native], i) => html`<${Tile} title=${native} sub=${n} hue=${(i * 37) % 360} icon="globe" onClick=${() => nav(`/lang/${c}`)} />`)}</div></section>
    ${cat.previewsAllowed() ? html`<section class="shelf"><div class="shelf-head"><div><h2>${t('Charts around the world')}</h2></div></div>
      <div class="chips">${['IN', 'US', 'GB', 'KR', 'JP', 'BR', 'MX', 'FR', 'DE', 'ES', 'IT', 'SA', 'TR', 'NG', 'ZA', 'ID', 'TH', 'RU', 'PK', 'BD', 'LK', 'AU', 'CA'].map((c) => html`<button class="chip" onClick=${() => nav(`/charts/${c}`)}>${flag(c)} ${c}</button>`)}</div></section>` : null}
    <section class="shelf"><div class="shelf-head"><div><h2>${t('Moods')}</h2></div></div><div class="tiles">${cat.MOODS.map((m) => html`<${Tile} title=${m.title} hue=${m.hue} icon=${m.icon} onClick=${() => nav(`/mood/${m.id}`)} />`)}</div></section>
    <section class="shelf"><div class="shelf-head"><div><h2>${t('Genres')}</h2></div></div><div class="tiles">${cat.GENRES.map((m) => html`<${Tile} title=${m.title} hue=${m.hue} icon="music" onClick=${() => nav(`/genre/${m.id}`)} />`)}</div></section>
    <section class="shelf"><div class="shelf-head"><div><h2>${t('Live radio')}</h2></div><div class="shelf-nav"><button class="link" onClick=${() => nav('/radio')}>${t('Show all')}</button></div></div></section>
  </div>`;
}

export const flag = (cc) => String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));

export function LangView({ route }) {
  const code = route.parts[1];
  const prefs = useStore(app, (s) => s.prefs);
  const following = (prefs.contentLangs || []).includes(code);
  const d = useAsync(() => cat.languageSongs(code, 30), [code]);
  const lang = LANGUAGES.find((l) => l[0] === code);
  const all = d.data ? [...d.data.free, ...d.data.songs] : [];
  const toggle = () => setPrefs({ contentLangs: following ? prefs.contentLangs.filter((c) => c !== code) : [...(prefs.contentLangs || []), code] });
  return html`<div class="view-pad">
    <${Hero} title=${lang ? lang[2] : code} sub=${`${t('Language')} · ${lang?.[1] || code}`} hue=${((LANGUAGES.findIndex((l) => l[0] === code) + 1) * 37) % 360} icon="globe">
      <${PlayButtons} tracks=${all} context=${langName(code)} />
      <button class=${cx('btn ghost', following && 'on')} onClick=${toggle}><${Icon} name="star" size=${18} fill=${following} /> ${following ? t('Following') : t('Follow language')}</button>
    <//>
    ${d.loading ? html`<${Skeleton} />` : d.error ? html`<${ErrorBox} error=${d.error} retry=${d.reload} />` : html`
      ${d.data.free.length ? html`<h2 class="sec">${t('Full songs')}</h2><${TrackList} tracks=${d.data.free} context=${langName(code)} />` : null}
      ${d.data.radio.length ? html`<${Shelf} title=${t('Live radio')} icon="radio" more=${() => nav(`/radio/${code}`)}>${d.data.radio.map((r, i) => html`<${Card} key=${r.id} item=${r} sub=${r.artist} onClick=${() => ctl.playTracks(d.data.radio, i, { context: t('Live radio') })} onPlay=${() => ctl.playTracks(d.data.radio, i, { context: t('Live radio') })} />`)}<//>` : null}
      ${d.data.songs.length ? html`<h2 class="sec">${t('Popular')}</h2><${TrackList} tracks=${d.data.songs} context=${langName(code)} />` : null}
      ${!d.data.free.length && !d.data.songs.length && !d.data.radio.length ? html`<${Empty} icon="music" title=${t('No full songs in this language yet')} text=${t('Free full-length music in this language is still limited. Live radio and new arrivals from the catalogue agent will show up here.')} />` : null}
    `}
  </div>`;
}

export function MoodView({ route }) {
  const kind = route.parts[0];
  const id = route.parts[1];
  const item = (kind === 'mood' ? cat.MOODS : cat.GENRES).find((m) => m.id === id);
  const d = useAsync(async () => {
    if (!item) return [];
    const own = await cat.browse(kind === 'mood' ? { mood: item.cm, limit: 50 } : { genre: item.cg, limit: 50 }).catch(() => []);
    if (own.length >= 20) return own;
    const r = await cat.search(item.q).catch(() => ({ songs: [] }));
    const seen = new Set(own.map((x) => x.id));
    return [...own, ...cat.fullOnly(r.songs).filter((x) => x.url && !seen.has(x.id))];
  }, [id]);
  if (!item) return html`<${Empty} title=${t('Not found')} />`;
  const tracks = d.data || [];
  return html`<div class="view-pad">
    <${Hero} title=${item.title} sub=${kind === 'mood' ? t('Mood') : t('Genre')} hue=${item.hue} icon=${item.icon || 'music'}><${PlayButtons} tracks=${tracks} context=${item.title} /><//>
    ${d.loading ? html`<${Skeleton} />` : d.error ? html`<${ErrorBox} error=${d.error} retry=${d.reload} />` : html`<${TrackList} tracks=${tracks} context=${item.title} />`}
  </div>`;
}

export function ChartsView({ route }) {
  const [country, setCountry] = useState((route.parts[1] || region()).toUpperCase());
  const allowed = cat.previewsAllowed();
  const d = useAsync(() => (allowed ? cat.charts(country, 50) : Promise.resolve([])), [country, allowed]);
  if (!allowed) return html`<div class="view-pad"><${Empty} icon="star" title=${t('Charts are previews only')} text=${t('The big chart hits are not free to stream in full. Turn on previews in Settings, or ask the owner to add the YouTube option so they play in full. The Nexora catalogue has full songs.')}><button class="btn primary" onClick=${() => nav('/catalog/best')}>${t('Open the Nexora catalogue')}</button><//></div>`;
  return html`<div class="view-pad">
    <${Hero} title=${`${t('Top charts')} ${flag(country)} ${country}`} sub=${t('Charts')} hue=${40} icon="star"><${PlayButtons} tracks=${d.data || []} context=${`${t('Top charts')} ${country}`} />
      <select class="select" value=${country} onChange=${(e) => { setCountry(e.target.value); nav(`/charts/${e.target.value}`, true); }}>${['IN', 'US', 'GB', 'KR', 'JP', 'BR', 'MX', 'FR', 'DE', 'ES', 'IT', 'SA', 'TR', 'NG', 'ZA', 'ID', 'TH', 'RU', 'PK', 'BD', 'LK', 'AU', 'CA', 'AR', 'EG', 'PH', 'VN', 'PL', 'NL', 'SE'].map((c) => html`<option value=${c}>${flag(c)} ${c}</option>`)}</select>
    <//>
    <p class="muted tiny pad-x">${app.get().config.youtube ? t('These play in full through YouTube (YouTube may show ads).') : t('Chart songs play as 30-second previews. Open the ⋯ menu to find the full song on Apple Music, YouTube Music or Spotify.')}</p>
    ${d.loading ? html`<${Skeleton} rows=${10} />` : d.error ? html`<${ErrorBox} error=${d.error} retry=${d.reload} />` : html`<${TrackList} tracks=${d.data} context=${`${t('Top charts')} ${country}`} />`}
  </div>`;
}

const RADIO_TAGS = ['pop', 'rock', 'jazz', 'classical', 'news', 'talk', 'devotional', 'bollywood', 'hip hop', 'electronic', 'lofi', 'oldies'];

export function RadioView({ route }) {
  const [q, setQ] = useState('');
  const [lang, setLang] = useState(route.parts[1] ? langName(route.parts[1]).toLowerCase() : '');
  const [tag, setTag] = useState('');
  const d = useAsync(() => cat.radioFor({ q: q.trim() || undefined, language: lang || undefined, tag: tag || undefined, limit: 40 }), [q, lang, tag]);
  const saved = useStore(app, () => 0);
  return html`<div class="view-pad">
    <${Hero} title=${t('Live radio')} sub=${t('Stations from all over the world')} hue=${350} icon="radio"><${PlayButtons} tracks=${d.data || []} context=${t('Live radio')} /><//>
    <div class="filters">
      <input class="input" placeholder=${t('Station name')} value=${q} onInput=${(e) => setQ(e.target.value)} />
      <select class="select" value=${lang} onChange=${(e) => setLang(e.target.value)}><option value="">${t('Any language')}</option>${LANGUAGES.map(([c, n]) => html`<option value=${n.toLowerCase()}>${n}</option>`)}</select>
      <select class="select" value=${tag} onChange=${(e) => setTag(e.target.value)}><option value="">${t('Any style')}</option>${RADIO_TAGS.map((x) => html`<option value=${x}>${x}</option>`)}</select>
    </div>
    ${d.loading ? html`<${Skeleton} rows=${8} />` : d.error ? html`<${ErrorBox} error=${d.error} retry=${d.reload} />` : d.data.length ? html`<${TrackList} tracks=${d.data} context=${t('Live radio')} showAlbum=${false} />` : html`<${Empty} icon="radio" title=${t('No stations found')} text=${t('Try another language or style.')} />`}
  </div>`;
}

const CATALOG = {
  new: { title: 'New releases', sub: 'The newest full songs from artists around the world', icon: 'sparkle', hue: 310 },
  best: { title: 'Best of all time', sub: 'The most-played full songs on Nexora', icon: 'star', hue: 45 },
  old: { title: 'Classics and oldest', sub: 'Old recordings first: public domain and open licences', icon: 'disc', hue: 200 },
};

export function CatalogView({ route }) {
  const sort = CATALOG[route.parts[1]] ? route.parts[1] : 'best';
  const info = CATALOG[sort];
  const [genre, setGenre] = useState('');
  const [items, setItems] = useState([]);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState(null);
  const load = async (reset) => {
    setBusy(true); setErr(null);
    try {
      const got = await cat.browse({ sort, genre: genre || undefined, offset: reset ? 0 : items.length, limit: 30 });
      setItems((cur) => {
        const base = reset ? [] : cur;
        const seen = new Set(base.map((x) => x.id));
        return [...base, ...got.filter((x) => !seen.has(x.id))];
      });
      setMore(got.length >= 20);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  useEffect(() => { setItems([]); setMore(true); load(true); }, [sort, genre]);
  return html`<div class="view-pad">
    <${Hero} title=${t(info.title)} sub=${t(info.sub)} hue=${info.hue} icon=${info.icon}><${PlayButtons} tracks=${items} context=${t(info.title)} /><//>
    <div class="tabs scroll">${Object.entries(CATALOG).map(([k, v]) => html`<button class=${cx('tab', sort === k && 'on')} onClick=${() => nav(`/catalog/${k}`)}>${t(v.title)}</button>`)}</div>
    <div class="chips pad-x"><button class=${cx('chip', !genre && 'on')} onClick=${() => setGenre('')}>${t('All')}</button>${cat.GENRES.map((g) => html`<button class=${cx('chip', genre === g.cg && 'on')} onClick=${() => setGenre(g.cg)}>${g.title}</button>`)}</div>
    ${err ? html`<${ErrorBox} error=${err} retry=${() => load(items.length === 0)} />` : null}
    ${items.length ? html`<${TrackList} tracks=${items} context=${t(info.title)} />` : busy ? html`<${Skeleton} rows=${10} />` : html`<${Empty} icon="music" title=${t('Nothing here yet')} text=${t('The agent is still collecting music for this list. Check back in a few minutes.')} />`}
    ${more && items.length ? html`<div class="center pad"><button class="btn" disabled=${busy} onClick=${() => load(false)}>${busy ? t('Loading...') : t('Load more')}</button></div>` : null}
  </div>`;
}
