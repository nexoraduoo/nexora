// Likes, playlists, saved items, history, friends, listening activity.

import { requireAuth } from '../auth.js';
import { TRACK_COLS, cleanTrack, trackOut, upsertTrackStmt } from '../tracks.js';
import { badRequest, forbidden, int, json, notFound, now, randomId, str } from '../util.js';

const MAX_PLAYLIST_TRACKS = 2000;

async function trackStmt(c, raw) {
  const t = cleanTrack(raw);
  if (!t) throw badRequest('That track looks invalid.', 'bad_track');
  return { t, stmt: upsertTrackStmt(c.env, t) };
}

/** Can this user see the playlist? Returns the row or throws. */
async function viewPlaylist(c, id, userId, token) {
  const p = await c.env.DB.prepare(
    `SELECT p.*, u.display_name AS owner_name, u.username AS owner_username FROM playlists p JOIN users u ON u.id=p.owner_id WHERE p.id=?1`
  ).bind(id).first();
  if (!p) throw notFound('Playlist not found.');
  const isOwner = p.owner_id === userId;
  const viaToken = token && p.share_token && token === p.share_token;
  if (!isOwner && !p.is_public && !viaToken) {
    const saved = await c.env.DB.prepare("SELECT 1 FROM library_items WHERE user_id=?1 AND kind='playlist' AND ref=?2").bind(userId, id).first();
    if (!saved) throw forbidden('This playlist is private.');
  }
  return { p, isOwner };
}

const playlistOut = (p, isOwner) => ({
  id: p.id, name: p.name, description: p.description, isPublic: !!p.is_public, collab: !!p.collab,
  shareToken: isOwner ? p.share_token : null, owner: { id: p.owner_id, name: p.owner_name, username: p.owner_username },
  mine: isOwner, updatedAt: p.updated_at, createdAt: p.created_at,
});

async function playlistTracks(c, id) {
  const { results } = await c.env.DB.prepare(
    `SELECT pt.id AS entry, pt.added_by, ${TRACK_COLS} FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=?1 ORDER BY pt.pos`
  ).bind(id).all();
  return results.map((r) => ({ ...trackOut(r), entry: r.entry, addedBy: r.added_by }));
}

async function touch(c, id) {
  await c.env.DB.prepare('UPDATE playlists SET updated_at=?1 WHERE id=?2').bind(now(), id).run();
}

export const routes = [
  // ------------------------------------------------------------------ likes
  ['GET', '/api/likes', async (c) => {
    const a = requireAuth(c);
    const { results } = await c.env.DB.prepare(
      `SELECT ${TRACK_COLS} FROM likes l JOIN tracks t ON t.id=l.track_id WHERE l.user_id=?1 ORDER BY l.created_at DESC LIMIT 2000`
    ).bind(a.user.id).all();
    return { tracks: results.map(trackOut) };
  }],

  ['PUT', '/api/likes', async (c) => {
    const a = requireAuth(c);
    const { t, stmt } = await trackStmt(c, (await c.body()).track);
    await c.env.DB.batch([
      stmt,
      c.env.DB.prepare('INSERT OR IGNORE INTO likes (user_id,track_id,created_at) VALUES (?1,?2,?3)').bind(a.user.id, t.id, now()),
    ]);
    return { ok: true };
  }],

  ['DELETE', '/api/likes/:id', async (c) => {
    const a = requireAuth(c);
    await c.env.DB.prepare('DELETE FROM likes WHERE user_id=?1 AND track_id=?2').bind(a.user.id, c.params.id).run();
    return { ok: true };
  }],

  // ------------------------------------------------------------------ playlists
  ['GET', '/api/playlists', async (c) => {
    const a = requireAuth(c);
    const { results } = await c.env.DB.prepare(
      `SELECT p.id,p.name,p.description,p.is_public,p.collab,p.updated_at,p.owner_id,
              (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id=p.id) AS count,
              (SELECT t.artwork FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=p.id AND t.artwork IS NOT NULL ORDER BY pt.pos LIMIT 1) AS cover,
              u.display_name AS owner_name
         FROM playlists p JOIN users u ON u.id=p.owner_id
        WHERE p.owner_id=?1 OR p.id IN (SELECT ref FROM library_items WHERE user_id=?1 AND kind='playlist')
        ORDER BY p.updated_at DESC`
    ).bind(a.user.id).all();
    return {
      playlists: results.map((p) => ({
        id: p.id, name: p.name, description: p.description, isPublic: !!p.is_public, collab: !!p.collab, count: p.count,
        cover: p.cover, mine: p.owner_id === a.user.id, ownerName: p.owner_name, updatedAt: p.updated_at,
      })),
    };
  }],

  ['POST', '/api/playlists', async (c) => {
    const a = requireAuth(c);
    const b = await c.body();
    const name = str(b.name, 80);
    if (!name) throw badRequest('Give your playlist a name.');
    const { n } = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM playlists WHERE owner_id=?1').bind(a.user.id).first();
    if (n >= 200) throw badRequest('You have reached the playlist limit (200).');
    const id = randomId(8);
    const t = now();
    const stmts = [c.env.DB.prepare('INSERT INTO playlists (id,owner_id,name,description,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?5)')
      .bind(id, a.user.id, name, str(b.description, 300), t)];
    // optional initial tracks (used by playlist import)
    const initial = Array.isArray(b.tracks) ? b.tracks.slice(0, 300) : [];
    let pos = 1;
    for (const raw of initial) {
      const ct = cleanTrack(raw);
      if (!ct) continue;
      stmts.push(upsertTrackStmt(c.env, ct));
      stmts.push(c.env.DB.prepare('INSERT INTO playlist_tracks (playlist_id,track_id,pos,added_by,added_at) VALUES (?1,?2,?3,?4,?5)').bind(id, ct.id, pos++, a.user.id, t));
    }
    for (let i = 0; i < stmts.length; i += 80) await c.env.DB.batch(stmts.slice(i, i + 80));
    return json({ id, name }, 201);
  }],

  ['GET', '/api/playlists/:id', async (c) => {
    const a = requireAuth(c);
    const { p, isOwner } = await viewPlaylist(c, c.params.id, a.user.id, c.url.searchParams.get('token'));
    return { playlist: playlistOut(p, isOwner), tracks: await playlistTracks(c, p.id) };
  }],

  ['PATCH', '/api/playlists/:id', async (c) => {
    const a = requireAuth(c);
    const b = await c.body();
    const p = await c.env.DB.prepare('SELECT * FROM playlists WHERE id=?1 AND owner_id=?2').bind(c.params.id, a.user.id).first();
    if (!p) throw notFound('Playlist not found.');
    let token = p.share_token;
    if (b.share === true && !token) token = randomId(10);
    if (b.share === false) token = null;
    await c.env.DB.prepare('UPDATE playlists SET name=?1, description=?2, is_public=?3, collab=?4, share_token=?5, updated_at=?6 WHERE id=?7')
      .bind(str(b.name, 80) || p.name, b.description !== undefined ? str(b.description, 300) : p.description,
        b.isPublic !== undefined ? (b.isPublic ? 1 : 0) : p.is_public, b.collab !== undefined ? (b.collab ? 1 : 0) : p.collab,
        token, now(), p.id).run();
    return { ok: true, shareToken: token };
  }],

  ['DELETE', '/api/playlists/:id', async (c) => {
    const a = requireAuth(c);
    const r = await c.env.DB.prepare('DELETE FROM playlists WHERE id=?1 AND owner_id=?2').bind(c.params.id, a.user.id).run();
    if (!r.meta.changes) {
      // not the owner: just remove it from my library
      await c.env.DB.prepare("DELETE FROM library_items WHERE user_id=?1 AND kind='playlist' AND ref=?2").bind(a.user.id, c.params.id).run();
    }
    return { ok: true };
  }],

  ['POST', '/api/playlists/:id/tracks', async (c) => {
    const a = requireAuth(c);
    const b = await c.body();
    const { p, isOwner } = await viewPlaylist(c, c.params.id, a.user.id, b.token || c.url.searchParams.get('token'));
    if (!isOwner && !p.collab) throw forbidden('Only the owner can add songs to this playlist.');
    const raws = Array.isArray(b.tracks) ? b.tracks : b.track ? [b.track] : [];
    if (!raws.length || raws.length > 100) throw badRequest('Nothing to add.');
    const { n, maxpos } = await c.env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(pos),0) AS maxpos FROM playlist_tracks WHERE playlist_id=?1').bind(p.id).first();
    if (n + raws.length > MAX_PLAYLIST_TRACKS) throw badRequest('Playlist is full.');
    const stmts = [];
    let pos = maxpos;
    const t = now();
    for (const raw of raws) {
      const ct = cleanTrack(raw);
      if (!ct) continue;
      stmts.push(upsertTrackStmt(c.env, ct));
      stmts.push(c.env.DB.prepare('INSERT INTO playlist_tracks (playlist_id,track_id,pos,added_by,added_at) VALUES (?1,?2,?3,?4,?5)').bind(p.id, ct.id, ++pos, a.user.id, t));
    }
    if (!stmts.length) throw badRequest('Those tracks look invalid.');
    await c.env.DB.batch(stmts);
    await touch(c, p.id);
    return { ok: true, added: stmts.length / 2 };
  }],

  ['DELETE', '/api/playlists/:id/tracks/:entry', async (c) => {
    const a = requireAuth(c);
    const { p, isOwner } = await viewPlaylist(c, c.params.id, a.user.id, c.url.searchParams.get('token'));
    const row = await c.env.DB.prepare('SELECT added_by FROM playlist_tracks WHERE id=?1 AND playlist_id=?2').bind(c.params.entry, p.id).first();
    if (!row) throw notFound();
    if (!isOwner && row.added_by !== a.user.id) throw forbidden();
    await c.env.DB.prepare('DELETE FROM playlist_tracks WHERE id=?1').bind(c.params.entry).run();
    await touch(c, p.id);
    return { ok: true };
  }],

  // move one entry: { entry, before } (before = entry id to sit in front of, null = end)
  ['POST', '/api/playlists/:id/move', async (c) => {
    const a = requireAuth(c);
    const b = await c.body();
    const p = await c.env.DB.prepare('SELECT id FROM playlists WHERE id=?1 AND owner_id=?2').bind(c.params.id, a.user.id).first();
    if (!p) throw forbidden('Only the owner can reorder.');
    const { results } = await c.env.DB.prepare('SELECT id,pos FROM playlist_tracks WHERE playlist_id=?1 ORDER BY pos').bind(p.id).all();
    const list = results.filter((r) => r.id !== b.entry);
    let idx = b.before ? list.findIndex((r) => r.id === b.before) : list.length;
    if (idx < 0) idx = list.length;
    const prev = list[idx - 1]?.pos ?? (list[0] ? list[0].pos - 2 : 0);
    const next = list[idx]?.pos ?? prev + 2;
    await c.env.DB.prepare('UPDATE playlist_tracks SET pos=?1 WHERE id=?2 AND playlist_id=?3').bind((prev + next) / 2, b.entry, p.id).run();
    await touch(c, p.id);
    return { ok: true };
  }],

  // follow a playlist someone shared with me
  ['POST', '/api/playlists/:id/save', async (c) => {
    const a = requireAuth(c);
    const b = await c.body();
    const { p, isOwner } = await viewPlaylist(c, c.params.id, a.user.id, b.token);
    if (!isOwner) {
      await c.env.DB.prepare("INSERT OR IGNORE INTO library_items (user_id,kind,ref,data,created_at) VALUES (?1,'playlist',?2,'{}',?3)").bind(a.user.id, p.id, now()).run();
    }
    return { ok: true };
  }],

  // ------------------------------------------------------------------ saved albums / artists / stations
  ['GET', '/api/library', async (c) => {
    const a = requireAuth(c);
    const { results } = await c.env.DB.prepare(
      "SELECT kind,ref,data,created_at FROM library_items WHERE user_id=?1 AND kind<>'playlist' ORDER BY created_at DESC LIMIT 500"
    ).bind(a.user.id).all();
    const out = { album: [], artist: [], station: [], podcast: [] };
    for (const r of results) {
      let data = {};
      try { data = JSON.parse(r.data); } catch { /* ignore */ }
      (out[r.kind] ||= []).push({ ref: r.ref, ...data });
    }
    return { albums: out.album, artists: out.artist, stations: out.station, podcasts: out.podcast };
  }],

  ['PUT', '/api/library/:kind', async (c) => {
    const a = requireAuth(c);
    if (!['album', 'artist', 'station', 'podcast'].includes(c.params.kind)) throw badRequest('Unknown kind.');
    const b = await c.body();
    const ref = str(b.ref, 300);
    if (!ref) throw badRequest('Missing item.');
    const data = JSON.stringify({
      title: str(b.title, 300), artist: str(b.artist, 300), artwork: /^https:/.test(b.artwork || '') ? str(b.artwork, 600) : null,
      source: str(b.source, 20), url: /^https:/.test(b.url || '') ? str(b.url, 1500) : undefined, kind: c.params.kind,
    });
    await c.env.DB.prepare('INSERT INTO library_items (user_id,kind,ref,data,created_at) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(user_id,kind,ref) DO UPDATE SET data=excluded.data')
      .bind(a.user.id, c.params.kind, ref, data, now()).run();
    return { ok: true };
  }],

  ['DELETE', '/api/library/:kind/:ref*', async (c) => {
    const a = requireAuth(c);
    await c.env.DB.prepare('DELETE FROM library_items WHERE user_id=?1 AND kind=?2 AND ref=?3').bind(a.user.id, c.params.kind, c.params.ref).run();
    return { ok: true };
  }],

  // ------------------------------------------------------------------ history + activity
  ['POST', '/api/history', async (c) => {
    const a = requireAuth(c);
    const b = await c.body();
    const { t, stmt } = await trackStmt(c, b.track);
    const ms = int(b.ms, 0, 86400000);
    const stmts = [stmt, c.env.DB.prepare('INSERT INTO history (user_id,track_id,played_at,ms,device_id) VALUES (?1,?2,?3,?4,?5)').bind(a.user.id, t.id, now(), ms, a.device.id)];
    stmts.push(c.env.DB.prepare('DELETE FROM history WHERE user_id=?1 AND id NOT IN (SELECT id FROM history WHERE user_id=?1 ORDER BY played_at DESC LIMIT 500)').bind(a.user.id));
    await c.env.DB.batch(stmts);
    return { ok: true };
  }],

  ['GET', '/api/history', async (c) => {
    const a = requireAuth(c);
    const limit = int(c.url.searchParams.get('limit'), 1, 200, 40);
    const { results } = await c.env.DB.prepare(
      `SELECT ${TRACK_COLS}, MAX(h.played_at) AS at, COUNT(*) AS plays
         FROM history h JOIN tracks t ON t.id=h.track_id WHERE h.user_id=?1 GROUP BY t.id ORDER BY at DESC LIMIT ?2`
    ).bind(a.user.id, limit).all();
    return { tracks: results.map((r) => ({ ...trackOut(r), at: r.at, plays: r.plays })) };
  }],

  // top artists from my history, used to personalise "Made for you"
  ['GET', '/api/taste', async (c) => {
    const a = requireAuth(c);
    const [artists, langs, genres] = await Promise.all([
      c.env.DB.prepare(`SELECT t.artist AS name, COUNT(*) AS n FROM history h JOIN tracks t ON t.id=h.track_id WHERE h.user_id=?1 AND t.artist<>'' AND t.kind='track' GROUP BY t.artist ORDER BY n DESC LIMIT 8`).bind(a.user.id).all(),
      c.env.DB.prepare(`SELECT t.lang AS name, COUNT(*) AS n FROM history h JOIN tracks t ON t.id=h.track_id WHERE h.user_id=?1 AND t.lang IS NOT NULL GROUP BY t.lang ORDER BY n DESC LIMIT 4`).bind(a.user.id).all(),
      c.env.DB.prepare(`SELECT t.genre AS name, COUNT(*) AS n FROM history h JOIN tracks t ON t.id=h.track_id WHERE h.user_id=?1 AND t.genre IS NOT NULL GROUP BY t.genre ORDER BY n DESC LIMIT 5`).bind(a.user.id).all(),
    ]);
    return { artists: artists.results, langs: langs.results, genres: genres.results };
  }],

  ['PUT', '/api/nowplaying', async (c) => {
    const a = requireAuth(c);
    const b = await c.body();
    const t = b.track ? cleanTrack(b.track) : null;
    const snap = t ? JSON.stringify({ id: t.id, title: t.title, artist: t.artist, artwork: t.artwork }) : null;
    await c.env.DB.prepare('UPDATE users SET now_playing=?1, now_playing_at=?2 WHERE id=?3').bind(snap, now(), a.user.id).run();
    return { ok: true };
  }],

  // ------------------------------------------------------------------ circle (friends)
  ['GET', '/api/people', async (c) => {
    const a = requireAuth(c);
    const { results } = await c.env.DB.prepare(
      `SELECT u.id,u.username,u.display_name,u.hue,u.share_activity,u.now_playing,u.now_playing_at,
              EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=?1 AND f.followee_id=u.id) AS following
         FROM users u WHERE u.id<>?1 ORDER BY u.display_name LIMIT 200`
    ).bind(a.user.id).all();
    const t = now();
    return {
      people: results.map((u) => {
        let np = null;
        if (u.following && u.share_activity && u.now_playing && t - u.now_playing_at < 6 * 60 * 1000) {
          try { np = JSON.parse(u.now_playing); } catch { /* ignore */ }
        }
        return { id: u.id, username: u.username, displayName: u.display_name, hue: u.hue, following: !!u.following, nowPlaying: np };
      }),
    };
  }],

  ['PUT', '/api/follow/:id', async (c) => {
    const a = requireAuth(c);
    if (c.params.id === a.user.id) throw badRequest("You can't follow yourself.");
    const u = await c.env.DB.prepare('SELECT id FROM users WHERE id=?1').bind(c.params.id).first();
    if (!u) throw notFound('Person not found.');
    await c.env.DB.prepare('INSERT OR IGNORE INTO follows (follower_id,followee_id,created_at) VALUES (?1,?2,?3)').bind(a.user.id, u.id, now()).run();
    return { ok: true };
  }],

  ['DELETE', '/api/follow/:id', async (c) => {
    const a = requireAuth(c);
    await c.env.DB.prepare('DELETE FROM follows WHERE follower_id=?1 AND followee_id=?2').bind(a.user.id, c.params.id).run();
    return { ok: true };
  }],

  // a friend's public playlists
  ['GET', '/api/people/:id/playlists', async (c) => {
    requireAuth(c);
    const { results } = await c.env.DB.prepare(
      `SELECT p.id,p.name,p.description,
              (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id=p.id) AS count,
              (SELECT t.artwork FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=p.id AND t.artwork IS NOT NULL ORDER BY pt.pos LIMIT 1) AS cover
         FROM playlists p WHERE p.owner_id=?1 AND p.is_public=1 ORDER BY p.updated_at DESC LIMIT 50`
    ).bind(c.params.id).all();
    return { playlists: results };
  }],

  // resolve a share link  /#/join-playlist/<id>/<token>
  ['GET', '/api/shared/:id', async (c) => {
    const a = requireAuth(c);
    const { p, isOwner } = await viewPlaylist(c, c.params.id, a.user.id, c.url.searchParams.get('token'));
    return { playlist: playlistOut(p, isOwner), tracks: await playlistTracks(c, p.id) };
  }],
];
