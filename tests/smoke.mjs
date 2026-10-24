// End-to-end API smoke test. Start the dev server first (npm run dev), ideally with a fresh database:
//   node tests/smoke.mjs            (BASE defaults to http://127.0.0.1:8787)
import assert from 'node:assert/strict';
import { deriveKey } from '../public/js/shared/kdf.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
let passed = 0;
const ok = (name) => { passed++; console.log(`  ok  ${name}`); };

class Client {
  constructor(label) { this.label = label; this.cookie = ''; }
  async call(method, path, body, { raw = false, headers = {} } = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'x-nexora': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    if (raw) return res;
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }
}

const rnd = () => Math.random().toString(36).slice(2, 8);
const track = (n, extra = {}) => ({ id: `audius:t${n}${rnd()}`, source: 'audius', kind: 'track', title: `Song ${n}`, artist: 'Test Artist', album: '', duration: 180, artwork: 'https://example.com/a.jpg', url: 'https://example.com/a.mp3', preview: false, license: 'test', downloadable: true, lang: 'en', genre: 'Pop', ...extra });

const owner = new Client('owner');
const friend = new Client('friend');
const ownerName = `own${rnd()}`;
const friendName = `fr${rnd()}`;

console.log(`Nexora smoke test against ${BASE}`);

// -- health + config
let r = await owner.call('GET', '/api/health');
assert.equal(r.status, 200); ok('health');
r = await owner.call('GET', '/api/config');
assert.equal(r.status, 200);
const firstRun = r.data.firstRun;
console.log(`  (firstRun=${firstRun}, signupMode=${r.data.signupMode})`);

// -- csrf guard
r = await owner.call('POST', '/api/auth/login', {}, { headers: { 'x-nexora': '' } });
assert.equal(r.status, 403); ok('csrf header required');

// -- signup / login
let adminCapable = firstRun;
if (firstRun) {
  r = await owner.call('POST', '/api/auth/signup', { username: ownerName, displayName: 'Owner', key: await deriveKey(ownerName, 'correct horse battery'), device: { name: 'Test PC', kind: 'desktop' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.user.role, 'admin'); ok('first user becomes owner/admin');
} else {
  r = await owner.call('POST', '/api/auth/signup', { username: ownerName, key: await deriveKey(ownerName, 'x'), invite: 'NOPE-NOPE' });
  assert.equal(r.status, 403); ok('signup without invite is refused');
  console.log('  (database not fresh: skipping owner-only checks; run against an empty database for the full suite)');
}

if (adminCapable) {
  r = await owner.call('GET', '/api/me');
  assert.equal(r.status, 200); assert.equal(r.data.user.username, ownerName); ok('me');

  // bad login
  const anon = new Client('anon');
  r = await anon.call('POST', '/api/auth/login', { username: ownerName, key: await deriveKey(ownerName, 'wrong password') });
  assert.equal(r.status, 401); ok('wrong password rejected');
  r = await anon.call('GET', '/api/likes');
  assert.equal(r.status, 401); ok('api requires login');

  // invites
  // approval tickets: anyone may ask, nothing works until the owner approves
  const pendName = `pd${rnd()}`;
  const pend = new Client('pend');
  r = await pend.call('POST', '/api/auth/signup', { username: pendName, displayName: 'Pending Pat', message: 'Hi, it is Pat from college', key: await deriveKey(pendName, 'pending pass phrase') });
  assert.equal(r.status, 202, JSON.stringify(r.data)); assert.equal(r.data.pending, true); ok('approval: a sign-up becomes a ticket, not an account');
  r = await pend.call('GET', '/api/likes'); assert.equal(r.status, 401); ok('approval: a waiting person has no access');
  r = await pend.call('POST', '/api/auth/signup', { username: pendName, key: await deriveKey(pendName, 'other') }); assert.equal(r.status, 409); ok('approval: the name is reserved while waiting');
  r = await pend.call('POST', '/api/auth/login', { username: pendName, key: await deriveKey(pendName, 'pending pass phrase') }); assert.equal(r.status, 403); assert.equal(r.data.error, 'pending'); ok('approval: signing in says "waiting for approval"');
  r = await pend.call('POST', '/api/auth/login', { username: pendName, key: await deriveKey(pendName, 'wrong') }); assert.equal(r.status, 401); ok('approval: a wrong password still looks like any wrong password');
  r = await friend.call('GET', '/api/admin/requests'); assert.equal(r.status, 401);
  r = await owner.call('GET', '/api/admin/requests'); const ticket = r.data.requests.find((x) => x.username === pendName);
  assert.ok(ticket && ticket.message.includes('college')); ok('approval: the owner sees the ticket with the message');
  r = await owner.call('POST', `/api/admin/requests/${ticket.id}/approve`, {}); assert.equal(r.status, 200);
  r = await pend.call('POST', '/api/auth/login', { username: pendName, key: await deriveKey(pendName, 'pending pass phrase') }); assert.equal(r.status, 200); ok('approval: after approval the same password signs in');
  const pend2 = `pr${rnd()}`;
  r = await anon.call('POST', '/api/auth/signup', { username: pend2, key: await deriveKey(pend2, 'rejected pass phrase') }); assert.equal(r.status, 202);
  const tk2 = (await owner.call("GET", "/api/admin/requests")).data.requests.find((x) => x.username === pend2);
  r = await owner.call('POST', `/api/admin/requests/${tk2.id}/reject`, {}); assert.equal(r.status, 200);
  r = await anon.call('POST', '/api/auth/login', { username: pend2, key: await deriveKey(pend2, 'rejected pass phrase') }); assert.equal(r.status, 401); ok('approval: a declined request cannot sign in');
  r = await owner.call('POST', '/api/invites', { maxUses: 1, days: 1 });
  assert.equal(r.status, 201); const code = r.data.code;
  r = await friend.call('POST', '/api/auth/signup', { username: friendName, displayName: 'Friend', invite: code, key: await deriveKey(friendName, 'friend pass phrase') });
  assert.equal(r.status, 201, JSON.stringify(r.data)); ok('friend signs up with invite');
  const f2 = new Client('f2');
  r = await f2.call('POST', '/api/auth/signup', { username: `x${rnd()}`, invite: code, key: await deriveKey('zzz', 'abc') });
  assert.equal(r.status, 403); ok('invite is single-use');

  // login on a second "device"
  const ownerPhone = new Client('phone');
  r = await ownerPhone.call('POST', '/api/auth/login', { username: ownerName.toUpperCase(), key: await deriveKey(ownerName, 'correct horse battery'), device: { name: 'Pixel', kind: 'phone' } });
  assert.equal(r.status, 200, JSON.stringify(r.data)); ok('login (case-insensitive username)');
  r = await owner.call('GET', '/api/devices');
  assert.equal(r.data.devices.length, 2); ok('two devices listed for one account');

  // likes
  const t1 = track(1), t2 = track(2);
  r = await owner.call('PUT', '/api/likes', { track: t1 }); assert.equal(r.status, 200);
  r = await owner.call('PUT', '/api/likes', { track: { ...t2, url: 'javascript:alert(1)', artwork: 'http://insecure/x.jpg' } }); assert.equal(r.status, 200);
  r = await owner.call('GET', '/api/likes');
  assert.equal(r.data.tracks.length, 2);
  assert.equal(r.data.tracks.find((t) => t.id === t2.id).url, null); ok('likes + unsafe URLs stripped');
  r = await owner.call('PUT', '/api/likes', { track: { id: 'evil:1', title: 'x' } }); assert.equal(r.status, 400); ok('unknown source rejected');
  r = await owner.call('DELETE', `/api/likes/${encodeURIComponent(t1.id)}`); assert.equal(r.status, 200);

  // playlists
  r = await owner.call('POST', '/api/playlists', { name: 'Gym', tracks: [t1, t2] });
  assert.equal(r.status, 201); const pid = r.data.id;
  r = await owner.call('GET', `/api/playlists/${pid}`);
  assert.equal(r.data.tracks.length, 2); ok('playlist create with tracks');
  const [e1, e2] = r.data.tracks.map((t) => t.entry);
  r = await owner.call('POST', `/api/playlists/${pid}/move`, { entry: e2, before: e1 });
  r = await owner.call('GET', `/api/playlists/${pid}`);
  assert.equal(r.data.tracks[0].entry, e2); ok('playlist reorder');
  r = await friend.call('GET', `/api/playlists/${pid}`); assert.equal(r.status, 403); ok('private playlist hidden from friends');
  r = await owner.call('PATCH', `/api/playlists/${pid}`, { share: true, collab: true });
  const token = r.data.shareToken; assert.ok(token);
  r = await friend.call('GET', `/api/playlists/${pid}?token=${token}`); assert.equal(r.status, 200);
  r = await friend.call('POST', `/api/playlists/${pid}/tracks`, { track: track(3), token }); assert.equal(r.status, 200); ok('collaborative playlist via share link');
  r = await friend.call('POST', `/api/playlists/${pid}/save`, { token }); assert.equal(r.status, 200);
  r = await friend.call('GET', '/api/playlists'); assert.ok(r.data.playlists.some((p) => p.id === pid)); ok('friend can follow shared playlist');
  r = await owner.call('DELETE', `/api/playlists/${pid}/tracks/${e1}`); assert.equal(r.status, 200);

  // history / taste / nowplaying / people
  r = await owner.call('POST', '/api/history', { track: t1, ms: 60000 }); assert.equal(r.status, 200);
  r = await owner.call('GET', '/api/history'); assert.equal(r.data.tracks.length, 1);
  r = await owner.call('GET', '/api/taste'); assert.equal(r.data.artists[0].name, 'Test Artist'); ok('history + taste');
  r = await owner.call('GET', '/api/people'); const fid = r.data.people.find((p) => p.username === friendName).id;
  r = await friend.call('GET', '/api/people'); const oid = r.data.people.find((p) => p.username === ownerName).id;
  r = await friend.call('PUT', `/api/follow/${oid}`); assert.equal(r.status, 200);
  r = await owner.call('PUT', '/api/nowplaying', { track: t1 });
  r = await friend.call('GET', '/api/people');
  assert.equal(r.data.people.find((p) => p.username === ownerName).nowPlaying?.title, 'Song 1'); ok('friend activity');
  r = await owner.call('PATCH', '/api/me', { shareActivity: false });
  r = await friend.call('GET', '/api/people');
  assert.equal(r.data.people.find((p) => p.username === ownerName).nowPlaying, null); ok('activity sharing can be turned off');

  // library items
  r = await owner.call('PUT', '/api/library/album', { ref: 'itunes:123', title: 'Album', artist: 'A', artwork: 'https://x/y.jpg', source: 'itunes' }); assert.equal(r.status, 200);
  r = await owner.call('GET', '/api/library'); assert.equal(r.data.albums.length, 1);
  r = await owner.call('DELETE', '/api/library/album/itunes:123'); r = await owner.call('GET', '/api/library'); assert.equal(r.data.albums.length, 0); ok('saved albums');

  // admin + agent
  r = await owner.call('GET', '/api/admin/overview'); assert.equal(r.status, 200); assert.equal(r.data.users, 3);
  r = await friend.call('GET', '/api/admin/overview'); assert.equal(r.status, 403); ok('admin area is owner-only');
  // first run: opening Home on an empty catalogue starts filling it by itself
  let boot = (await owner.call('GET', '/api/catalog/featured')).data;
  for (let i = 0; i < 25 && !boot.best.length && !boot.new.length; i++) { await new Promise((r2) => setTimeout(r2, 1000)); boot = (await owner.call('GET', '/api/catalog/featured')).data; }
  assert.ok(boot.best.length || boot.new.length, 'catalogue filled itself'); ok('first run: an empty catalogue fills itself');

  // the agent: 4 x 3 tasks against the real sources (best, new, old, radio...)
  const runs = [];
  for (let i = 0; i < 4; i++) {
    r = await owner.call('POST', '/api/admin/ingest', { count: 3 });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    runs.push(...r.data.runs);
  }
  for (const x of runs) console.log(`  agent: ${x.task.padEnd(28)} found ${String(x.fetched).padStart(3)}  added ${String(x.accepted).padStart(3)}  ${x.note.slice(0, 60)}`);
  assert.ok(runs.reduce((s, x) => s + x.accepted, 0) > 40); ok('catalogue agent runs and adds music');
  r = await owner.call('GET', '/api/catalog/featured'); assert.equal(r.status, 200);
  const F = r.data;
  const allShown = [...F.new, ...F.best, ...F.classics, ...F.genres.flatMap((g) => g.tracks)];
  assert.ok(F.best.length >= 8 && F.new.length >= 8, `featured shelves are filled (new ${F.new.length}, best ${F.best.length})`);
  assert.ok(allShown.every((t) => !t.preview && t.kind === 'track' && t.verified), 'no previews, only verified full tracks'); ok('featured: new + best + classics are full songs only');
  const bySource = {};
  for (const t of F.best) bySource[t.source] = (bySource[t.source] || 0) + 1;
  console.log('  best-of shelf by source:', JSON.stringify(bySource), ` total in catalogue: ${F.total}`);
  const audiusNew = F.new.filter((t) => t.source === 'audius');
  assert.ok(audiusNew.every((t, i, a) => i === 0 || a[i - 1].releasedAt >= t.releasedAt), 'newest first'); ok('featured: new is ordered newest first');
  const audiusBest = F.best.filter((t) => t.source === 'audius');
  assert.ok(audiusBest.every((t, i, a) => i === 0 || a[i - 1].pop >= t.pop), 'most played first'); ok('featured: best is ordered by plays');
  r = await owner.call('GET', '/api/catalog?sort=old&limit=10'); assert.equal(r.status, 200);
  r = await owner.call('GET', '/api/catalog?sort=new&source=audius&limit=5'); assert.ok(r.data.tracks.length > 0 && r.data.tracks.every((t) => t.source === 'audius')); ok('catalogue: filters and sorting');

  // password reset flow
  r = await owner.call('POST', `/api/admin/users/${fid}/reset`); const reset = r.data.code; assert.ok(reset);
  const f3 = new Client('f3');
  r = await f3.call('POST', '/api/auth/reset', { username: friendName, code: reset, key: await deriveKey(friendName, 'brand new pass') });
  assert.equal(r.status, 200, JSON.stringify(r.data)); ok('owner-issued password reset');
  r = await friend.call('GET', '/api/likes'); assert.equal(r.status, 401); ok('reset signs out old sessions');

  // podcasts: read a real show's feed through the server, keep an episode, refuse unsafe addresses
  const found = await (await fetch('https://itunes.apple.com/search?term=news&media=podcast&entity=podcast&limit=3')).json();
  const feedUrl = found.results.find((x) => x.feedUrl)?.feedUrl;
  assert.ok(feedUrl, 'iTunes returned a podcast');
  r = await owner.call('GET', `/api/podcast/feed?url=${encodeURIComponent(feedUrl)}`);
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.ok(r.data.episodes.length > 0 && r.data.episodes[0].id.startsWith('pod:') && /^https:/.test(r.data.episodes[0].url)); ok('podcasts: episodes read from a real feed');
  let r2 = await owner.call('PUT', '/api/likes', { track: r.data.episodes[0] }); assert.equal(r2.status, 200);
  r2 = await owner.call('POST', '/api/playlists', { name: 'Podcasts', tracks: r.data.episodes.slice(0, 3) }); assert.equal(r2.status, 201); ok('podcasts: episodes can be liked and put in playlists');
  for (const bad of ['https://127.0.0.1/x', 'file:///etc/passwd', 'https://localhost/feed']) {
    r2 = await owner.call('GET', `/api/podcast/feed?url=${encodeURIComponent(bad)}`); assert.equal(r2.status, 400, bad);
  }
  ok('podcasts: private and non-https addresses are refused');
  r2 = await owner.call('PUT', '/api/library/podcast', { ref: 'itunes:1', title: 'Show', artist: 'A', source: 'itunes', url: feedUrl }); assert.equal(r2.status, 200);
  r2 = await owner.call('GET', '/api/library'); assert.equal(r2.data.podcasts.length, 1); ok('podcasts: following a show');

  // removing a person removes everything they own (database cascades)
  r = await owner.call('POST', '/api/invites', { maxUses: 1, days: 1 });
  const tmp = new Client('tmp'); const tmpName = `tmp${rnd()}`;
  r = await tmp.call('POST', '/api/auth/signup', { username: tmpName, invite: r.data.code, key: await deriveKey(tmpName, 'temporary pass 1') });
  assert.equal(r.status, 201);
  const tmpUserId = r.data.user.id;
  r = await tmp.call('POST', '/api/playlists', { name: 'Doomed', tracks: [track(9)] }); const doomed = r.data.id;
  await tmp.call('PUT', '/api/likes', { track: track(8) });
  r = await owner.call('DELETE', `/api/admin/users/${tmpUserId}`); assert.equal(r.status, 200);
  r = await tmp.call('GET', '/api/me'); assert.equal(r.status, 401);
  r = await owner.call('GET', `/api/playlists/${doomed}`); assert.equal(r.status, 404); ok('removing a user deletes their playlists, likes and sessions');

  // cloud locker (R2): upload, list, stream with Range, privacy, delete
  const audio = Buffer.from(Array.from({ length: 6000 }, (_, i) => (i * 7) % 256));
  const up = await fetch(`${BASE}/api/uploads?name=${encodeURIComponent('My Song.mp3')}&title=${encodeURIComponent('My Song')}&artist=Me&duration=12`, { method: 'POST', headers: { 'x-nexora': '1', cookie: owner.cookie, 'content-type': 'audio/mpeg', 'content-length': String(audio.length) }, body: audio });
  const upBody = await up.json();
  assert.equal(up.status, 201, JSON.stringify(upBody));
  const upId = upBody.id; ok('locker: upload');
  r = await owner.call('GET', '/api/uploads'); assert.equal(r.data.uploads.length, 1); assert.equal(r.data.uploads[0].track.title, 'My Song');
  const rng = await fetch(`${BASE}/api/files/${upId}`, { headers: { cookie: owner.cookie, range: 'bytes=100-199' } });
  assert.equal(rng.status, 206); assert.equal(rng.headers.get('content-range'), 'bytes 100-199/6000');
  assert.deepEqual(Buffer.from(await rng.arrayBuffer()), audio.subarray(100, 200)); ok('locker: Range requests (seeking) work');
  const other = await fetch(`${BASE}/api/files/${upId}`, { headers: { cookie: ownerPhone.cookie } });
  assert.equal(other.status, 200); // same account, other device
  const stranger = new Client('stranger');
  r = await stranger.call('POST', '/api/auth/login', { username: friendName, key: await deriveKey(friendName, 'brand new pass') });
  assert.equal(r.status, 200);
  const denied = await fetch(`${BASE}/api/files/${upId}`, { headers: { cookie: stranger.cookie } });
  assert.equal(denied.status, 403); ok('locker: other people cannot stream your files');
  const bad = await fetch(`${BASE}/api/uploads?name=virus.exe`, { method: 'POST', headers: { 'x-nexora': '1', cookie: owner.cookie, 'content-type': 'application/octet-stream', 'content-length': '10' }, body: Buffer.alloc(10) });
  assert.equal(bad.status, 400); ok('locker: only audio file types accepted');
  r = await owner.call('DELETE', `/api/uploads/${upId}`); assert.equal(r.status, 200);
  r = await owner.call('GET', '/api/uploads'); assert.equal(r.data.uploads.length, 0); ok('locker: delete');

  // catalogue search over what the agent stored (FTS5)
  r = await owner.call('GET', '/api/catalog?limit=5'); assert.ok(r.data.tracks.length > 0); ok('catalogue: list verified tracks');
  const word = r.data.tracks[0].title.split(/\s+/)[0].replace(/[^\p{L}\p{N}]/gu, '');
  r = await owner.call('GET', `/api/catalog?q=${encodeURIComponent(word)}&limit=5`); assert.ok(r.data.tracks.length > 0); ok('catalogue: full-text search');

  // asset updates: the audio behind a recording is replaced, its identity and everything pointing at it stay
  const pick = (await owner.call('GET', '/api/catalog?limit=3')).data.tracks[0];
  const enc = encodeURIComponent(pick.id);
  r = await owner.call('GET', `/api/tracks/assets?ids=${enc}`); assert.equal(r.data.assets[pick.id].rev, 1); ok('assets: new recordings start at revision 1');
  r = await f3.call('POST', '/api/admin/assets', { action: 'UpdateAsset', id: pick.id, audioUrl: 'https://example.com/v2.mp3' }); assert.equal(r.status, 403); ok('assets: only the owner can deliver an update');
  r = await owner.call('POST', '/api/admin/assets', { action: 'Nope', id: pick.id }); assert.equal(r.status, 400);
  r = await owner.call('POST', '/api/admin/assets', { action: 'UpdateAsset', isrc: 'NOT-AN-ISRC', audioUrl: 'https://example.com/v2.mp3' }); assert.equal(r.status, 400); ok('assets: bad ISRC and bad action refused');
  r = await owner.call('POST', '/api/admin/assets', { action: 'UpdateAsset', id: 'audius:does-not-exist', audioUrl: 'https://example.com/v2.mp3' }); assert.equal(r.status, 404);
  r = await owner.call('POST', '/api/admin/assets', { action: 'UpdateAsset', id: pick.id, isrc: 'us-um7-15-00001', audioUrl: 'http://insecure.example/v2.mp3' }); assert.equal(r.status, 400); ok('assets: audio must be an https address');
  r = await owner.call('POST', '/api/admin/assets', { action: 'UpdateAsset', id: pick.id, isrc: 'us-um7-15-00001', audioUrl: 'https://example.com/v2.mp3', duration: 201 });
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.updated[0].rev, 2); ok('assets: UpdateAsset swaps the audio and raises the revision');
  r = await owner.call('GET', `/api/tracks/assets?ids=${enc}`); assert.equal(r.data.assets[pick.id].url, 'https://example.com/v2.mp3'); assert.equal(r.data.assets[pick.id].rev, 2);
  // someone's old playlist snapshot must not bring the old audio back
  r = await owner.call('PUT', '/api/likes', { track: { ...pick, url: 'https://old.example/v1.mp3', duration: 180 } }); assert.equal(r.status, 200);
  r = await owner.call('GET', `/api/tracks/assets?ids=${enc}`); assert.equal(r.data.assets[pick.id].url, 'https://example.com/v2.mp3'); ok('assets: a stale copy in a like cannot overwrite the new audio');
  r = await owner.call('GET', '/api/likes'); assert.equal(r.data.tracks.find((x) => x.id === pick.id).isrc, 'USUM71500001'); ok('assets: likes keep working and carry the ISRC');
  r = await owner.call('POST', '/api/admin/assets', { action: 'UpdateAsset', isrc: 'USUM71500001', audioUrl: 'https://example.com/v3.mp3' }); assert.equal(r.data.updated[0].rev, 3); ok('assets: a recording can be addressed by its ISRC');
  r = await owner.call('POST', '/api/admin/assets', { action: 'UpdateMetadata', id: pick.id, title: 'Fixed Title' }); assert.equal(r.status, 200);
  r = await owner.call('GET', '/api/likes'); assert.equal(r.data.tracks.find((x) => x.id === pick.id).title, 'Fixed Title'); ok('assets: metadata fixes show up everywhere');
  r = await owner.call('POST', '/api/admin/assets', { action: 'TakeDown', id: pick.id, reason: 'rights holder request' }); assert.equal(r.data.updated[0].rev, 4);
  r = await owner.call('GET', `/api/tracks/assets?ids=${enc}`); assert.equal(r.data.assets[pick.id].gone, true);
  r = await owner.call('GET', '/api/catalog?limit=50'); assert.ok(!r.data.tracks.some((x) => x.id === pick.id)); ok('assets: TakeDown hides the recording and tells devices to drop saved copies');
  r = await owner.call('GET', '/api/admin/assets'); assert.ok(r.data.log.length >= 4 && r.data.log[0].action === 'TakeDown'); ok('assets: the change log records every delivery');

  // world catalogue: the open music databases (MusicBrainz / ListenBrainz), with ISRCs
  r = await anon.call('GET', '/api/world/search?q=tum+hi+ho'); assert.equal(r.status, 401); ok('world: needs sign-in');
  r = await owner.call('GET', '/api/world/search?q=a'); assert.equal(r.status, 400);
  r = await owner.call('GET', '/api/world/search?q=tum+hi+ho+arijit'); assert.equal(r.status, 200, JSON.stringify(r.data));
  const tum = r.data.tracks.find((x) => x.isrc);
  assert.ok(tum && tum.id.startsWith('mb:') && tum.title.toLowerCase().includes('tum hi ho')); ok('world: search finds a song with its ISRC');
  r = await owner.call('GET', `/api/world/isrc/${tum.isrc.toLowerCase()}`); assert.equal(r.status, 200); assert.ok(r.data.tracks.length >= 1); ok('world: look a recording up by ISRC');
  r = await owner.call('GET', '/api/world/isrc/NOTANISRC'); assert.equal(r.status, 400);
  r = await owner.call('GET', `/api/world/release/${tum.meta.releaseId}`); assert.equal(r.status, 200); assert.ok(r.data.tracks.length > 0 && r.data.release.name); ok('world: a release with its tracklist');
  r = await owner.call('GET', '/api/world/release/not-an-id'); assert.equal(r.status, 400);
  r = await owner.call('GET', '/api/world/new?limit=10'); assert.equal(r.status, 200); assert.ok(r.data.releases.length > 0 && r.data.releases[0].mbid); ok('world: what just came out, from every platform');
  r = await owner.call('GET', `/api/world/play?title=${encodeURIComponent(tum.title)}&artist=${encodeURIComponent(tum.artist)}&isrc=${tum.isrc}`); assert.equal(r.status, 200); assert.ok(['full', 'preview', 'none'].includes(r.data.kind)); ok(`world: playing an entry finds audio (${r.data.kind})`);
  // a song the open catalogue holds in full is preferred over a preview
  const heldFull = (await owner.call('GET', '/api/catalog?limit=1')).data.tracks[0];
  if (heldFull) { r = await owner.call('GET', `/api/world/play?title=${encodeURIComponent(heldFull.title)}&artist=${encodeURIComponent(heldFull.artist)}`); assert.equal(r.data.kind, 'full'); assert.equal(r.data.track.id, heldFull.id); ok('world: the full song wins over a preview'); }
  r = await owner.call('PUT', '/api/likes', { track: tum }); assert.equal(r.status, 200);
  r = await owner.call('GET', '/api/likes'); assert.ok(r.data.tracks.some((x) => x.id === tum.id && x.isrc === tum.isrc)); ok('world: a listing can be liked and keeps its ISRC');

  // realtime hub
  const wsUrl = BASE.replace('http', 'ws') + '/api/ws';
  const open = (cl) => new Promise((res, rej) => {
    const ws = new WebSocket(wsUrl, { headers: { cookie: cl.cookie, origin: BASE } });
    ws.addEventListener('open', () => res(ws)); ws.addEventListener('error', (e) => rej(new Error('ws error ' + (e.message || ''))));
  });
  const wsA = await open(owner), wsB = await open(ownerPhone);
  const inbox = [];
  wsB.addEventListener('message', (e) => inbox.push(JSON.parse(e.data)));
  await new Promise((r2) => setTimeout(r2, 400));
  const presence = inbox.filter((m) => m.t === 'presence').at(-1);
  assert.equal(presence.devices.length, 2); ok('realtime: both devices online');
  const devs = (await owner.call('GET', '/api/devices')).data.devices;
  const dA = devs.find((d) => d.name === 'Test PC');
  wsA.send(JSON.stringify({ t: 'state', state: { track: { id: t1.id, title: 'Song 1', artist: 'Test Artist', duration: 180 }, playing: true, pos: 12, vol: 0.8 } }));
  await new Promise((r2) => setTimeout(r2, 300));
  assert.ok(inbox.some((m) => m.t === 'state' && m.state.track.title === 'Song 1')); ok('realtime: playback state shared');
  const phoneDev = devs.find((d) => d.name === 'Pixel');
  const got = new Promise((res) => wsA.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.t === 'cmd') res(m); }));
  wsB.send(JSON.stringify({ t: 'cmd', to: dA.id, cmd: 'pause', args: {} }));
  const cmd = await Promise.race([got, new Promise((r2) => setTimeout(() => r2(null), 2000))]);
  assert.equal(cmd?.cmd, 'pause'); ok('realtime: remote control command delivered');
  // 'pull' (take playback back from another device) must be relayed too
  const gotPull = new Promise((res) => wsA.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.t === 'cmd' && m.cmd === 'pull') res(m); }));
  wsB.send(JSON.stringify({ t: 'cmd', to: dA.id, cmd: 'pull', args: {} }));
  assert.equal((await Promise.race([gotPull, new Promise((r2) => setTimeout(() => r2(null), 2000))]))?.cmd, 'pull'); ok('realtime: pull command delivered');
  wsA.send(JSON.stringify({ t: 'cmd', to: dA.id, cmd: 'rm -rf', args: {} })); // unknown commands are dropped silently
  const evilOpened = await new Promise((res) => {
    const ws = new WebSocket(wsUrl, { headers: { cookie: owner.cookie, origin: 'https://evil.example' } });
    ws.addEventListener('open', () => { ws.close(); res(true); });
    ws.addEventListener('error', () => res(false));
    ws.addEventListener('close', () => res(false));
  });
  assert.equal(evilOpened, false); ok('realtime: cross-site socket refused');
  // listen together: a room is a command bus shared by everyone who joined
  r = await owner.call('POST', '/api/rooms', {}); assert.equal(r.status, 201); const roomCode = r.data.code; assert.match(roomCode, /^[A-Z2-9]{6}$/); ok('rooms: start');
  r = await f3.call('GET', `/api/rooms/${roomCode.toLowerCase()}`); assert.equal(r.status, 200); assert.equal(r.data.hostId !== undefined, true); ok('rooms: friend can look the code up');
  r = await f3.call('GET', '/api/rooms/ZZZZZZ'); assert.equal(r.status, 404); ok('rooms: unknown code is a clean 404');
  const rwsUrl = (code) => BASE.replace('http', 'ws') + `/api/rooms/${code}/ws`;
  const openRoom = (cl, code) => new Promise((res, rej) => {
    const ws = new WebSocket(rwsUrl(code), { headers: { cookie: cl.cookie, origin: BASE } });
    ws.inbox = []; ws.addEventListener('message', (e) => ws.inbox.push(JSON.parse(e.data)));
    ws.addEventListener('open', () => res(ws)); ws.addEventListener('error', () => rej(new Error('room ws error')));
  });
  const wait = (ms) => new Promise((r2) => setTimeout(r2, ms));
  const rh = await openRoom(owner, roomCode);
  const rg = await openRoom(f3, roomCode);
  await wait(500);
  assert.equal(rg.inbox.filter((m) => m.t === 'presence').at(-1).members.length, 2); ok('rooms: both members present');
  assert.ok(rh.inbox.some((m) => m.t === 'need-sync')); ok('rooms: newcomer makes the host send a snapshot');
  const needTo = rh.inbox.find((m) => m.t === 'need-sync').to;
  rh.send(JSON.stringify({ t: 'snapshot', to: needTo, snapshot: { queue: [], index: 0 } })); await wait(300);
  assert.ok(rg.inbox.some((m) => m.t === 'cmd' && m.cmd === 'transfer')); ok('rooms: snapshot reaches only the newcomer');
  assert.ok(!rh.inbox.some((m) => m.t === 'cmd' && m.cmd === 'transfer'));
  rg.send(JSON.stringify({ t: 'cmd', cmd: 'pause', args: {} })); await wait(300);
  assert.ok(rh.inbox.some((m) => m.t === 'cmd' && m.cmd === 'pause') && rg.inbox.some((m) => m.t === 'cmd' && m.cmd === 'pause')); ok('rooms: a guest command reaches everyone, including the sender');
  rg.send(JSON.stringify({ t: 'cmd', cmd: 'rm -rf', args: {} })); rg.send(JSON.stringify({ t: 'sync', id: 'x', pos: 1, playing: true })); await wait(300);
  assert.ok(!rh.inbox.some((m) => m.cmd === 'rm -rf' || m.t === 'sync')); ok('rooms: unknown commands and guest heartbeats are dropped');
  rh.send(JSON.stringify({ t: 'sync', id: 'audius:x', pos: 42, playing: true })); await wait(300);
  assert.equal(rg.inbox.find((m) => m.t === 'sync')?.pos, 42); ok('rooms: host heartbeat reaches listeners');
  r = await f3.call('DELETE', `/api/rooms/${roomCode}`); assert.equal(r.status, 403); ok('rooms: only the host can end it');
  r = await owner.call('DELETE', `/api/rooms/${roomCode}`); assert.equal(r.status, 200); await wait(300);
  assert.ok(rg.inbox.some((m) => m.t === 'ended')); ok('rooms: ending notifies everyone');
  r = await f3.call('GET', `/api/rooms/${roomCode}`); assert.equal(r.status, 404); ok('rooms: ended room cannot be joined');
  rh.close(); rg.close();
  wsA.close(); wsB.close();
  void phoneDev;
}

console.log(`\n${passed} checks passed`);
process.exit(0);
