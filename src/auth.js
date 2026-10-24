// Sessions, devices, password verification and rate limiting.
//
// Password design (chosen for Cloudflare's free plan, which allows only 10 ms CPU per request):
// the browser stretches the password with PBKDF2 (600k rounds) and sends only the derived key.
// The server never sees the real password and stores HMAC(secret, derivedKey), a cheap operation.
// A database leak alone is useless to an attacker: they'd still need the server secret AND would
// have to run the 600k-round PBKDF2 for every guess.

import { b64url, describeDevice, hmacHex, now, parseCookies, randomId, safeEqual, sha256Hex, str, unauthorized } from './util.js';

export const COOKIE = 'nx_session';
export const SESSION_DAYS = 180;
const KEY_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes base64url

export function secret(env) {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 24) {
    throw new Error('AUTH_SECRET is not set. Run "npm run deploy" (it creates one) or add AUTH_SECRET to .dev.vars');
  }
  return env.AUTH_SECRET;
}

export const validKey = (k) => typeof k === 'string' && KEY_RE.test(k);

export const pwHash = (env, key) => hmacHex(secret(env), `pw:${key}`);

export async function verifyPassword(env, key, stored) {
  return safeEqual(await pwHash(env, key), stored);
}

export function cookieFor(token, req, maxAgeSec = SESSION_DAYS * 86400) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

/** Find or create the device row for this login, then create a session for it. */
export async function startSession(env, req, user, hint = {}) {
  const ua = req.headers.get('user-agent') || '';
  const guess = describeDevice(ua);
  const t = now();
  let deviceId = null;

  if (typeof hint.deviceId === 'string' && hint.deviceId.length < 40) {
    const row = await env.DB.prepare('SELECT id FROM devices WHERE id=?1 AND user_id=?2').bind(hint.deviceId, user.id).first();
    if (row) deviceId = row.id;
  }
  const kind = ['phone', 'tablet', 'desktop', 'tv', 'watch'].includes(hint.kind) ? hint.kind : guess.kind;
  let name = str(hint.name, 60) || guess.name;
  if (!deviceId) {
    // two "Chrome on Windows" devices are confusing in the Connect list: number the newcomer
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM devices WHERE user_id=?1 AND (name=?2 OR name LIKE ?3)').bind(user.id, name, `${name} #%`).first();
    if (n > 0) name = `${name} #${n + 1}`;
  }
  if (deviceId) {
    await env.DB.prepare('UPDATE devices SET last_seen=?1, name=?2, kind=?3 WHERE id=?4').bind(t, name, kind, deviceId).run();
  } else {
    deviceId = randomId(9);
    await env.DB.prepare('INSERT INTO devices (id,user_id,name,kind,created_at,last_seen) VALUES (?1,?2,?3,?4,?5,?5)')
      .bind(deviceId, user.id, name, kind, t).run();
  }

  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO sessions (token_hash,user_id,device_id,created_at,expires_at) VALUES (?1,?2,?3,?4,?5)')
    .bind(await sha256Hex(token), user.id, deviceId, t, t + SESSION_DAYS * 86400000).run();
  return { token, deviceId };
}

/** Resolve the signed-in user + device from cookie or Bearer token. */
export async function authenticate(req, env) {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : parseCookies(req.headers.get('cookie') || '')[COOKIE];
  if (!token || token.length > 80) return null;
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.expires_at, s.device_id, d.name AS device_name, d.kind AS device_kind, d.last_seen,
            u.id, u.username, u.display_name, u.role, u.hue, u.prefs, u.share_activity, u.created_at
       FROM sessions s JOIN users u ON u.id=s.user_id JOIN devices d ON d.id=s.device_id
      WHERE s.token_hash=?1`
  ).bind(hash).first();
  if (!row || row.expires_at < now()) return null;
  const t = now();
  if (t - row.last_seen > 5 * 60 * 1000) {
    await env.DB.prepare('UPDATE devices SET last_seen=?1 WHERE id=?2').bind(t, row.device_id).run();
  }
  return {
    tokenHash: hash,
    user: publicUser(row, true),
    device: { id: row.device_id, name: row.device_name, kind: row.device_kind },
  };
}

export function publicUser(r, self = false) {
  const u = { id: r.id, username: r.username, displayName: r.display_name, hue: r.hue, role: r.role };
  if (self) {
    try { u.prefs = JSON.parse(r.prefs || '{}'); } catch { u.prefs = {}; }
    u.shareActivity = !!r.share_activity;
    u.createdAt = r.created_at;
  }
  return u;
}

export function requireAuth(c) {
  if (!c.auth) throw unauthorized();
  return c.auth;
}

/** Fixed-window rate limiter backed by D1. Returns true when the action is allowed. */
export async function rateLimit(env, key, max, windowSec) {
  const t = now();
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key,count,reset_at) VALUES (?1,1,?2)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN reset_at < ?3 THEN 1 ELSE count + 1 END,
       reset_at = CASE WHEN reset_at < ?3 THEN ?2 ELSE reset_at END
     RETURNING count`
  ).bind(key, t + windowSec * 1000, t).first();
  return row.count <= max;
}

export async function getSetting(env, key, fallback = null) {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key=?1').bind(key).first();
  return r ? r.value : fallback;
}

export async function setSetting(env, key, value) {
  await env.DB.prepare('INSERT INTO settings (key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind(key, String(value)).run();
}
