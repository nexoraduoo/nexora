// Listen-together rooms: create, look up, join (WebSocket), end.
import { rateLimit, requireAuth } from '../auth.js';
import { HttpError, forbidden, json, notFound, now, str } from '../util.js';

const TTL = 24 * 3600 * 1000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHABET[b % ALPHABET.length]).join('');

async function liveRoom(c, code) {
  const row = await c.env.DB.prepare('SELECT r.code, r.host_id, r.created_at, u.display_name AS host_name FROM rooms r JOIN users u ON u.id=r.host_id WHERE r.code=?1').bind(code).first();
  if (!row || now() - row.created_at > TTL) throw notFound('That listening room has ended.');
  return row;
}

export const routes = [
  ['POST', '/api/rooms', async (c) => {
    const a = requireAuth(c);
    if (!(await rateLimit(c.env, `room:${a.user.id}`, 20, 3600))) throw new HttpError(429, 'rate_limited', 'Too many rooms started this hour.');
    await c.env.DB.prepare('DELETE FROM rooms WHERE created_at < ?1').bind(now() - TTL).run();
    const code = newCode();
    await c.env.DB.prepare('INSERT INTO rooms (code,host_id,created_at) VALUES (?1,?2,?3)').bind(code, a.user.id, now()).run();
    return json({ code }, 201);
  }],

  ['GET', '/api/rooms/:code', async (c) => {
    requireAuth(c);
    const r = await liveRoom(c, str(c.params.code, 8).toUpperCase());
    return { code: r.code, host: r.host_name, hostId: r.host_id };
  }],

  ['GET', '/api/rooms/:code/ws', async (c) => {
    const a = requireAuth(c);
    if (c.req.headers.get('Upgrade') !== 'websocket') throw new HttpError(426, 'upgrade_required', 'WebSocket expected.');
    const origin = c.req.headers.get('Origin');
    if (origin && new URL(origin).host !== c.url.host) throw new HttpError(403, 'bad_origin', 'Cross-site connections are not allowed.');
    const r = await liveRoom(c, str(c.params.code, 8).toUpperCase());
    const h = new Headers(c.req.headers);
    h.set('x-user-id', a.user.id); h.set('x-user-name', a.user.displayName); h.set('x-user-hue', String(a.user.hue));
    h.set('x-device-id', a.device.id); h.set('x-is-host', r.host_id === a.user.id ? '1' : '0');
    return c.env.ROOM.get(c.env.ROOM.idFromName(r.code)).fetch(new Request(c.req.url, { headers: h, method: 'GET' }));
  }],

  ['DELETE', '/api/rooms/:code', async (c) => {
    const a = requireAuth(c);
    const code = str(c.params.code, 8).toUpperCase();
    const r = await liveRoom(c, code);
    if (r.host_id !== a.user.id) throw forbidden('Only the person who started the room can end it.');
    await c.env.DB.prepare('DELETE FROM rooms WHERE code=?1').bind(code).run();
    try { await c.env.ROOM.get(c.env.ROOM.idFromName(code)).fetch('https://room/end'); } catch { /* nobody connected */ }
    return { ok: true };
  }],
];
