// The world catalogue API (see ../world.js).

import { rateLimit, requireAuth } from '../auth.js';
import { ISRC_RE, MBID_RE, newReleases, playFor, recordingsByIsrc, releaseDetail, searchWorld } from '../world.js';
import { HttpError, badRequest, int, notFound, str } from '../util.js';

async function limited(c) {
  const a = requireAuth(c);
  if (!(await rateLimit(c.env, `world:${a.user.id}`, 90, 60))) throw new HttpError(429, 'rate_limited', 'Slow down a little: too many searches in a minute.');
  return a;
}

export const routes = [
  ['GET', '/api/world/search', async (c) => {
    await limited(c);
    const q = str(c.url.searchParams.get('q'), 120);
    if (q.length < 2) throw badRequest('Type at least two letters.');
    return searchWorld(c.env, q, { page: int(c.url.searchParams.get('page'), 0, 20, 0) });
  }],

  ['GET', '/api/world/isrc/:isrc', async (c) => {
    await limited(c);
    const isrc = String(c.params.isrc || '').replace(/-/g, '').toUpperCase();
    if (!ISRC_RE.test(isrc)) throw badRequest('That is not a valid ISRC.');
    return { isrc, tracks: await recordingsByIsrc(c.env, isrc) };
  }],

  ['GET', '/api/world/release/:mbid', async (c) => {
    await limited(c);
    if (!MBID_RE.test(c.params.mbid)) throw badRequest('Bad release id.');
    const r = await releaseDetail(c.env, c.params.mbid);
    if (!r) throw notFound('That release is not in the open database.');
    return r;
  }],

  // what just came out, everywhere (refreshed by the 2-minute agent)
  ['GET', '/api/world/new', async (c) => {
    requireAuth(c);
    return { releases: await newReleases(c.env, { limit: int(c.url.searchParams.get('limit'), 1, 100, 40) }) };
  }],

  // how to hear a recording: full song from the open catalogue, else a 30-second preview, else nothing
  ['GET', '/api/world/play', async (c) => {
    await limited(c);
    const title = str(c.url.searchParams.get('title'), 200);
    if (!title) throw badRequest('Which song?');
    const isrc = String(c.url.searchParams.get('isrc') || '').toUpperCase();
    return playFor(c.env, { isrc: ISRC_RE.test(isrc) ? isrc : '', title, artist: str(c.url.searchParams.get('artist'), 200) });
  }],

];
