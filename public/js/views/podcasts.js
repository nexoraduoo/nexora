// Podcasts: shows publish free feeds; Nexora lists them and plays the episodes (resuming where you stopped).
import { html, cx, useState, useEffect, useStore, useAsync } from '../lib.js';
import { Icon } from '../icons.js';
import { lib, nav, region } from '../state.js';
import { ctl } from '../ctl.js';
import { Card, Shelf, TrackList, Skeleton, Empty, ErrorBox } from '../ui.js';
import { saveItem, isSaved } from '../library.js';
import * as S from '../shared/sources.js';
import { LANGUAGES, LANG_COUNTRY, langName } from '../shared/sources.js';
import { Hero } from './browse.js';
import { t } from '../i18n.js';
import { fmtDuration } from '../lib.js';

const podId = (p) => String(p.id).replace(/^itunes:/, '');
const ShowCard = ({ p }) => html`<${Card} item=${p} sub=${p.artist} onClick=${() => nav(`/podcast/${podId(p)}`)} />`;

export function PodcastsView() {
  const mine = useStore(lib, (s) => s.podcasts);
  const [q, setQ] = useState('');
  const [lang, setLang] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const id = setTimeout(() => setTerm(q.trim()), 450); return () => clearTimeout(id); }, [q]);
  const country = lang ? LANG_COUNTRY[lang] || region() : region();
  const query = term || (lang ? `${langName(lang)} podcast` : '');
  const res = useAsync(() => (query ? S.podcastSearch(query, { country, limit: 24 }) : S.podcastTop(country, 24)), [query, country]);

  return html`<div class="view-pad">
    <h1 class="page-title">${t('Podcasts')}</h1>
    <div class="searchbox"><${Icon} name="search" size=${20} /><input type="search" placeholder=${t('Search podcasts')} value=${q} onInput=${(e) => setQ(e.target.value)} aria-label=${t('Search podcasts')} /></div>
    <div class="chips pad-x"><button class=${cx('chip', !lang && 'on')} onClick=${() => setLang('')}>${t('All')}</button>
      ${LANGUAGES.slice(0, 16).map(([c, n, native]) => html`<button class=${cx('chip', lang === c && 'on')} onClick=${() => setLang(c)}>${native}</button>`)}</div>
    ${mine.length && !query ? html`<${Shelf} title=${t('Your podcasts')} icon="podcast">${mine.map((p) => html`<${Card} key=${p.ref} item=${{ ...p, id: p.ref }} sub=${p.artist} onClick=${() => nav(`/podcast/${podId({ id: p.ref })}`)} />`)}<//>` : null}
    ${res.loading ? html`<${Skeleton} cards />` : res.error ? html`<${ErrorBox} error=${res.error} retry=${res.reload} />` : res.data.length
      ? html`<${Shelf} title=${query ? `${t('Results')}` : `${t('Top podcasts')} · ${country}`} icon="podcast">${res.data.map((p) => html`<${ShowCard} key=${p.id} p=${p} />`)}<//>`
      : html`<${Empty} icon="podcast" title=${t('No podcasts found')} text=${t('Try another word or language.')} />`}
    <p class="muted tiny pad-x">${t('Podcasts are free shows published by their creators. Nexora plays them straight from the creators’ own feeds and remembers where you stopped.')}</p>
  </div>`;
}

export function PodcastView({ route }) {
  const id = route.parts[1];
  const d = useAsync(async () => {
    const show = await S.podcastLookup(id, { country: region() });
    if (!show?.feedUrl) throw new Error(t('That podcast has no public feed.'));
    const feed = await S.podcastEpisodes(show.feedUrl);
    return { show, feed };
  }, [id]);
  const saved = useStore(lib, () => isSaved('podcast', `itunes:${id}`));
  if (d.loading) return html`<div class="view-pad"><${Skeleton} rows=${8} /></div>`;
  if (d.error) return html`<div class="view-pad"><${ErrorBox} error=${d.error} retry=${d.reload} /></div>`;
  const { show, feed } = d.data;
  const eps = feed.episodes;
  const ctx = show.title;
  return html`<div class="view-pad">
    <${Hero} title=${show.title} sub=${t('Podcast')} hue=${280} icon="podcast" art=${html`<div class="cover"><img src=${feed.show.image || show.artwork} alt="" referrerpolicy="no-referrer" /></div>`}>
      <p class="hero-sub">${show.artist}${show.genre ? ` · ${show.genre}` : ''}</p>
      ${feed.show.description ? html`<p class="clamp muted">${feed.show.description}</p>` : null}
      <div class="hero-actions">
        <button class="btn primary big" disabled=${!eps.length} onClick=${() => ctl.playTracks(eps, 0, { context: ctx })}><${Icon} name="play" size=${20} /> ${t('Play latest')}</button>
        <button class=${cx('btn ghost', saved && 'on')} onClick=${() => saveItem('podcast', { ...show, ref: `itunes:${id}`, url: show.feedUrl })}><${Icon} name="plus" size=${18} /> ${saved ? t('Following') : t('Follow')}</button>
      </div>
    <//>
    ${eps.length ? html`<h2 class="sec">${t('Episodes')} <small class="muted">· ${eps.length} ${t('newest')} · ${fmtDuration(eps.reduce((s, e) => s + e.duration, 0))}</small></h2><${TrackList} tracks=${eps} context=${ctx} showAlbum=${false} />`
      : html`<${Empty} icon="podcast" title=${t('No episodes found')} />`}
  </div>`;
}
