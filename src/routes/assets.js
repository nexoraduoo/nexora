// Asset updates: how a recording's audio is replaced without breaking anything that points at it.
//
// The idea comes from how the big services work: a recording has one permanent identity (the ISRC) and the
// audio behind it is a pointer. A delivery says "Action: UpdateAsset, ISRC: ..., Audio: <file>", the pointer is
// swapped, and every playlist, like and history entry keeps working because they refer to the track, not the file.
// Devices that saved an old copy compare revision numbers and refresh it.
//
//   GET  /api/tracks/assets?ids=a,b,c   any signed-in user: current revision + audio address of tracks
//   POST /api/admin/assets              owner: one delivery { action, id | isrc, ... }  (see ACTIONS)
//   GET  /api/admin/assets              owner: the latest changes

import { requireAuth } from '../auth.js';
import { cleanIsrc } from '../tracks.js';
import { badRequest, forbidden, notFound, now, str } from '../util.js';

const ACTIONS = ['UpdateAsset', 'UpdateMetadata', 'TakeDown'];
const ID_LIST = /^[\w\-./%~@+: ]{1,320}$/;

const httpsOrLocal = (v) => typeof v === 'string' && v.length <= 2000 && (v.startsWith('/api/files/') || /^https:\/\/[^\s]+$/i.test(v));

function owner(c) {
  const a = requireAuth(c);
  if (a.user.role !== 'admin') throw forbidden('Only the owner can do that.');
  return a;
}

export const routes = [
  ['GET', '/api/tracks/assets', async (c) => {
    requireAuth(c);
    const ids = String(c.url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter((s) => ID_LIST.test(s)).slice(0, 100);
    if (!ids.length) return { assets: {} };
    const { results } = await c.env.DB.prepare(`SELECT id, rev, url, duration, dead, verified FROM tracks WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    const assets = {};
    for (const r of results) assets[r.id] = { rev: r.rev || 1, url: r.url, duration: r.duration, gone: !!r.dead };
    return { assets };
  }],

  ['POST', '/api/admin/assets', async (c) => {
    const a = owner(c);
    const b = await c.body();
    if (!ACTIONS.includes(b.action)) throw badRequest(`action must be one of: ${ACTIONS.join(', ')}`);
    const isrc = b.isrc ? cleanIsrc(b.isrc) : null;
    if (b.isrc && !isrc) throw badRequest('That is not a valid ISRC (two letters, three letters or digits, then seven digits).');
    const id = typeof b.id === 'string' ? b.id.trim() : '';
    if (!id && !isrc) throw badRequest('Give the track id or its ISRC.');

    const { results: rows } = id
      ? await c.env.DB.prepare('SELECT id, isrc, rev, url, duration FROM tracks WHERE id=?1').bind(id).all()
      : await c.env.DB.prepare('SELECT id, isrc, rev, url, duration FROM tracks WHERE isrc=?1').bind(isrc).all();
    if (!rows.length) throw notFound('No track with that id / ISRC is in the catalogue.');

    const at = now();
    const stmts = [];
    const out = [];
    for (const r of rows) {
      let rev = r.rev || 1;
      let detail = '';
      if (b.action === 'UpdateAsset') {
        if (!httpsOrLocal(b.audioUrl)) throw badRequest('audioUrl must be an https:// address.');
        const dur = Number.isFinite(Number(b.duration)) && Number(b.duration) > 0 ? Math.min(86400, Math.round(Number(b.duration))) : r.duration;
        rev += 1;
        // the same ISRC may be attached to this row now
        stmts.push(c.env.DB.prepare('UPDATE tracks SET url=?2, duration=?3, rev=?4, asset_at=?5, dead=0, verified=1, isrc=COALESCE(isrc, ?6) WHERE id=?1').bind(r.id, b.audioUrl, dur, rev, at, isrc));
        detail = `audio now ${b.audioUrl.slice(0, 120)}`;
      } else if (b.action === 'UpdateMetadata') {
        const sets = [], vals = [];
        for (const [k, col, max] of [['title', 'title', 300], ['artist', 'artist', 300], ['album', 'album', 300], ['genre', 'genre', 80], ['mood', 'mood', 40]]) {
          if (typeof b[k] === 'string' && b[k].trim()) { sets.push(`${col}=?${vals.length + 2}`); vals.push(str(b[k], max)); }
        }
        if (typeof b.artwork === 'string' && httpsOrLocal(b.artwork)) { sets.push(`artwork=?${vals.length + 2}`); vals.push(b.artwork); }
        if (!sets.length) throw badRequest('Nothing to change: give title, artist, album, genre, mood or artwork.');
        stmts.push(c.env.DB.prepare(`UPDATE tracks SET ${sets.join(', ')} WHERE id=?1`).bind(r.id, ...vals));
        detail = `metadata: ${sets.map((s) => s.split('=')[0]).join(', ')}`;
      } else {
        // a withdrawn recording: hidden from the catalogue, and the revision moves so devices drop their saved copy
        rev += 1;
        stmts.push(c.env.DB.prepare('UPDATE tracks SET dead=1, verified=0, rev=?2, asset_at=?3 WHERE id=?1').bind(r.id, rev, at));
        detail = str(b.reason, 200) || 'taken down';
      }
      stmts.push(c.env.DB.prepare('INSERT INTO asset_log (at, action, track_id, isrc, rev, detail, by_user) VALUES (?1,?2,?3,?4,?5,?6,?7)').bind(at, b.action, r.id, r.isrc || isrc, rev, detail, a.user.username));
      out.push({ id: r.id, rev });
    }
    await c.env.DB.batch(stmts);
    return { ok: true, updated: out };
  }],

  ['GET', '/api/admin/assets', async (c) => {
    owner(c);
    const { results } = await c.env.DB.prepare('SELECT l.at, l.action, l.track_id, l.isrc, l.rev, l.detail, l.by_user, t.title, t.artist FROM asset_log l LEFT JOIN tracks t ON t.id=l.track_id ORDER BY l.id DESC LIMIT 40').all();
    return { log: results };
  }],
];
