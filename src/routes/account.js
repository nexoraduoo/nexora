// Accounts, sessions, devices, invites.

import {
  COOKIE, cookieFor, getSetting, pwHash, rateLimit, requireAuth, startSession, validKey, verifyPassword, publicUser,
} from '../auth.js';
import { notifyOwner } from '../notify.js';
import { HttpError, badRequest, clientIp, forbidden, int, inviteCode, json, notFound, now, randomId, str } from '../util.js';

const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;

async function signupMode(env) {
  return (await getSetting(env, 'signup_mode')) || env.SIGNUP_MODE || 'approval';
}

export const routes = [
  // ---- public config: lets the login screen know whether this is a first run / needs an invite
  ['GET', '/api/config', async (c) => {
    const { n } = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    return {
      app: c.env.APP_NAME || 'Nexora',
      firstRun: n === 0,
      signupMode: n === 0 ? 'open' : await signupMode(c.env),
    };
  }, { auth: false }],

  ['POST', '/api/auth/signup', async (c) => {
    const b = await c.body();
    const username = str(b.username, 24).toLowerCase();
    if (!USERNAME_RE.test(username)) throw badRequest('Username must be 3-24 letters, numbers, dots or underscores.', 'bad_username');
    if (!validKey(b.key)) throw badRequest('Password could not be processed. Please reload the page.', 'bad_key');
    const displayName = str(b.displayName, 40) || username;

    if (!(await rateLimit(c.env, `signup:${clientIp(c.req)}`, 10, 3600))) {
      throw new HttpError(429, 'rate_limited', 'Too many sign-ups from this network. Try again later.');
    }

    const { n } = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    const first = n === 0;
    const mode = first ? 'open' : await signupMode(c.env);
    let inviteUsed = null;
    const code = str(b.invite, 20).toUpperCase();
    // an invite link always lets a friend straight in; in "approval" mode a code is optional, in "invite" mode it is required
    if (mode === 'invite' || (mode === 'approval' && code)) {
      const inv = code && await c.env.DB.prepare('SELECT * FROM invites WHERE code=?1').bind(code).first();
      if (!inv || inv.uses >= inv.max_uses || (inv.expires_at && inv.expires_at < now())) {
        throw forbidden('That invite code is invalid or has expired. Ask your friend for a fresh one.');
      }
      inviteUsed = code;
    }

    const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE username=?1 UNION ALL SELECT 1 FROM signup_requests WHERE username=?1').bind(username).first();
    if (exists) throw new HttpError(409, 'username_taken', 'That username is taken.');

    // approval mode, no invite: raise a ticket for the owner. Nothing works until they approve it.
    if (mode === 'approval' && !inviteUsed) {
      await c.env.DB.prepare('DELETE FROM signup_requests WHERE created_at < ?1').bind(now() - 30 * 86400_000).run();
      const { pending } = await c.env.DB.prepare('SELECT COUNT(*) AS pending FROM signup_requests').first();
      if (pending >= 100) throw new HttpError(429, 'too_many_requests', 'There are too many waiting requests right now. Please ask the owner directly.');
      const message = str(b.message, 200);
      await c.env.DB.prepare('INSERT INTO signup_requests (id,username,display_name,pw_hash,message,hue,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)')
        .bind(randomId(9), username, displayName, await pwHash(c.env, b.key), message, int(b.hue, 0, 359, Math.floor(Math.random() * 360)), now()).run();
      await notifyOwner(c, 'Nexora: someone wants to join', `${displayName} (@${username}) asked for an account.${message ? ` "${message}"` : ''} Tap to approve or decline.`);
      return json({ pending: true, message: 'Your request was sent to the owner. You can sign in as soon as they approve it.' }, 202);
    }

    const id = randomId(9);
    const hue = int(b.hue, 0, 359, Math.floor(Math.random() * 360));
    const stmts = [
      c.env.DB.prepare('INSERT INTO users (id,username,display_name,pw_hash,role,hue,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)')
        .bind(id, username, displayName, await pwHash(c.env, b.key), first ? 'admin' : 'member', hue, now()),
    ];
    if (inviteUsed) {
      stmts.push(c.env.DB.prepare('UPDATE invites SET uses=uses+1 WHERE code=?1').bind(inviteUsed));
    }
    await c.env.DB.batch(stmts);

    const user = { id, username, display_name: displayName, role: first ? 'admin' : 'member', hue, prefs: '{}', share_activity: 1, created_at: now() };
    const { token, deviceId } = await startSession(c.env, c.req, user, b.device || {});
    return json({ user: publicUser(user, true), deviceId }, 201, { 'set-cookie': cookieFor(token, c.req) });
  }, { auth: false }],

  ['POST', '/api/auth/login', async (c) => {
    const b = await c.body();
    const username = str(b.username, 24).toLowerCase();
    if (!username || !validKey(b.key)) throw badRequest('Enter your username and password.', 'bad_credentials');

    const rlKey = `login:${username}:${clientIp(c.req)}`;
    if (!(await rateLimit(c.env, rlKey, 12, 900))) {
      throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait a few minutes and try again.');
    }
    const row = await c.env.DB.prepare('SELECT * FROM users WHERE username=?1').bind(username).first();
    if (!row) {
      const req = await c.env.DB.prepare('SELECT pw_hash FROM signup_requests WHERE username=?1').bind(username).first();
      if (req && await verifyPassword(c.env, b.key, req.pw_hash)) throw new HttpError(403, 'pending', 'Your request is still waiting for the owner to approve it. Please check back soon.');
    }
    const ok = row ? await verifyPassword(c.env, b.key, row.pw_hash) : (await pwHash(c.env, b.key), false);
    if (!ok) throw new HttpError(401, 'bad_credentials', 'Wrong username or password.');

    const { token, deviceId } = await startSession(c.env, c.req, row, b.device || {});
    return json({ user: publicUser(row, true), deviceId }, 200, { 'set-cookie': cookieFor(token, c.req) });
  }, { auth: false }],

  // one-time reset code issued by the owner (see admin.js)
  ['POST', '/api/auth/reset', async (c) => {
    const b = await c.body();
    const username = str(b.username, 24).toLowerCase();
    const code = str(b.code, 20).toUpperCase();
    if (!username || !code || !validKey(b.key)) throw badRequest('Enter your username, the reset code and a new password.');
    if (!(await rateLimit(c.env, `reset:${clientIp(c.req)}`, 10, 900))) throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait a few minutes.');
    const stored = await getSetting(c.env, `reset:${code}`);
    const [uid, exp] = (stored || '').split(':');
    const user = uid && await c.env.DB.prepare('SELECT * FROM users WHERE id=?1 AND username=?2').bind(uid, username).first();
    if (!user || Number(exp) < now()) throw forbidden('That reset code is invalid or expired.');
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET pw_hash=?1 WHERE id=?2').bind(await pwHash(c.env, b.key), user.id),
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?1').bind(user.id),
      c.env.DB.prepare('DELETE FROM settings WHERE key=?1').bind(`reset:${code}`),
    ]);
    const { token, deviceId } = await startSession(c.env, c.req, user, b.device || {});
    return json({ user: publicUser(user, true), deviceId }, 200, { 'set-cookie': cookieFor(token, c.req) });
  }, { auth: false }],

  ['POST', '/api/auth/logout', async (c) => {
    if (c.auth) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?1').bind(c.auth.tokenHash).run();
    return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
  }, { auth: false }],

  ['POST', '/api/auth/password', async (c) => {
    const a = requireAuth(c);
    const b = await c.body();
    if (!validKey(b.oldKey) || !validKey(b.newKey)) throw badRequest('Invalid password data.');
    const row = await c.env.DB.prepare('SELECT pw_hash FROM users WHERE id=?1').bind(a.user.id).first();
    if (!(await verifyPassword(c.env, b.oldKey, row.pw_hash))) throw forbidden('Your current password is wrong.');
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET pw_hash=?1 WHERE id=?2').bind(await pwHash(c.env, b.newKey), a.user.id),
      // sign out every other device
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?1 AND token_hash<>?2').bind(a.user.id, a.tokenHash),
    ]);
    return { ok: true };
  }],

  ['GET', '/api/me', async (c) => {
    const a = requireAuth(c);
    const jam = await getSetting(c.env, 'jamendo_key');
    return {
      user: a.user,
      device: a.device,
      config: {
        jamendoKey: jam || null,
        youtube: !!(await getSetting(c.env, 'youtube_key')),
        locker: !!c.env.FILES,
        membersCanInvite: (await getSetting(c.env, 'members_can_invite')) === '1',
        // the owner's badge: how many people are waiting for approval
        pending: a.user.role === 'admin' ? (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM signup_requests').first()).n : 0,
      },
    };
  }],

  ['PATCH', '/api/me', async (c) => {
    const a = requireAuth(c);
    const b = await c.body();
    const sets = [];
    const vals = [];
    if (b.displayName !== undefined) { sets.push('display_name=?'); vals.push(str(b.displayName, 40) || a.user.username); }
    if (b.hue !== undefined) { sets.push('hue=?'); vals.push(int(b.hue, 0, 359, 260)); }
    if (b.shareActivity !== undefined) { sets.push('share_activity=?'); vals.push(b.shareActivity ? 1 : 0); }
    if (b.prefs && typeof b.prefs === 'object') {
      const merged = { ...a.user.prefs, ...b.prefs };
      const text = JSON.stringify(merged);
      if (text.length > 6000) throw badRequest('Preferences too large.');
      sets.push('prefs=?'); vals.push(text);
    }
    if (sets.length) {
      await c.env.DB.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).bind(...vals, a.user.id).run();
    }
    const row = await c.env.DB.prepare('SELECT * FROM users WHERE id=?1').bind(a.user.id).first();
    return { user: publicUser(row, true) };
  }],

  // ---- devices: every browser/app you are signed in on
  ['GET', '/api/devices', async (c) => {
    const a = requireAuth(c);
    const { results } = await c.env.DB.prepare(
      'SELECT id,name,kind,created_at,last_seen FROM devices WHERE user_id=?1 ORDER BY last_seen DESC'
    ).bind(a.user.id).all();
    return { devices: results.map((d) => ({ ...d, current: d.id === a.device.id })), current: a.device.id };
  }],

  ['PATCH', '/api/devices/:id', async (c) => {
    const a = requireAuth(c);
    const b = await c.body();
    const name = str(b.name, 60);
    if (!name) throw badRequest('Give the device a name.');
    const kinds = ['phone', 'tablet', 'desktop', 'tv', 'watch'];
    const kind = kinds.includes(b.kind) ? b.kind : null;
    const r = await c.env.DB.prepare('UPDATE devices SET name=?1, kind=COALESCE(?2,kind) WHERE id=?3 AND user_id=?4')
      .bind(name, kind, c.params.id, a.user.id).run();
    if (!r.meta.changes) throw notFound('Device not found.');
    return { ok: true };
  }],

  ['DELETE', '/api/devices/:id', async (c) => {
    const a = requireAuth(c);
    const r = await c.env.DB.prepare('DELETE FROM devices WHERE id=?1 AND user_id=?2').bind(c.params.id, a.user.id).run();
    if (!r.meta.changes) throw notFound('Device not found.');
    // tell the hub to drop its live connection
    try {
      const stub = c.env.HUB.get(c.env.HUB.idFromName(a.user.id));
      await stub.fetch(`https://hub/kick?device=${encodeURIComponent(c.params.id)}`);
    } catch { /* hub offline: fine */ }
    return { ok: true };
  }],

  // ---- invites
  ['GET', '/api/invites', async (c) => {
    const a = requireAuth(c);
    await assertCanInvite(c, a);
    const { results } = await c.env.DB.prepare(
      'SELECT code,max_uses,uses,expires_at,created_at FROM invites WHERE created_by=?1 ORDER BY created_at DESC LIMIT 50'
    ).bind(a.user.id).all();
    return { invites: results };
  }],

  ['POST', '/api/invites', async (c) => {
    const a = requireAuth(c);
    await assertCanInvite(c, a);
    const b = await c.body();
    const code = inviteCode();
    const maxUses = int(b.maxUses, 1, 50, 1);
    const days = int(b.days, 1, 90, 14);
    await c.env.DB.prepare('INSERT INTO invites (code,created_by,max_uses,expires_at,created_at) VALUES (?1,?2,?3,?4,?5)')
      .bind(code, a.user.id, maxUses, now() + days * 86400000, now()).run();
    return json({ code, maxUses, expiresAt: now() + days * 86400000 }, 201);
  }],

  ['DELETE', '/api/invites/:code', async (c) => {
    const a = requireAuth(c);
    await c.env.DB.prepare('DELETE FROM invites WHERE code=?1 AND created_by=?2').bind(c.params.code, a.user.id).run();
    return { ok: true };
  }],
];

async function assertCanInvite(c, a) {
  if (a.user.role === 'admin') return;
  if ((await getSetting(c.env, 'members_can_invite')) === '1') return;
  throw forbidden('Only the owner can create invites.');
}
