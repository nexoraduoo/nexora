// Nexora Catalogue Agent (v2): full-length music only, kept fresh without any manual work.
//
// Every 2 minutes (and whenever the owner presses "Run now") it takes the next task from a rotation:
//   - BEST   the most-played songs of all time on each source / genre, paging deeper every cycle
//   - NEW    what was released this week / this month
//   - OLD    the oldest openly licensed recordings (public domain and Creative Commons)
//   - RADIO  live stations per language
// Each song is checked, tidied and tagged (language, mood) before it joins the catalogue; songs
// already known are skipped, so most runs cost almost nothing.
//
// What "verified" means: it came from a source whose terms allow streaming it, has licence information,
// a secure stream URL and a sane duration, is not spam, and is a FULL song (30-second previews are
// refused). Free-plan note: a scheduled run may use only 10 ms of CPU, so each run does one task.

import * as S from '../public/js/shared/sources.js';
import { cleanTrack, normKey, upsertTrackStmt } from './tracks.js';
import { getSetting, setSetting } from './auth.js';
import { now } from './util.js';

const AUDIUS_GENRES = ['Electronic', 'Hip-Hop/Rap', 'Pop', 'Rock', 'Alternative', 'Jazz', 'Lo-Fi', 'R&B/Soul', 'Folk', 'Ambient', 'Latin', 'Reggae', 'Classical', 'Devotional', 'World', 'Acoustic', 'Funk', 'Blues', 'Metal', 'Punk', 'Country', 'Soundtrack', 'Dancehall', 'Hyperpop'];
const RADIO_LANGS = ['telugu', 'hindi', 'tamil', 'kannada', 'malayalam', 'punjabi', 'bengali', 'marathi', 'gujarati', 'urdu', 'english', 'spanish', 'portuguese', 'french', 'german', 'korean', 'japanese', 'arabic', 'turkish', 'russian', 'italian', 'indonesian', 'thai', 'persian'];
const JAMENDO_TAGS = ['lofi', 'chillout', 'acoustic', 'jazz', 'electronic', 'rock', 'classical', 'ambient', 'hiphop', 'pop', 'world', 'indie', 'folk', 'blues', 'reggae', 'soundtrack'];

/** One flat list, interleaved so every kind of task comes up regularly. */
export function buildTasks({ jamendoKey } = {}) {
  const groups = [
    // best of all time, per genre (null = all genres)
    [null, ...AUDIUS_GENRES].map((genre) => ({ kind: 'audius', mode: 'best', time: 'allTime', genre })),
    // new this week / month
    [null, ...AUDIUS_GENRES].flatMap((genre) => [{ kind: 'audius', mode: 'new', time: 'week', genre }, { kind: 'audius', mode: 'new', time: 'month', genre }]),
    // the Archive: best-loved, newest, oldest. Repeated within a cycle, each repeat one page deeper.
    reps({ kind: 'ia', mode: 'best', sort: 'downloads desc' }, 6),
    reps({ kind: 'ia', mode: 'new', sort: 'publicdate desc' }, 2),
    reps({ kind: 'ia', mode: 'old', sort: 'downloads desc', before: 1989 }, 8),
    reps({ kind: 'ia', mode: 'old', sort: 'downloads desc', before: 1959 }, 6),
    reps({ kind: 'ccmixter', mode: 'best', sort: 'rank' }, 4),
    reps({ kind: 'ccmixter', mode: 'new', sort: 'date' }, 2),
    RADIO_LANGS.map((language) => ({ kind: 'radio', mode: 'radio', language })),
  ];
  if (jamendoKey) {
    groups.push(JAMENDO_TAGS.flatMap((tag) => [{ kind: 'jamendo', mode: 'best', tag, order: 'popularity_total' }, { kind: 'jamendo', mode: 'new', tag, order: 'releasedate_desc' }]));
    groups.push([{ kind: 'jamendo', mode: 'best', tag: '', order: 'popularity_total' }, { kind: 'jamendo', mode: 'new', tag: '', order: 'releasedate_desc' }]);
  }
  const tasks = [];
  const longest = Math.max(...groups.map((g) => g.length));
  for (let i = 0; i < longest; i++) for (const g of groups) if (g[i]) tasks.push(g[i]);
  return tasks;
}

const reps = (base, n) => Array.from({ length: n }, (_, rep) => ({ ...base, rep, reps: n }));

export const label = (t) => `${t.kind}:${t.mode}${t.genre ? `/${t.genre}` : ''}${t.tag ? `/${t.tag}` : ''}${t.language ? `/${t.language}` : ''}${t.sort ? `/${t.sort.split(' ')[0]}` : ''}${t.before ? `/before${t.before}` : ''}`;

const JUNK = /\b(karaoke|ringtone|8d audio|slowed\s*\+?\s*reverb|nightcore|type beat|loop pack|sample pack|royalty free|no copyright|free download|prod\.? by|dl link|buy now|audiobooks?|interviews?|lecture|podcast|sermon|talk show|chapter \d+|unit \d+|tape \d|lesson|yt1s|y2mate|ytmp3|savefrom|foreign service institute|language course|bedtime stor(?:y|ies))\b/i;

/** Returns null when the track passes, otherwise the reason it was rejected. */
export function verifyTrack(t) {
  if (!t || !t.id || !t.title || !t.title.trim()) return 'missing title';
  if (t.preview) return '30-second preview (full songs only)';
  if (!t.url || !/^https:\/\//i.test(t.url)) return 'no secure stream url';
  if (!t.license) return 'no licence information';
  if (JUNK.test(`${t.title} ${t.album || ''}`)) return 'spam / non-music pattern';
  if (t.kind === 'track') {
    if (t.duration && t.duration < 25) return 'too short to be a song';
    if (t.duration > 3 * 3600) return 'too long';
    if (!t.artist) return 'missing artist';
  }
  return null;
}

/** "ARTIST - Title [FREE DL] 🔥" -> "Title" */
export function tidyTitle(title = '', artist = '') {
  let s = String(title).replace(/\p{Extended_Pictographic}/gu, ' ').replace(/\[(?:free[^\]]*|fd|dl|out now|prod[^\]]*|official[^\]]*)\]/gi, ' ').replace(/\((?:free[^)]*|official[^)]*|out now|prod[^)]*)\)/gi, ' ');
  if (artist) {
    const a = artist.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`^\\s*${a}\\s*[-–:]\\s*`, 'i'), '');
  }
  s = s.replace(/^\s*\d{1,3}\s*[.)\-–]\s+/, ''); // "01. Song" -> "Song"
  s = s.replace(/\s{2,}/g, ' ').replace(/^[\s\-–:|]+|[\s\-–:|]+$/g, '');
  return s || String(title).trim();
}

const MOODS = [
  ['chill', /\b(lo-?fi|chill|relax|ambient|calm|peaceful|sleep|rain|meditat|spa)\b/i],
  ['party', /\b(party|club|dance|edm|banger|festival|house|bass)\b/i],
  ['energy', /\b(workout|gym|run|power|energy|hype|pump|trap|metal|punk)\b/i],
  ['romance', /\b(love|romantic|romance|heart|kiss|ishq|pyaar|prema|amor)\b/i],
  ['sad', /\b(sad|cry|broken|tears|lonely|miss you|heartbreak|dard|judaai)\b/i],
  ['devotional', /\b(bhakti|devotional|gospel|hymn|bhajan|aarti|worship|krishna|shiva|venkatesh|ram)\b/i],
  ['focus', /\b(focus|study|piano|instrumental|classical|concentration|work)\b/i],
  ['happy', /\b(happy|sunshine|summer|joy|smile|good vibes|feel good)\b/i],
];
const AUDIUS_MOOD = { Peaceful: 'chill', Serene: 'chill', Tender: 'romance', Romantic: 'romance', Yearning: 'sad', Sentimental: 'sad', Melancholy: 'sad', Energizing: 'energy', Aggressive: 'energy', Rowdy: 'energy', Fiery: 'energy', Empowering: 'energy', Upbeat: 'happy', Easygoing: 'chill', Cool: 'chill', Gritty: 'energy', Sensual: 'romance', Brooding: 'sad', Defiant: 'energy', Excited: 'party', Stirring: 'energy', Sophisticated: 'focus', Other: null };

export function moodOf(t) {
  if (t.mood && AUDIUS_MOOD[t.mood] !== undefined) return AUDIUS_MOOD[t.mood];
  const text = `${t.title} ${t.album || ''} ${t.genre || ''}`;
  for (const [m, re] of MOODS) if (re.test(text)) return m;
  return null;
}

/** paging: each full cycle through the task list digs deeper into the ranked lists */
export async function runTask(task, { jamendoKey, round = 0 } = {}) {
  // position in this list's paging: grows by one page per cycle (and by `rep` within a cycle)
  // ("new" lists always stay at the front: only their repeat index pages)
  const deep = task.mode === 'new' ? (task.rep || 0) : round * (task.reps || 1) + (task.rep || 0);
  switch (task.kind) {
    case 'audius': return S.audiusTrending(task.genre || undefined, { limit: 40, time: task.time, offset: (deep % 8) * 40 });
    case 'jamendo': return S.jamendoSearch('', { key: jamendoKey, limit: 40, tags: task.tag || undefined, order: task.order, offset: (deep % 8) * 40 });
    case 'ccmixter': return S.ccmixterBrowse({ sort: task.sort, limit: 20, offset: (deep % 40) * 20 });
    case 'radio': return S.radioSearch({ language: task.language, limit: 25 });
    case 'ia': {
      const items = await S.iaBrowse({ sort: task.sort, page: (deep % 120) + 1, rows: task.before ? 3 : 2, before: task.before || 0 });
      const out = [];
      for (const it of items) {
        try {
          const album = await S.iaAlbum(it.id, { pop: it.downloads, releasedAt: Date.parse(it.publicdate || it.date || '') || null });
          out.push(...(album?.tracks || []).slice(0, 14));
        } catch { /* a dead item is skipped */ }
      }
      return out;
    }
    default: return [];
  }
}

/** Optional: if the Workers AI binding is enabled, let a small model guess language + mood. */
async function aiTag(env, tracks) {
  if (!env.AI || !tracks.length) return;
  const todo = tracks.filter((t) => !t.lang || !t.mood).slice(0, 20);
  if (!todo.length) return;
  try {
    const list = todo.map((t, i) => `${i}. ${t.title} - ${t.artist}`).join('\n');
    const res = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You label songs. Reply with ONLY a JSON array like [{"i":0,"lang":"en","mood":"chill"}]. lang = ISO 639-1 code of the sung language or null. mood is one of chill, party, energy, romance, sad, devotional, focus, happy or null.' },
        { role: 'user', content: list },
      ],
      max_tokens: 600,
    });
    const arr = JSON.parse((res.response || '').match(/\[[\s\S]*\]/)?.[0] || '[]');
    const ok = new Set(['chill', 'party', 'energy', 'romance', 'sad', 'devotional', 'focus', 'happy']);
    for (const r of arr) {
      const t = todo[r.i];
      if (!t) continue;
      if (!t.lang && typeof r.lang === 'string' && /^[a-z]{2}$/.test(r.lang)) t.lang = r.lang;
      if (!t.mood && ok.has(r.mood)) t.mood = r.mood;
    }
  } catch { /* AI is a bonus; never fail a run because of it */ }
}

/** Run `count` tasks (1 on the free plan). Returns a summary and logs it in ingest_runs. */
export async function runIngest(env, { count = 1, lane = 'all' } = {}) {
  const jamendoKey = await getSetting(env, 'jamendo_key');
  // the "fresh" lane only looks at newest-first lists, so a song that was just released is found within minutes
  const tasks = buildTasks({ jamendoKey }).filter((t) => lane !== 'fresh' || t.mode === 'new');
  const cursorKey = lane === 'fresh' ? 'ingest_cursor_fresh' : 'ingest_cursor';
  let cursor = Number(await getSetting(env, cursorKey, '0')) || 0;
  const summaries = [];

  for (let n = 0; n < count; n++) {
    const task = tasks[cursor % tasks.length];
    const round = Math.floor(cursor / tasks.length);
    cursor++;
    const started = now();
    let fetched = 0, accepted = 0, rejected = 0, note = '';
    try {
      const raw = await runTask(task, { jamendoKey, round });
      fetched = raw.length;
      const reasons = {};
      const good = [];
      for (const t of raw) {
        const why = verifyTrack(t);
        if (why) { rejected++; reasons[why] = (reasons[why] || 0) + 1; continue; }
        t.title = tidyTitle(t.title, t.artist);
        t.mood = moodOf(t);
        good.push(t);
      }
      await aiTag(env, good);

      const clean = good.map((t) => cleanTrack(t)).filter(Boolean);
      // skip what we already hold: same id, or the same song (title + artist) from the same source
      const ids = clean.map((t) => t.id).slice(0, 90);
      const have = new Map();
      const haveRow = new Map();
      if (ids.length) {
        const q = await env.DB.prepare(`SELECT id, verified, duration, rev FROM tracks WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
        for (const r of q.results) { have.set(r.id, r.verified); haveRow.set(r.id, r); }
      }
      // the same recording (ISRC) already held under another id is a duplicate, not a new song
      const isrcs = [...new Set(clean.map((t) => t.isrc).filter(Boolean))].slice(0, 90);
      const isrcOwner = new Map();
      if (isrcs.length) {
        const q = await env.DB.prepare(`SELECT isrc, id FROM tracks WHERE verified=1 AND isrc IN (${isrcs.map(() => '?').join(',')})`).bind(...isrcs).all();
        for (const r of q.results) isrcOwner.set(r.isrc, r.id);
      }
      const keys = [...new Set(clean.filter((t) => t.kind === 'track').map(normKey))].slice(0, 90);
      const dupKeys = new Set();
      if (keys.length) {
        const q = await env.DB.prepare(`SELECT norm_key FROM tracks WHERE verified=1 AND preview=0 AND norm_key IN (${keys.map(() => '?').join(',')})`).bind(...keys).all();
        for (const r of q.results) dupKeys.add(r.norm_key);
      }
      const fresh = [];
      const seen = new Set();
      const updates = [];
      for (const t of clean) {
        if (have.get(t.id) === 1) {
          // already in the catalogue: but if the source now serves a different-length recording, that is a replaced master
          const row = haveRow.get(t.id);
          if (row && row.duration > 0 && t.duration > 0 && Math.abs(row.duration - t.duration) >= 2) updates.push({ t, rev: row.rev + 1 });
          continue;
        }
        if (t.isrc && isrcOwner.has(t.isrc) && isrcOwner.get(t.isrc) !== t.id) { rejected++; reasons.duplicate = (reasons.duplicate || 0) + 1; continue; }
        const k = normKey(t);
        if (t.kind === 'track' && !have.has(t.id) && (seen.has(k) || dupKeys.has(k))) { rejected++; reasons.duplicate = (reasons.duplicate || 0) + 1; continue; }
        seen.add(k);
        fresh.push(t);
      }
      const stmts = fresh.map((t) => upsertTrackStmt(env, t, { verified: 1 }));
      for (const u of updates) {
        stmts.push(upsertTrackStmt(env, u.t, { verified: 1 }));
        stmts.push(env.DB.prepare('INSERT INTO asset_log (at, action, track_id, isrc, rev, detail, by_user) VALUES (?1,?2,?3,?4,?5,?6,?7)').bind(now(), 'AutoUpdate', u.t.id, u.t.isrc || null, u.rev, `audio length changed to ${u.t.duration}s`, 'agent'));
      }
      for (let i = 0; i < stmts.length; i += 40) await env.DB.batch(stmts.slice(i, i + 40));
      accepted = fresh.length;
      note = [updates.length ? `updated ${updates.length} replaced recording(s)` : '', Object.keys(reasons).length ? `skipped: ${Object.entries(reasons).map(([k, v]) => `${k} x${v}`).join(', ')}` : ''].filter(Boolean).join('; ');
    } catch (e) {
      note = `error: ${String(e.message || e).slice(0, 180)}`;
    }
    await env.DB.prepare('INSERT INTO ingest_runs (started_at,finished_at,task,fetched,accepted,rejected,note) VALUES (?1,?2,?3,?4,?5,?6,?7)')
      .bind(started, now(), label(task), fetched, accepted, rejected, note).run();
    summaries.push({ task: label(task), fetched, accepted, rejected, note });
  }
  const added = summaries.reduce((s, r) => s + r.accepted, 0);
  if (added) await setSetting(env, 'catalog_total', String((Number(await getSetting(env, 'catalog_total', '0')) || 0) + added));
  await setSetting(env, cursorKey, String(cursor % 1_000_000));
  await env.DB.prepare('DELETE FROM ingest_runs WHERE id NOT IN (SELECT id FROM ingest_runs ORDER BY id DESC LIMIT 200)').run();
  return summaries;
}
