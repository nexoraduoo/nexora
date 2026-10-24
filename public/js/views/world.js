// Screens for the world catalogue: "New everywhere" shelf, release page, and the "everything else" search section.
import { html, useAsync } from '../lib.js';
import { Icon } from '../icons.js';
import { nav } from '../state.js';
import { ctl } from '../ctl.js';
import { Card, Shelf, TrackList, Cover, ErrorBox, Skeleton, Spinner } from '../ui.js';
import * as W from '../world.js';
import { t } from '../i18n.js';
import { nSongs } from '../i18n.js';

/** Home shelf: releases that just came out on any platform (data from the open music databases). */
export function NewEverywhere() {
  const d = useAsync(() => W.newEverywhere(30), []);
  if (!d.data || !d.data.releases.length) return null;
  return html`<${Shelf} title=${t('New everywhere')} subtitle=${t('Just released on every platform, found by the open music databases')} icon="sparkle">
    ${d.data.releases.map((r) => html`<${Card} key=${r.mbid} item=${{ id: r.mbid, title: r.name, artwork: r.cover }} sub=${`${r.artist}${r.date ? ` · ${r.date}` : ''}`} onClick=${() => nav(`/release/${r.mbid}`)} />`)}
  <//>`;
}

/** A release (album / single) with its tracklist and every track's ISRC. */
export function ReleaseView({ route }) {
  const mbid = route.parts[1];
  const d = useAsync(() => W.release(mbid), [mbid]);
  if (d.loading) return html`<div class="view-pad"><${Skeleton} rows=${8} /></div>`;
  if (d.error) return html`<div class="view-pad"><${ErrorBox} error=${d.error} retry=${d.reload} /></div>`;
  const { release: r, tracks } = d.data;
  return html`<div class="view-pad">
    <header class="hero detail">
      <div class="hero-art"><${Cover} src=${r.cover} size=500 title=${r.name} /></div>
      <div class="hero-text"><small>${r.kind || t('Release')}</small><h1>${r.name}</h1>
        <p class="hero-sub">${r.artist}${r.date ? ` · ${r.date}` : ''}${r.country ? ` · ${r.country}` : ''} · ${nSongs(tracks.length)}</p>
        <div class="row gap wrap"><button class="btn primary" onClick=${() => ctl.playTracks(tracks, 0, { context: r.name })}><${Icon} name="play" size=${18} /> ${t('Play')}</button>
          <a class="btn ghost" target="_blank" rel="noopener" href=${`https://musicbrainz.org/release/${r.mbid}`}><${Icon} name="external" size=${16} /> MusicBrainz</a></div>
        <p class="muted tiny">${t('Each song shows its ISRC (open the ⋯ menu). Audio: the full song when the open catalogue has it, otherwise a 30-second preview.')}</p></div>
    </header>
    <${TrackList} tracks=${tracks} context=${r.name} showAlbum=${false} />
  </div>`;
}

/** Search section: every recording in the world that matches, with ISRCs. */
export function WorldResults({ q }) {
  const d = useAsync(() => (q.trim().length >= 2 ? W.searchWorld(q.trim()) : Promise.resolve(null)), [q]);
  if (!q.trim() || q.trim().length < 2) return null;
  return html`<section class="shelf">
    <div class="shelf-head"><div><h2>${t('Every recording in the world')}</h2><p class="muted">${t('From the open music database, with ISRCs. Press play: the full song if Nexora has it, otherwise a 30-second preview.')}</p></div></div>
    ${d.loading ? html`<div class="center pad"><${Spinner} size=${22} /></div>` : null}
    ${d.error ? html`<p class="muted pad-x">${d.error.message}</p>` : null}
    ${d.data && !d.data.tracks.length ? html`<p class="muted pad-x">${t('Nothing found in the open database.')}</p>` : null}
    ${d.data && d.data.tracks.length ? html`<${TrackList} tracks=${d.data.tracks} context=${`${t('Search')}: ${q}`} showAlbum=${true} />` : null}
  </section>`;
}
