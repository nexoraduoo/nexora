// The world catalogue on the client: search every recording, see what just came out, and find audio for an entry.
// Entries have source "mb" (MusicBrainz) and an ISRC when known. They are listings: audio is found when you press play
// (see resolve): the full song if the open catalogue has it, else Apple's 30-second preview, else the stores that hold it.
import { get } from './api.js';

const memo = new Map(); // play lookups, so skipping back and forth is instant

export const searchWorld = (q, page = 0) => get(`/api/world/search?q=${encodeURIComponent(q)}&page=${page}`);
export const byIsrc = (isrc) => get(`/api/world/isrc/${encodeURIComponent(isrc)}`);
export const release = (mbid) => get(`/api/world/release/${mbid}`);
export const newEverywhere = (limit = 40) => get(`/api/world/new?limit=${limit}`);

export const isWorld = (t) => !!t && t.source === 'mb';

/** Find something to play for a world entry. Returns { kind: 'full' | 'preview' | 'none', track? }. */
export async function resolve(t) {
  if (memo.has(t.id)) return memo.get(t.id);
  const p = new URLSearchParams({ title: t.title, artist: t.artist || '' });
  if (t.isrc) p.set('isrc', t.isrc);
  const r = await get(`/api/world/play?${p}`);
  memo.set(t.id, r);
  return r;
}

/** Merge what resolve() found into the track (keeps the id, ISRC and everything pointing at it). */
export function withAudio(t, r) {
  if (r.kind === 'full') return { ...t, ...r.track, id: t.id, isrc: t.isrc || r.track.isrc, preview: false, license: r.track.license || t.license, meta: { ...(t.meta || {}), fullId: r.track.id } };
  if (r.kind === 'preview') return { ...t, url: r.track.url, duration: 30, preview: true, artwork: t.artwork || r.track.artwork, ext: r.track.ext || t.ext, genre: t.genre || r.track.genre, license: 'Apple 30-second preview', meta: { ...(t.meta || {}), fullDuration: t.duration } };
  return t;
}

/** Where the full recording lives, for the stores. Search links, so they never break. */
export function storeLinks(t) {
  const q = encodeURIComponent(`${t.title} ${t.artist}`.trim());
  return [
    ['Spotify', `https://open.spotify.com/search/${q}`],
    ['Apple Music', `https://music.apple.com/search?term=${q}`],
    ['YouTube Music', `https://music.youtube.com/search?q=${q}`],
    ['Deezer', `https://www.deezer.com/search/${q}`],
    ['Amazon Music', `https://music.amazon.com/search/${q}`],
  ];
}
