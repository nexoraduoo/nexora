// Client-side catalogue: Nexora's own (agent-maintained) catalogue first, live sources second.
// Full-length songs are the default everywhere. 30-second previews only appear if you switch them on, or if
// the owner enabled the YouTube option (which can play them in full).
import * as S from './shared/sources.js';
import { app, region } from './state.js';
import { get } from './api.js';

export const jamKey = () => app.get().config.jamendoKey || null;
const opts = () => ({ country: region(), jamendoKey: jamKey() });

/** Are preview-only songs shown? (They are playable in full only through the optional YouTube feature.) */
export const previewsAllowed = () => {
  const { prefs, config } = app.get();
  return !!prefs.previews || (!!config.youtube && prefs.ytAuto !== false);
};
export const fullOnly = (list) => (previewsAllowed() ? list : list.filter((t) => !t.preview));

// cm = mood label used in the catalogue, cg = genre label used in the catalogue
export const MOODS = [
  { id: 'chill', cm: 'chill', title: 'Chill', q: 'chill lofi beats', hue: 190, icon: 'moon' },
  { id: 'focus', cm: 'focus', title: 'Focus', q: 'focus study piano instrumental', hue: 215, icon: 'bolt' },
  { id: 'workout', cm: 'energy', title: 'Workout', q: 'workout gym energy', hue: 12, icon: 'gauge' },
  { id: 'party', cm: 'party', title: 'Party', q: 'party dance hits', hue: 320, icon: 'sparkle' },
  { id: 'romance', cm: 'romance', title: 'Romance', q: 'love romantic songs', hue: 345, icon: 'heart' },
  { id: 'sad', cm: 'sad', title: 'Sad', q: 'sad heartbreak songs', hue: 250, icon: 'disc' },
  { id: 'devotional', cm: 'devotional', title: 'Devotional', q: 'devotional bhakti', hue: 38, icon: 'star' },
  { id: 'sleep', cm: 'chill', title: 'Sleep', q: 'sleep ambient calm', hue: 265, icon: 'moon' },
  { id: 'road', cm: 'energy', title: 'Road trip', q: 'road trip driving songs', hue: 150, icon: 'radio' },
  { id: 'happy', cm: 'happy', title: 'Feel good', q: 'happy feel good songs', hue: 48, icon: 'sun' },
];

export const GENRES = [
  { id: 'pop', cg: 'Pop', title: 'Pop', q: 'pop hits', hue: 330 }, { id: 'hiphop', cg: 'Hip-Hop/Rap', title: 'Hip-Hop', q: 'hip hop rap', hue: 28 },
  { id: 'rock', cg: 'Rock', title: 'Rock', q: 'rock classics', hue: 8 }, { id: 'electronic', cg: 'Electronic', title: 'Electronic', q: 'electronic edm', hue: 200 },
  { id: 'rnb', cg: 'R&B/Soul', title: 'R&B / Soul', q: 'r&b soul', hue: 280 }, { id: 'jazz', cg: 'Jazz', title: 'Jazz', q: 'jazz', hue: 40 },
  { id: 'classical', cg: 'Classical', title: 'Classical', q: 'classical orchestra', hue: 220 }, { id: 'folk', cg: 'Folk', title: 'Folk & Acoustic', q: 'folk acoustic', hue: 100 },
  { id: 'latin', cg: 'Latin', title: 'Latin', q: 'latin reggaeton', hue: 15 }, { id: 'indie', cg: 'Alternative', title: 'Indie', q: 'indie alternative', hue: 170 },
  { id: 'metal', cg: 'Metal', title: 'Metal', q: 'metal', hue: 0 }, { id: 'country', cg: 'Country', title: 'Country', q: 'country', hue: 35 },
  { id: 'reggae', cg: 'Reggae', title: 'Reggae', q: 'reggae', hue: 120 }, { id: 'soundtrack', cg: 'Soundtrack', title: 'Soundtracks', q: 'soundtrack score', hue: 250 },
  { id: 'ambient', cg: 'Ambient', title: 'Ambient', q: 'ambient', hue: 185 }, { id: 'blues', cg: 'Blues', title: 'Blues', q: 'blues', hue: 215 },
];

/** Songs + albums + artists + radio for a search box. Full-length sources only unless previews are allowed. */
export const search = (q, extra = {}) => {
  const sources = previewsAllowed() ? undefined : new Set(['audius', 'jamendo', 'ia', 'radio']);
  return S.searchAll(q, { ...opts(), sources, ...extra });
};

/** The home-screen bundle: new, best of all time, classics, per-genre shelves. */
export const featured = () => get('/api/catalog/featured');

/** Page through Nexora's catalogue. sort: best | new | old; filters: genre, lang, mood, q, source. */
export function browse({ sort = 'best', genre, lang, mood, q, source, offset = 0, limit = 30, maxYear } = {}) {
  const p = new URLSearchParams({ sort, limit: String(limit), offset: String(offset) });
  for (const [k, v] of Object.entries({ genre, lang, mood, q, source, maxYear })) if (v) p.set(k, v);
  return get(`/api/catalog?${p}`).then((d) => d.tracks);
}

/** Apple charts: previews only, so they are offered only when YouTube can play them in full. */
export const charts = (country = region(), limit = 30) => S.fetchChart(country, limit);

export const trending = (genre, time = 'week') => S.audiusTrending(genre, { limit: 24, time });

/** Best full songs for a language, plus live radio. */
export async function languageSongs(code, limit = 25) {
  const name = S.langName(code);
  const country = S.LANG_COUNTRY[code] || 'US';
  const [free, found, radio, songs] = await Promise.all([
    browse({ lang: code, limit: 30 }).catch(() => []),
    // artists often put the language in the title or tags; this finds those full songs too
    S.audiusSearch(name, { limit: 20 }).catch(() => []),
    S.radioSearch({ language: name.toLowerCase(), limit: 12 }).catch(() => []),
    previewsAllowed() ? S.itunesSearch(`${name} hits`, { country, limit }).then((r) => r.map(S.fromItunes).filter(Boolean)).catch(() => []) : [],
  ]);
  const seen = new Set(free.map((t) => t.id));
  return { free: [...free, ...found.filter((t) => !seen.has(t.id))], radio, songs };
}

export const radioFor = (opts2) => S.radioSearch(opts2);

export async function loadAlbum(src, id) {
  const ref = `${src}:${id}`;
  if (src === 'itunes') return S.itunesAlbum(id, { country: region() });
  if (src === 'ia') return S.iaAlbum(ref);
  throw new Error('Unknown album source');
}

export async function loadArtist(src, id) {
  if (src === 'itunes') return S.itunesArtist(id, { country: region() });
  if (src === 'audius') return S.audiusArtist(id);
  throw new Error('Unknown artist source');
}

/** "More like this" for autoplay and "Start radio": same genre from Nexora's catalogue, full songs. */
export async function similarTo(track, existing = []) {
  const have = new Set(existing.map((t) => t.id));
  have.add(track.id);
  const jitter = Math.floor(Math.random() * 40);
  const pools = await Promise.all([
    track.genre ? browse({ genre: track.genre, limit: 30, offset: jitter }).catch(() => []) : [],
    track.lang ? browse({ lang: track.lang, limit: 20, offset: jitter % 20 }).catch(() => []) : [],
    track.source === 'audius' ? S.audiusTrending(track.genre || undefined, { limit: 25 }).catch(() => []) : [],
    previewsAllowed() && track.artist ? S.itunesSearch(track.artist, { country: region(), limit: 15 }).then((r) => r.map(S.fromItunes).filter(Boolean)).catch(() => []) : [],
  ]);
  const pool = fullOnly(pools.flat()).filter((t) => !have.has(t.id) && t.kind === 'track');
  const seen = new Set();
  const uniq = pool.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  return uniq.sort(() => Math.random() - 0.5).slice(0, 15);
}

export const hideExplicit = (list) => (app.get().prefs.hideExplicit ? list.filter((t) => !t.meta?.explicit) : list);

export { S };
