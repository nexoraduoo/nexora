// Nexora - Cloudflare Worker entry.
// Static files (the app itself) are served by Cloudflare's asset layer; everything under /api comes here.

import { UserHub } from './hub.js';
import { Room } from './room.js';
import { authenticate } from './auth.js';
import { compile, match } from './router.js';
import { runIngest } from './ingest.js';
import { HttpError, badRequest, json, unauthorized } from './util.js';
import { routes as account } from './routes/account.js';
import { routes as library } from './routes/library.js';
import { routes as catalog } from './routes/catalog.js';
import { routes as admin } from './routes/admin.js';
import { routes as youtube } from './routes/youtube.js';
import { routes as podcast } from './routes/podcast.js';
import { routes as rooms } from './routes/rooms.js';
import { routes as assets } from './routes/assets.js';
import { routes as world } from './routes/world.js';
import { syncWorld } from './world.js';

export { UserHub, Room };

const table = compile([
  ...account,
  ...library,
  ...catalog,
  ...admin,
  ...youtube,
  ...podcast,
  ...rooms,
  ...assets,
  ...world,
  ['GET', '/api/health', async (c) => ({ ok: true, time: Date.now(), locker: !!c.env.FILES, ai: !!c.env.AI }), { auth: false }],
  ['GET', '/api/ws', connectSocket],
]);

async function connectSocket(c) {
  if (!c.auth) throw unauthorized();
  if (c.req.headers.get('Upgrade') !== 'websocket') throw new HttpError(426, 'upgrade_required', 'WebSocket expected.');
  // block cross-site socket hijacking: the page must come from this same site
  const origin = c.req.headers.get('Origin');
  if (origin && new URL(origin).host !== c.url.host) throw new HttpError(403, 'bad_origin', 'Cross-site connections are not allowed.');
  const stub = c.env.HUB.get(c.env.HUB.idFromName(c.auth.user.id));
  const h = new Headers(c.req.headers);
  h.set('x-device-id', c.auth.device.id);
  h.set('x-device-name', c.auth.device.name);
  h.set('x-device-kind', c.auth.device.kind);
  return stub.fetch(new Request(c.req.url, { headers: h, method: 'GET' }));
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    try {
      const m = match(table, req.method === 'HEAD' ? 'GET' : req.method, url.pathname) || match(table, req.method, url.pathname);
      if (!m) throw new HttpError(404, 'not_found', 'No such endpoint.');

      // CSRF defence: state-changing calls must carry a custom header, which browsers
      // refuse to send cross-site without a CORS pre-flight that we never grant.
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.headers.get('x-nexora')) {
        throw new HttpError(403, 'csrf', 'Missing x-nexora header.');
      }

      const c = {
        req, env, ctx, url, params: m.params, auth: null,
        body: async () => {
          const ct = req.headers.get('content-type') || '';
          if (!ct.includes('json')) throw badRequest('Send JSON.');
          const text = await req.text();
          if (text.length > 400_000) throw new HttpError(413, 'too_large', 'Request too large.');
          try { return JSON.parse(text || '{}'); } catch { throw badRequest('Invalid JSON.'); }
        },
      };
      c.auth = await authenticate(req, env);
      if (m.route.auth && !c.auth) throw unauthorized();

      const out = await m.route.handler(c);
      const res = out instanceof Response ? out : json(out);
      if (!res.headers.has('x-content-type-options')) {
        try { res.headers.set('x-content-type-options', 'nosniff'); } catch { /* immutable (websocket upgrade) */ }
      }
      return res;
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
      console.error('API error', req.method, url.pathname, e && e.stack ? e.stack : e);
      return json({ error: 'server_error', message: 'Something went wrong on our side. Please try again.' }, 500);
    }
  },

  // Cron Trigger: the catalogue agent
  async scheduled(event, env, ctx) {
    // every other run looks only at the newest uploads, so brand-new songs arrive fast
    ctx.waitUntil(runIngest(env, { count: 1, lane: Math.floor(event.scheduledTime / 120_000) % 2 ? 'fresh' : 'all' }));
    ctx.waitUntil(syncWorld(env).catch(() => {})); // newest releases from every platform, via the open databases
  },
};
