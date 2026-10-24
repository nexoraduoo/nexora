// The world catalogue: a free, open index of (almost) every recording and release, with ISRCs.
//
//   MusicBrainz   : the open music encyclopedia. Every recording, release and artist, with ISRCs. No key, no cost.
//   ListenBrainz  : lists the releases that just came out ("fresh releases"), including those from the big distributors
//                   as soon as they are added to MusicBrainz (usually within hours, bots import them from the stores).
//   Cover Art Archive : artwork for those releases.
//
// This is an INDEX (names, dates, ISRCs, artwork). It cannot contain the audio of commercial songs: that belongs to the
// labels and is licensed. Playing a world entry works like this (see playFor): full song if the open catalogue has the same
// recording, otherwise a 30-second preview from Apple, otherwise links to the services that do hold it.

import { HttpError, now } from './util.js';

const UA = 'Nexora/1.0 (personal music app; nexora.duoo@gmail.com)';
const MB = 'https://musicbrainz.org/ws/2';
const LB = 'https://api.listenbrainz.org/1';
const DAY = 86_400_000;

export const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
export const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** GET json with a D1 cache in front, so we stay far below MusicBrainz's "about 1 request per second". */
async function cached(env, key, ttl, url, { fetchFn = fetch } = {}) {
  const hit = await env.DB.prepare('SELECT body, at FROM world_cache WHERE key=?1').bind(key).first();
  if (hit && now() - hit.at < ttl) return JSON.parse(hit.body);
  let res;
  try { res = await fetchFn(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }); } catch { res = null; }
  if (!res || res.status === 503 || res.status === 429) {
    if (hit) return JSON.parse(hit.body); // stale is better than nothing
    throw new HttpError(503, 'busy', 'The open music database is busy. Try again in a few seconds.');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(502, 'upstream', 'The open music database could not answer right now.');
  const text = await res.text();
  if (text.length < 900_000) await env.DB.prepare('INSERT OR REPLACE INTO world_cache (key, body, at) VALUES (?1,?2,?3)').bind(key, text, now()).run();
  return JSON.parse(text);
}

const credit = (ac) => (ac || []).map((c) => `${c.name || c.artist?.name || ''}${c.joinphrase || ''}`).join('').trim() || 'Unknown artist';
const cover = (releaseMbid, size = 250) => (releaseMbid ? `https://coverartarchive.org/release/${releaseMbid}/front-${size}` : null);

/** A MusicBrainz recording -> a Nexora track (no audio yet: `url` stays empty until it is played). */
export function recordingToTrack(r) {
  const rel = (r.releases || [])[0] || null;
  const year = Number(String(r['first-release-date'] || rel?.date || '').slice(0, 4)) || null;
  const date = String(r['first-release-date'] || rel?.date || '');
  return {
    id: `mb:${r.id}`,
    source: 'mb',
    kind: 'track',
    title: r.title,
    artist: credit(r['artist-credit']),
    album: rel?.title || '',
    duration: r.length ? Math.round(r.length / 1000) : 0,
    artwork: cover(rel?.id),
    url: null,
    preview: false,
    license: 'Listing only',
    downloadable: false,
    isrc: (r.isrcs || [])[0] || null,
    year,
    releasedAt: /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date) : null,
    meta: { releaseId: rel?.id || null, allIsrcs: (r.isrcs || []).slice(0, 5) },
  };
}

const esc = (w) => w.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ').trim();

/** "tum hi ho arijit" -> every word must appear in the title, the artist or the album. */
export function buildQuery(q) {
  const s = q.trim();
  const isrc = s.replace(/[-\s]/g, '').toUpperCase();
  if (ISRC_RE.test(isrc)) return `isrc:${isrc}`;
  const words = esc(s).split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return '';
  return words.map((w) => `(recording:"${w}" OR artist:"${w}" OR release:"${w}")`).join(' AND ');
}

export async function searchWorld(env, q, { page = 0 } = {}) {
  const query = buildQuery(q);
  if (!query) return { tracks: [], total: 0 };
  const offset = Math.max(0, Math.min(page, 20)) * 25;
  const j = await cached(env, `s:${query}:${offset}`, DAY, `${MB}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=25&offset=${offset}`);
  const seen = new Map();
  for (const r of j?.recordings || []) {
    const t = recordingToTrack(r);
    const k = `${t.title}|${t.artist}`.toLowerCase();
    const old = seen.get(k);
    // the same song appears many times (albums, compilations, live): keep the one with an ISRC, then the earliest
    if (!old || (!old.isrc && t.isrc) || (!!old.isrc === !!t.isrc && (t.year || 9999) < (old.year || 9999))) seen.set(k, t);
  }
  return { tracks: [...seen.values()], total: j?.count || 0 };
}

export async function recordingsByIsrc(env, isrc) {
  const j = await cached(env, `i:${isrc}`, 7 * DAY, `${MB}/recording?query=${encodeURIComponent(`isrc:${isrc}`)}&fmt=json&limit=10`);
  return (j?.recordings || []).map(recordingToTrack);
}

export async function releaseDetail(env, mbid) {
  const j = await cached(env, `r:${mbid}`, 7 * DAY, `${MB}/release/${mbid}?inc=recordings+artist-credits+isrcs+release-groups&fmt=json`);
  if (!j) return null;
  const tracks = [];
  for (const m of j.media || []) {
    for (const t of m.tracks || []) {
      const rec = t.recording || {};
      tracks.push({
        id: `mb:${rec.id}`, source: 'mb', kind: 'track', title: t.title || rec.title,
        artist: credit(t['artist-credit'] || rec['artist-credit']), album: j.title,
        duration: Math.round((t.length || rec.length || 0) / 1000), artwork: cover(j.id, 500), url: null, preview: false,
        license: 'Listing only', downloadable: false, isrc: (rec.isrcs || [])[0] || null,
        year: Number(String(j.date || '').slice(0, 4)) || null, meta: { releaseId: j.id, trackNumber: t.position },
      });
    }
  }
  return { release: { mbid: j.id, name: j.title, artist: credit(j['artist-credit']), date: j.date || '', kind: j['release-group']?.['primary-type'] || '', cover: cover(j.id, 500), country: j.country || '' }, tracks };
}

// ------------------------------------------------------------------ what just came out
/** Pull the newest releases from ListenBrainz into our own table. Cheap: one request, a few dozen rows. */
export async function syncWorld(env, { force = false, fetchFn = fetch } = {}) {
  const last = Number((await env.DB.prepare("SELECT value FROM settings WHERE key='world_sync'").first())?.value || 0);
  if (!force && now() - last < 4 * 60_000) return 0;
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('world_sync', ?1)").bind(String(now())).run();
  const res = await fetchFn(`${LB}/explore/fresh-releases/?days=2&sort=release_date&past=true&future=false`, { headers: { 'User-Agent': UA } }).catch(() => null);
  if (!res || !res.ok) return 0;
  const j = await res.json().catch(() => null);
  const list = (j?.payload?.releases || []).filter((r) => MBID_RE.test(r.release_mbid || '') && r.release_name)
    .sort((x, y) => (y.listen_count || 0) - (x.listen_count || 0)).slice(0, 150); // the ones people already listen to first
  if (!list.length) return 0;
  const stmts = list.map((r) => env.DB.prepare('INSERT OR IGNORE INTO world_releases (mbid, group_mbid, name, artist, release_date, kind, caa_mbid, listens, added_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)')
    .bind(r.release_mbid, r.release_group_mbid || null, String(r.release_name).slice(0, 200), String(r.artist_credit_name || 'Unknown artist').slice(0, 200), r.release_date || null, r.release_group_primary_type || null, r.caa_release_mbid || r.release_mbid, r.listen_count || 0, now()));
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  await env.DB.prepare('DELETE FROM world_releases WHERE added_at < ?1').bind(now() - 60 * DAY).run();
  await env.DB.prepare('DELETE FROM world_cache WHERE at < ?1').bind(now() - 8 * DAY).run();
  return list.length;
}

export async function newReleases(env, { limit = 40, sync = syncWorld } = {}) {
  let { results } = await env.DB.prepare('SELECT mbid, name, artist, release_date, kind, caa_mbid, listens FROM world_releases ORDER BY release_date DESC, listens DESC LIMIT ?1').bind(limit).all();
  if (!results.length) { await sync(env, { force: true }); ({ results } = await env.DB.prepare('SELECT mbid, name, artist, release_date, kind, caa_mbid, listens FROM world_releases ORDER BY release_date DESC, listens DESC LIMIT ?1').bind(limit).all()); }
  return results.map((r) => ({ mbid: r.mbid, name: r.name, artist: r.artist, date: r.release_date, kind: r.kind, cover: cover(r.caa_mbid, 500), listens: r.listens }));
}

// ------------------------------------------------------------------ how to actually hear a world entry
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');

/** Find audio for a recording: (1) the same recording in the open catalogue (full song), (2) Apple's 30-second preview. */
export async function playFor(env, { isrc, title, artist }, { fetchFn = fetch } = {}) {
  const key = `${title}|${artist}`.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 120);
  const full = await env.DB.prepare('SELECT id, title, artist, album, duration, artwork, url, license, downloadable, lang, genre, year, ext, meta FROM tracks WHERE verified=1 AND dead=0 AND preview=0 AND url IS NOT NULL AND (isrc=?1 OR norm_key=?2) ORDER BY pop DESC LIMIT 1')
    .bind(isrc || '', key).first().catch(() => null);
  if (full) return { kind: 'full', source: full.id.split(':')[0], track: { id: full.id, title: full.title, artist: full.artist, album: full.album, duration: full.duration, artwork: full.artwork, url: full.url, license: full.license, downloadable: !!full.downloadable, lang: full.lang, genre: full.genre, year: full.year, ext: full.ext } };

  const term = `${title} ${artist}`.slice(0, 120);
  const j = await cached(env, `p:${norm(term)}`, 3 * DAY, `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=8`, { fetchFn }).catch(() => null);
  const want = norm(title), who = norm(artist);
  const hit = (j?.results || []).find((x) => x.previewUrl && (norm(x.trackName) === want || norm(x.trackName).startsWith(want) || want.startsWith(norm(x.trackName))) && (who.includes(norm(x.artistName).slice(0, 8)) || norm(x.artistName).includes(who.slice(0, 8))));
  if (hit) {
    return {
      kind: 'preview', source: 'itunes',
      track: { url: hit.previewUrl, duration: 30, artwork: (hit.artworkUrl100 || '').replace('100x100', '600x600') || null, ext: hit.trackViewUrl || null, genre: hit.primaryGenreName || null, explicit: hit.trackExplicitness === 'explicit' },
    };
  }
  return { kind: 'none' };
}
