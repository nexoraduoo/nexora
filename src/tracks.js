// Track snapshot validation + persistence. Every track the user touches (like, playlist, history)
// is stored in `tracks` so library pages keep working even if the original source disappears.

import { int, str } from './util.js';

const SOURCES = new Set(['itunes', 'audius', 'jamendo', 'ia', 'ccmixter', 'pod', 'radio', 'up', 'mb']);
const ID_RE = /^(itunes|audius|jamendo|ia|ccmixter|pod|radio|up|mb):[\w\-./%~@+ ]{1,300}$/;
const META_KEYS = ['albumId', 'artistId', 'fullDuration', 'explicit', 'verifiedArtist', 'trackNumber', 'codec', 'bitrate', 'country', 'plays', 'podcast'];

const httpsUrl = (v, max = 1500) => {
  if (typeof v !== 'string' || v.length > max) return null;
  if (v.startsWith('/api/files/')) return v;
  return /^https:\/\/[^\s]+$/i.test(v) ? v : null;
};

/** ISRC: 2 letters (country), 3 letters/digits (registrant), 2 digits (year), 5 digits (designation). "US-UM7-15-00001" is accepted too. */
export function cleanIsrc(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[-\s]/g, '').toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(s) ? s : null;
}

/** Validate + normalise a client-supplied track. Returns null when unusable. */
export function cleanTrack(t, { trusted = false } = {}) {
  if (!t || typeof t !== 'object') return null;
  if (typeof t.id !== 'string' || !ID_RE.test(t.id)) return null;
  const source = t.id.split(':')[0];
  if (!SOURCES.has(source) || (source === 'up' && !trusted)) return null;
  const title = str(t.title, 300);
  if (!title) return null;
  const meta = {};
  if (t.meta && typeof t.meta === 'object') {
    for (const k of META_KEYS) {
      const v = t.meta[k];
      if (typeof v === 'string') meta[k] = v.slice(0, 120);
      else if (typeof v === 'number' || typeof v === 'boolean') meta[k] = v;
    }
  }
  return {
    id: t.id,
    source,
    kind: t.kind === 'radio' ? 'radio' : 'track',
    title,
    artist: str(t.artist, 300),
    album: str(t.album, 300),
    duration: int(t.duration, 0, 86400),
    artwork: httpsUrl(t.artwork, 600),
    url: httpsUrl(t.url, 2000),
    preview: t.preview ? 1 : 0,
    license: str(t.license, 200) || null,
    downloadable: t.downloadable ? 1 : 0,
    lang: str(t.lang, 5).toLowerCase() || null,
    genre: str(t.genre, 80) || null,
    mood: str(t.mood, 40) || null,
    year: t.year ? int(t.year, 1000, 2100, 0) || null : null,
    ext: httpsUrl(t.ext, 600),
    pop: int(t.pop, 0, 2_000_000_000, 0),
    isrc: cleanIsrc(t.isrc),
    releasedAt: t.releasedAt ? int(t.releasedAt, 0, 4_102_444_800_000, 0) || null : null,
    meta: JSON.stringify(meta),
  };
}

export function upsertTrackStmt(env, c, { verified = 0 } = {}) {
  return env.DB.prepare(
    `INSERT INTO tracks (id, source, kind, title, artist, album, duration, artwork, url, preview, license, downloadable, lang, genre, mood, year, ext, verified, norm_key, meta, added_at, pop, released_at, isrc)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title, artist=excluded.artist, album=excluded.album,
       -- the audio pointer and length belong to the catalogue agent: a stale copy from someone's playlist must not overwrite them
       duration=CASE WHEN excluded.duration>0 AND (excluded.verified=1 OR tracks.verified=0) THEN excluded.duration ELSE tracks.duration END,
       rev=CASE WHEN excluded.verified=1 AND tracks.verified=1 AND tracks.duration>0 AND excluded.duration>0 AND ABS(excluded.duration-tracks.duration)>=2 THEN tracks.rev+1 ELSE tracks.rev END,
       asset_at=CASE WHEN excluded.verified=1 AND tracks.verified=1 AND tracks.duration>0 AND excluded.duration>0 AND ABS(excluded.duration-tracks.duration)>=2 THEN excluded.added_at ELSE tracks.asset_at END,
       isrc=COALESCE(tracks.isrc, excluded.isrc),
       artwork=COALESCE(excluded.artwork, tracks.artwork),
       url=CASE WHEN excluded.verified=1 OR tracks.verified=0 THEN COALESCE(excluded.url, tracks.url) ELSE tracks.url END,
       preview=excluded.preview, license=COALESCE(excluded.license, tracks.license),
       downloadable=excluded.downloadable, lang=COALESCE(excluded.lang, tracks.lang),
       genre=COALESCE(excluded.genre, tracks.genre), mood=COALESCE(excluded.mood, tracks.mood),
       year=COALESCE(excluded.year, tracks.year), ext=COALESCE(excluded.ext, tracks.ext),
       verified=MAX(tracks.verified, excluded.verified), dead=0, meta=excluded.meta,
       pop=MAX(tracks.pop, excluded.pop), released_at=COALESCE(excluded.released_at, tracks.released_at)`
  ).bind(
    c.id, c.source, c.kind, c.title, c.artist, c.album, c.duration, c.artwork, c.url, c.preview, c.license,
    c.downloadable, c.lang, c.genre, c.mood, c.year, c.ext, verified, normKey(c), c.meta, Date.now(), c.pop, c.releasedAt, c.isrc || null
  );
}

export const normKey = (c) =>
  `${c.title}|${c.artist}`.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 120);

/** DB row -> API track */
export function trackOut(r) {
  if (!r) return null;
  let meta = {};
  try { meta = JSON.parse(r.meta || '{}'); } catch { /* ignore */ }
  return {
    id: r.id,
    source: r.source,
    kind: r.kind,
    title: r.title,
    artist: r.artist,
    album: r.album,
    duration: r.duration,
    artwork: r.artwork,
    url: r.url,
    preview: !!r.preview,
    license: r.license,
    downloadable: !!r.downloadable,
    lang: r.lang,
    genre: r.genre,
    mood: r.mood,
    year: r.year,
    ext: r.ext,
    verified: !!r.verified,
    pop: r.pop || 0,
    releasedAt: r.released_at || null,
    isrc: r.isrc || null,
    rev: r.rev || 1,
    meta,
  };
}

export const TRACK_COLS = 't.id,t.source,t.kind,t.title,t.artist,t.album,t.duration,t.artwork,t.url,t.preview,t.license,t.downloadable,t.lang,t.genre,t.mood,t.year,t.ext,t.verified,t.meta,t.pop,t.released_at,t.isrc,t.rev';
