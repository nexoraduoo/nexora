// Catalogue endpoints: charts proxy, local (agent-ingested) catalogue search, uploads locker.

import { getSetting, requireAuth, setSetting } from '../auth.js';
import { runIngest } from '../ingest.js';
import { TRACK_COLS, cleanTrack, trackOut, upsertTrackStmt } from '../tracks.js';
import { SOURCES, featured, listCatalog } from '../catalog-queries.js';
import { HttpError, badRequest, forbidden, int, json, notFound, now, randomId, str } from '../util.js';

const MAX_UPLOAD = 100 * 1024 * 1024; // free-plan request body limit
const QUOTA = 2 * 1024 * 1024 * 1024; // 2 GB per user keeps us well inside R2's free 10 GB for a circle
const AUDIO_EXT = /\.(mp3|m4a|aac|flac|wav|ogg|oga|opus|weba|webm)$/i;

function ftsQuery(q) {
  const words = q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 6);
  return words.length ? words.map((w) => `"${w}"*`).join(' ') : null;
}

export const routes = [
  // The catalogue Nexora's agent keeps up to date. Full songs only.
  ['GET', '/api/catalog', async (c) => {
    requireAuth(c);
    const p = c.url.searchParams;
    return {
      tracks: await listCatalog(c.env, {
        q: str(p.get('q') || '', 80), lang: str(p.get('lang') || '', 5).toLowerCase(), genre: str(p.get('genre') || '', 60), mood: str(p.get('mood') || '', 20),
        source: SOURCES.includes(p.get('source')) ? p.get('source') : '', sort: ['best', 'new', 'old'].includes(p.get('sort')) ? p.get('sort') : 'best',
        limit: int(p.get('limit'), 1, 60, 30), offset: int(p.get('offset'), 0, 2000, 0), maxYear: int(p.get('maxYear'), 0, 2100, 0), diverse: !p.get('q'),
      }),
    };
  }],

  // New, best-of-all-time, classics and per-genre shelves for the home screen
  ['GET', '/api/catalog/featured', async (c) => {
    requireAuth(c);
    const f = await featured(c.env);
    // an empty catalogue (first run) starts filling itself right away instead of waiting for the next scheduled run
    if (!f.new.length && !f.best.length) {
      const last = Number(await getSetting(c.env, 'bootstrap_at', '0')) || 0;
      if (now() - last > 20000) {
        await setSetting(c.env, 'bootstrap_at', String(now()));
        c.ctx.waitUntil(runIngest(c.env, { count: 1 }).catch(() => {}));
      }
    }
    return f;
  }],

  // Mark a track unplayable so the agent and UI skip it (called when a stream URL fails)
  ['POST', '/api/catalog/report', async (c) => {
    requireAuth(c);
    const b = await c.body();
    if (typeof b.id === 'string') {
      await c.env.DB.prepare("UPDATE tracks SET dead=1 WHERE id=?1 AND source IN ('audius','jamendo','ia','ccmixter')").bind(b.id).run();
    }
    return { ok: true };
  }],

  // ------------------------------------------------------------------ uploads locker (R2)
  ['GET', '/api/uploads', async (c) => {
    const a = requireAuth(c);
    const { results } = await c.env.DB.prepare(
      `SELECT u.id AS upload_id, u.size, u.filename, u.created_at AS uploaded_at, ${TRACK_COLS}
         FROM uploads u LEFT JOIN tracks t ON t.id=u.track_id WHERE u.user_id=?1 ORDER BY u.created_at DESC`
    ).bind(a.user.id).all();
    const used = results.reduce((s, r) => s + r.size, 0);
    return {
      enabled: !!c.env.FILES, used, quota: QUOTA,
      uploads: results.map((r) => ({ uploadId: r.upload_id, size: r.size, filename: r.filename, uploadedAt: r.uploaded_at, track: r.id ? trackOut(r) : null })),
    };
  }],

  ['POST', '/api/uploads', async (c) => {
    const a = requireAuth(c);
    if (!c.env.FILES) throw new HttpError(501, 'locker_disabled', 'The cloud locker is not enabled on this server. Your files can still be added to this device only.');
    const p = c.url.searchParams;
    const filename = str(p.get('name') || '', 200);
    if (!AUDIO_EXT.test(filename)) throw badRequest('Only audio files (mp3, m4a, flac, wav, ogg, opus) can be uploaded.');
    const size = Number(c.req.headers.get('content-length') || 0);
    if (!size || size > MAX_UPLOAD) throw new HttpError(413, 'too_large', 'Files up to 100 MB are supported.');
    const { used } = await c.env.DB.prepare('SELECT COALESCE(SUM(size),0) AS used FROM uploads WHERE user_id=?1').bind(a.user.id).first();
    if (used + size > QUOTA) throw new HttpError(413, 'quota', 'Your locker is full (2 GB).');

    const id = randomId(10);
    const key = `u/${a.user.id}/${id}`;
    const mime = (c.req.headers.get('content-type') || 'audio/mpeg').split(';')[0].slice(0, 60);
    await c.env.FILES.put(key, c.req.body, { httpMetadata: { contentType: mime } });

    const title = str(p.get('title') || '', 300) || filename.replace(AUDIO_EXT, '');
    const track = cleanTrack({
      id: `up:${id}`, title, artist: p.get('artist') || a.user.displayName, album: p.get('album') || 'My uploads',
      duration: p.get('duration'), artwork: null, url: `/api/files/${id}`, license: 'Your own file', downloadable: true,
    }, { trusted: true });
    await c.env.DB.batch([
      upsertTrackStmt(c.env, track),
      c.env.DB.prepare('INSERT INTO uploads (id,user_id,r2_key,filename,size,mime,track_id,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)')
        .bind(id, a.user.id, key, filename, size, mime, track.id, now()),
    ]);
    return json({ id, track: { ...trackOut({ ...track, verified: 0, dead: 0 }) } }, 201);
  }],

  ['DELETE', '/api/uploads/:id', async (c) => {
    const a = requireAuth(c);
    const u = await c.env.DB.prepare('SELECT * FROM uploads WHERE id=?1 AND user_id=?2').bind(c.params.id, a.user.id).first();
    if (!u) throw notFound();
    await c.env.FILES?.delete(u.r2_key);
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM uploads WHERE id=?1').bind(u.id),
      c.env.DB.prepare('DELETE FROM tracks WHERE id=?1').bind(u.track_id),
    ]);
    return { ok: true };
  }],

  // stream with Range support (seeking) - owner only
  ['GET', '/api/files/:id', async (c) => streamFile(c)],
  ['HEAD', '/api/files/:id', async (c) => streamFile(c)],
];

async function streamFile(c) {
  const a = requireAuth(c);
  if (!c.env.FILES) throw notFound();
  const u = await c.env.DB.prepare('SELECT * FROM uploads WHERE id=?1').bind(c.params.id).first();
  if (!u) throw notFound();
  if (u.user_id !== a.user.id) {
    // allow playback if the file sits in a playlist I can access
    const ok = await c.env.DB.prepare(
      `SELECT 1 FROM playlist_tracks pt JOIN playlists p ON p.id=pt.playlist_id
        WHERE pt.track_id=?1 AND (p.is_public=1 OR p.share_token IS NOT NULL) LIMIT 1`
    ).bind(u.track_id).first();
    if (!ok) throw forbidden();
  }
  const range = c.req.headers.get('range');
  const obj = await c.env.FILES.get(u.r2_key, range ? { range: c.req.headers } : undefined);
  if (!obj) throw notFound();
  const headers = new Headers({
    'content-type': u.mime, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600',
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(u.filename)}`,
  });
  if (obj.range && range) {
    const { offset = 0, length = obj.size - offset } = obj.range;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set('content-length', String(length));
    return new Response(c.req.method === 'HEAD' ? null : obj.body, { status: 206, headers });
  }
  headers.set('content-length', String(obj.size));
  return new Response(c.req.method === 'HEAD' ? null : obj.body, { status: 200, headers });
}
