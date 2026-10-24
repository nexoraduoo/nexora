// Owner-only tools.

import { getSetting, requireAuth, setSetting } from '../auth.js';
import { runIngest } from '../ingest.js';
import { TOPIC_RE, notifyOwner } from '../notify.js';
import { badRequest, forbidden, int, inviteCode, notFound, now, randomId, str } from '../util.js';

function admin(c) {
  const a = requireAuth(c);
  if (a.user.role !== 'admin') throw forbidden('Only the owner can do that.');
  return a;
}

export const routes = [
  ['GET', '/api/admin/overview', async (c) => {
    admin(c);
    const q = (sql) => c.env.DB.prepare(sql).first();
    const [users, tracks, verified, uploads, runs, people] = await Promise.all([
      q('SELECT COUNT(*) AS n FROM users'),
      q('SELECT COUNT(*) AS n FROM tracks'),
      q('SELECT COUNT(*) AS n FROM tracks WHERE verified=1 AND dead=0'),
      q('SELECT COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes FROM uploads'),
      c.env.DB.prepare('SELECT * FROM ingest_runs ORDER BY id DESC LIMIT 25').all(),
      c.env.DB.prepare('SELECT id,username,display_name,role,created_at, (SELECT COUNT(*) FROM devices d WHERE d.user_id=users.id) AS devices FROM users ORDER BY created_at').all(),
    ]);
    return {
      users: users.n, tracks: tracks.n, verified: verified.n, uploads: uploads.n, uploadBytes: uploads.bytes,
      runs: runs.results, people: people.results,
      requests: (await q('SELECT COUNT(*) AS n FROM signup_requests')).n,
      settings: {
        jamendoKey: (await getSetting(c.env, 'jamendo_key')) || '',
        youtube: !!(await getSetting(c.env, 'youtube_key')),
        signupMode: (await getSetting(c.env, 'signup_mode')) || c.env.SIGNUP_MODE || 'approval',
        notifyTopic: (await getSetting(c.env, 'notify_topic')) || '',
        membersCanInvite: (await getSetting(c.env, 'members_can_invite')) === '1',
        ai: !!c.env.AI, locker: !!c.env.FILES,
      },
    };
  }],

  ['PUT', '/api/admin/settings', async (c) => {
    admin(c);
    const b = await c.body();
    if (b.jamendoKey !== undefined) await setSetting(c.env, 'jamendo_key', str(b.jamendoKey, 64));
    if (b.youtubeKey !== undefined) {
      const k = str(b.youtubeKey, 80);
      if (k && !/^[\w-]{20,60}$/.test(k)) throw badRequest('That does not look like a YouTube API key.');
      await setSetting(c.env, 'youtube_key', k);
    }
    if (b.signupMode !== undefined) {
      if (!['approval', 'invite', 'open'].includes(b.signupMode)) throw badRequest('signupMode must be approval, invite or open.');
      await setSetting(c.env, 'signup_mode', b.signupMode);
    }
    if (b.notifyTopic !== undefined) {
      const tpc = str(b.notifyTopic, 64);
      if (tpc && !TOPIC_RE.test(tpc)) throw badRequest('The alert name must be 16-64 letters, numbers, - or _.');
      await setSetting(c.env, 'notify_topic', tpc);
    }
    if (b.membersCanInvite !== undefined) await setSetting(c.env, 'members_can_invite', b.membersCanInvite ? '1' : '0');
    return { ok: true };
  }],

  // ---- sign-in requests ("tickets")
  ['GET', '/api/admin/requests', async (c) => {
    admin(c);
    const { results } = await c.env.DB.prepare('SELECT id, username, display_name, message, hue, created_at FROM signup_requests ORDER BY created_at DESC LIMIT 100').all();
    return { requests: results };
  }],

  ['POST', '/api/admin/requests/:id/approve', async (c) => {
    admin(c);
    const r = await c.env.DB.prepare('SELECT * FROM signup_requests WHERE id=?1').bind(c.params.id).first();
    if (!r) throw notFound('That request is gone (already handled?).');
    const taken = await c.env.DB.prepare('SELECT 1 FROM users WHERE username=?1').bind(r.username).first();
    const stmts = [c.env.DB.prepare('DELETE FROM signup_requests WHERE id=?1').bind(r.id)];
    if (!taken) stmts.unshift(c.env.DB.prepare("INSERT INTO users (id,username,display_name,pw_hash,role,hue,created_at) VALUES (?1,?2,?3,?4,'member',?5,?6)").bind(randomId(9), r.username, r.display_name, r.pw_hash, r.hue, now()));
    await c.env.DB.batch(stmts);
    return { ok: true, username: r.username };
  }],

  ['POST', '/api/admin/requests/:id/reject', async (c) => {
    admin(c);
    await c.env.DB.prepare('DELETE FROM signup_requests WHERE id=?1').bind(c.params.id).run();
    return { ok: true };
  }],

  ['POST', '/api/admin/notify-test', async (c) => {
    admin(c);
    const sent = await notifyOwner(c, 'Nexora: test alert', 'If you can read this on your phone, sign-in requests will reach you.');
    if (!sent) throw badRequest('Set an alert name first and press Save.');
    return { ok: true };
  }],

  ['POST', '/api/admin/ingest', async (c) => {
    admin(c);
    const b = await c.body().catch(() => ({}));
    return { runs: await runIngest(c.env, { count: int(b.count, 1, 3, 1) }) };
  }],

  ['DELETE', '/api/admin/users/:id', async (c) => {
    const a = admin(c);
    if (c.params.id === a.user.id) throw badRequest("You can't remove yourself.");
    const u = await c.env.DB.prepare('SELECT id FROM users WHERE id=?1').bind(c.params.id).first();
    if (!u) throw notFound();
    const files = await c.env.DB.prepare('SELECT r2_key FROM uploads WHERE user_id=?1').bind(u.id).all();
    for (const f of files.results) await c.env.FILES?.delete(f.r2_key);
    await c.env.DB.prepare('DELETE FROM users WHERE id=?1').bind(u.id).run();
    return { ok: true };
  }],

  // Nobody (not even the owner) can read a password. If a friend forgets theirs the owner issues a
  // one-time reset code (valid 24 h); the friend enters it on the sign-in screen and picks a new one.
  ['POST', '/api/admin/users/:id/reset', async (c) => {
    admin(c);
    const u = await c.env.DB.prepare('SELECT id FROM users WHERE id=?1').bind(c.params.id).first();
    if (!u) throw notFound();
    const code = inviteCode();
    await setSetting(c.env, `reset:${code}`, `${u.id}:${now() + 24 * 3600 * 1000}`);
    return { code };
  }],
];
