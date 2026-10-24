// Reads from Nexora's own catalogue (what the agent has verified). Written to stay cheap on the free
// database plan: every query walks an index and reads only the rows it returns.

import { TRACK_COLS, trackOut } from './tracks.js';
import { getSetting, setSetting } from './auth.js';
import { now } from './util.js';

export const SOURCES = ['audius', 'jamendo', 'ia', 'ccmixter'];
const BASE = "t.verified=1 AND t.preview=0 AND t.dead=0 AND t.kind='track'";
const ORDER = { best: 't.pop DESC', new: 't.released_at DESC', old: 't.year ASC' };
const EXTRA = { new: ' AND t.released_at IS NOT NULL', old: ' AND t.year IS NOT NULL AND t.year>0' };

function ftsQuery(q) {
  const words = q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 6);
  return words.length ? words.map((w) => `"${w}"*`).join(' ') : null;
}

/** Take one from each list in turn, so no single source can crowd out the others. */
export function interleave(lists, limit, maxPerArtist = 0) {
  const out = [];
  const seen = new Set();
  const perArtist = new Map();
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const t = l[i];
      if (!t || seen.has(t.id)) continue;
      const a = String(t.artist || '').toLowerCase();
      if (maxPerArtist && (perArtist.get(a) || 0) >= maxPerArtist) continue;
      seen.add(t.id); perArtist.set(a, (perArtist.get(a) || 0) + 1); out.push(t);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * sort: 'best' (most played of all time) | 'new' (most recently released) | 'old' (oldest recordings)
 * Filters: q (search), lang, genre, source, maxYear. Results are interleaved across sources.
 */
export async function listCatalog(env, { q = '', lang = '', genre = '', mood = '', source = '', sort = 'best', limit = 30, offset = 0, maxYear = 0, diverse = false } = {}) {
  if (sort === 'old' && !maxYear) maxYear = 1989; // "old" means recorded before 1990
  const where = [BASE];
  const args = [];
  if (lang) { where.push('t.lang=?'); args.push(lang); }
  if (genre) { where.push('t.genre=?'); args.push(genre); }
  if (mood) { where.push('t.mood=?'); args.push(mood); }
  if (maxYear) { where.push('t.year IS NOT NULL AND t.year<=?'); args.push(maxYear); }

  const fts = q && ftsQuery(q);
  if (fts) {
    try {
      const r = await env.DB.prepare(`SELECT ${TRACK_COLS} FROM tracks_fts f JOIN tracks t ON t.rowid=f.rowid WHERE tracks_fts MATCH ? AND ${where.join(' AND ')}${source ? ' AND t.source=?' : ''} ORDER BY rank LIMIT ? OFFSET ?`)
        .bind(fts, ...args, ...(source ? [source] : []), limit, offset).all();
      return r.results.map(trackOut);
    } catch { /* FTS unavailable: fall through to LIKE */ }
  }
  const like = q ? ' AND (t.title LIKE ? OR t.artist LIKE ?)' : '';
  const likeArgs = q ? [`%${q}%`, `%${q}%`] : [];
  const order = ORDER[sort] || ORDER.best;
  const sources = source ? [source] : SOURCES;
  const per = (Math.ceil(limit / sources.length) + 1) * (diverse ? 4 : 1);
  const off = Math.floor(offset / sources.length);
  const lists = await Promise.all(sources.map(async (s) => {
    const r = await env.DB.prepare(`SELECT ${TRACK_COLS} FROM tracks t WHERE ${where.join(' AND ')} AND t.source=?${EXTRA[sort] || ''}${like} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .bind(...args, s, ...likeArgs, per, off).all();
    return r.results.map(trackOut);
  }));
  return interleave(lists, limit, diverse ? 2 : 0);
}

const FEATURED_GENRES = ['Electronic', 'Hip-Hop/Rap', 'Pop', 'Rock', 'Jazz', 'Lo-Fi', 'R&B/Soul', 'Folk'];
const TTL = 5 * 60 * 1000;

/** The home-screen bundle. Cached in the settings table for five minutes. */
export async function featured(env) {
  const at = Number(await getSetting(env, 'featured_at', '0')) || 0;
  if (now() - at < TTL) {
    const cached = await getSetting(env, 'featured_cache');
    if (cached) { try { return JSON.parse(cached); } catch { /* rebuild */ } }
  }
  const [fresh, best, classics, oldest, classical, jazz, blues, ...genres] = await Promise.all([
    listCatalog(env, { sort: 'new', limit: 24, diverse: true }),
    listCatalog(env, { sort: 'best', limit: 24, diverse: true }),
    listCatalog(env, { sort: 'best', maxYear: 1989, limit: 14, diverse: true }),
    listCatalog(env, { sort: 'old', limit: 8, diverse: true }),
    listCatalog(env, { sort: 'best', genre: 'Classical', limit: 8 }),
    listCatalog(env, { sort: 'best', genre: 'Jazz', limit: 8 }),
    listCatalog(env, { sort: 'best', genre: 'Blues', limit: 6 }),
    ...FEATURED_GENRES.map((g) => listCatalog(env, { sort: 'best', genre: g, limit: 14, diverse: true })),
  ]);
  const out = {
    new: fresh,
    best,
    classics: interleave([classics, oldest, classical, jazz, blues], 28, 2),
    genres: FEATURED_GENRES.map((genre, i) => ({ genre, tracks: genres[i] })).filter((g) => g.tracks.length >= 4),
    total: Number(await getSetting(env, 'catalog_total', '0')) || 0,
    updatedAt: now(),
  };
  if (out.new.length || out.best.length) { // never cache an empty first-run result
    await setSetting(env, 'featured_cache', JSON.stringify(out));
    await setSetting(env, 'featured_at', String(now()));
  }
  return out;
}
