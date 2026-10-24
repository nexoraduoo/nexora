import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../public/js/shared/sources.js';
import { verifyTrack, moodOf, buildTasks, tidyTitle, label } from '../src/ingest.js';
import { interleave } from '../src/catalog-queries.js';
import { cleanTrack } from '../src/tracks.js';
import { describeDevice } from '../src/util.js';

// shapes copied from real API responses
const itunesRow = { trackId: 6824480524, artistId: 484568188, collectionId: 6824480333, artistName: 'Arijit Singh', collectionName: 'Pyaar Unlimited', trackName: 'Ek Din Title Track', previewUrl: 'https://audio-ssl.itunes.apple.com/x.m4a', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/abc/100x100bb.jpg', trackTimeMillis: 261818, primaryGenreName: 'Bollywood', releaseDate: '2026-02-23T12:00:00Z', trackExplicitness: 'notExplicit', trackViewUrl: 'https://music.apple.com/x' };
const audiusRow = { id: 'mzXmz1', title: 'On The Floor', duration: 180, genre: 'Pop', mood: 'Upbeat', is_downloadable: true, access: { stream: true, download: true }, artwork: { '480x480': 'https://cdn.example/480x480.jpg' }, user: { id: 'u1', name: 'Ciara', is_verified: true }, permalink: '/ciara/on-the-floor', release_date: '2021-04-20T08:00:10Z' };

test('iTunes rows become preview-only tracks with hi-res art and language', () => {
  const t = S.fromItunes(itunesRow);
  assert.equal(t.id, 'itunes:6824480524');
  assert.equal(t.preview, true);
  assert.equal(t.downloadable, false);
  assert.equal(t.lang, 'hi');
  assert.match(t.artwork, /600x600bb\.jpg$/);
  assert.equal(t.meta.fullDuration, 262);
  assert.equal(S.fromItunes({ ...itunesRow, previewUrl: undefined }), null);
});

test('Audius rows stream through the stable redirect URL and keep download rights', () => {
  const t = S.fromAudius(audiusRow);
  assert.equal(t.url, 'https://api.audius.co/v1/tracks/mzXmz1/stream?app_name=NEXORA');
  assert.equal(t.preview, false);
  assert.equal(t.downloadable, true);
  assert.equal(t.meta.verifiedArtist, true);
  assert.equal(S.fromAudius({ ...audiusRow, access: { stream: false } }), null);
  assert.equal(S.fromAudius({ ...audiusRow, is_delete: true }), null);
  assert.equal(S.fromAudius({ ...audiusRow, is_downloadable: false }).downloadable, false);
});

test('radio stations: only secure, working streams', () => {
  const ok = { stationuuid: 'a', name: ' Test FM ', url_resolved: 'https://x.example/live', tags: 'pop,hits', lastcheckok: 1, languagecodes: 'te' };
  assert.equal(S.fromStation(ok).kind, 'radio');
  assert.equal(S.fromStation(ok).lang, 'te');
  assert.equal(S.fromStation({ ...ok, url_resolved: 'http://insecure.example/x' }), null);
  assert.equal(S.fromStation({ ...ok, hls: 1 }), null);
  assert.equal(S.fromStation({ ...ok, lastcheckok: 0 }), null);
});

test('script and genre based language detection', () => {
  assert.equal(S.detectLang('తెలుగు పాట'), 'te');
  assert.equal(S.detectLang('अरिजीत'), 'hi');
  assert.equal(S.detectLang('방탄소년단'), 'ko');
  assert.equal(S.detectLang('Hello'), null);
  assert.equal(S.langFromGenre('Telugu'), 'te');
  assert.equal(S.langFromGenre('K-Pop'), 'ko');
});

test('LRC lyrics parsing', () => {
  const l = S.parseLRC('[00:12.50]Hello\n[01:03.00]World\n[00:05.00][02:00.00]Twice\nno stamp');
  assert.deepEqual(l.map((x) => [x.t, x.line]), [[5, 'Twice'], [12.5, 'Hello'], [63, 'World'], [120, 'Twice']]);
});

test('ranking prefers the original over live/remix/karaoke versions', () => {
  const orig = { title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', preview: true, kind: 'track' };
  const live = { ...orig, title: 'Blinding Lights (Live)' };
  const karaoke = { ...orig, title: 'Blinding Lights (Karaoke Version)', artist: 'Party Tyme', preview: false };
  const remix = { ...orig, title: 'Blinding Lights - Remix' };
  const best = S.bestMatch('blinding lights', [karaoke, live, remix, orig]);
  assert.equal(best, orig);
  assert.equal(S.bestMatch('blinding lights live', [orig, live]), live, 'asking for live gets live');
  assert.ok(S.score('tum hi ho arijit singh', { title: 'Tum Hi Ho', artist: 'Arijit Singh', album: 'Aashiqui 2', kind: 'track' }) > S.score('tum hi ho arijit singh', { title: 'Tum Hi Ho', artist: 'Someone Else', album: '', kind: 'track' }));
});

test('catalogue agent: verification rules', () => {
  const good = { id: 'audius:1', kind: 'track', title: 'Song', artist: 'A', url: 'https://x/y', license: 'CC', duration: 180 };
  assert.equal(verifyTrack(good), null);
  assert.match(verifyTrack({ ...good, url: 'http://x/y' }), /secure/);
  assert.match(verifyTrack({ ...good, license: null }), /licence/);
  assert.match(verifyTrack({ ...good, duration: 8 }), /short/);
  assert.match(verifyTrack({ ...good, title: 'Epic Type Beat free download' }), /spam/);
  assert.match(verifyTrack({ ...good, artist: '' }), /artist/);
  for (const junk of ['Unit 01 Tape 1.1', 'yt1s.com - Where The Wild Things Are', 'Complete Discworld Audiobook', 'Interview with a Legend']) assert.match(verifyTrack({ ...good, title: junk }), /spam/, junk);
  assert.match(verifyTrack({ ...good, preview: true, duration: 30 }), /preview/, 'the catalogue is full songs only');
});

test('catalogue agent: mood tagging and task rotation', () => {
  assert.equal(moodOf({ title: 'Lofi rain', genre: 'Ambient' }), 'chill');
  assert.equal(moodOf({ title: 'Prema', mood: 'Tender' }), 'romance');
  assert.equal(moodOf({ title: 'Gym Beast', genre: '' }), 'energy');
  assert.equal(moodOf({ title: 'Plain', genre: '' }), null);
  const tasks = buildTasks({});
  assert.ok(tasks.length > 60);
  assert.ok(tasks.some((x) => x.kind === 'radio' && x.language === 'telugu'));
  assert.ok(!tasks.some((x) => x.kind === 'jamendo'));
  assert.ok(buildTasks({ jamendoKey: 'k' }).some((x) => x.kind === 'jamendo'));
});

test('server-side track validation blocks unsafe data', () => {
  const base = { id: 'audius:abc', title: 'T', artist: 'A', url: 'https://ok/x.mp3', artwork: 'https://ok/a.jpg' };
  assert.equal(cleanTrack(base).url, 'https://ok/x.mp3');
  assert.equal(cleanTrack({ ...base, url: 'javascript:alert(1)' }).url, null);
  assert.equal(cleanTrack({ ...base, artwork: 'data:image/png;base64,xx' }).artwork, null);
  assert.equal(cleanTrack({ ...base, id: 'evil:1' }), null);
  assert.equal(cleanTrack({ ...base, id: 'up:123' }), null, 'clients cannot forge uploads');
  assert.ok(cleanTrack({ ...base, id: 'up:123' }, { trusted: true }));
  assert.equal(cleanTrack({ ...base, title: '   ' }), null);
  assert.equal(cleanTrack({ ...base, title: 'x'.repeat(1000) }).title.length, 300);
  assert.deepEqual(JSON.parse(cleanTrack({ ...base, meta: { albumId: 'itunes:1', evil: '<script>' } }).meta), { albumId: 'itunes:1' });
});

test('catalogue v2: tasks cover best, new and old, and keep rotating', () => {
  const tasks = buildTasks({});
  const modes = new Set(tasks.map((t) => t.mode));
  assert.ok(['best', 'new', 'old', 'radio'].every((m) => modes.has(m)));
  assert.ok(tasks.some((t) => t.kind === 'audius' && t.time === 'allTime'));
  assert.ok(tasks.some((t) => t.kind === 'ia' && t.mode === 'old' && t.before === 1989), 'old recordings before 1990');
  assert.ok(tasks.some((t) => t.kind === 'ia' && t.mode === 'old' && t.before === 1959), 'very old recordings');
  assert.ok(tasks.some((t) => t.kind === 'ccmixter'));
  assert.ok(tasks.every(Boolean));
  assert.ok(new Set(tasks.slice(0, 12).map((t) => t.mode)).size >= 3, 'the first dozen tasks already mix best, new and old');
  assert.equal(label({ kind: 'audius', mode: 'best', genre: 'Jazz' }), 'audius:best/Jazz');
});

test('titles are tidied for display', () => {
  assert.equal(tidyTitle('Rowsfred - CLAWN [FREE DL] \u{1F525}', 'Rowsfred'), 'CLAWN');
  assert.equal(tidyTitle('Night Drive (Official Audio)', 'x'), 'Night Drive');
  assert.equal(tidyTitle('!!!', ''), '!!!');
  assert.equal(tidyTitle('01. I. Allegro', ''), 'I. Allegro');
  assert.equal(tidyTitle('12 - Moonlight', ''), 'Moonlight');
  assert.equal(tidyTitle('1999', ''), '1999', 'a title that is only a number stays');
});

test('interleave takes one from each source in turn without repeats', () => {
  const mk = (src, n) => Array.from({ length: n }, (_, i) => ({ id: `${src}${i}` }));
  assert.deepEqual(interleave([mk('a', 5), mk('b', 2), mk('c', 3)], 7).map((t) => t.id), ['a0', 'b0', 'c0', 'a1', 'b1', 'c1', 'a2']);
});

test('adapters carry popularity and release dates', () => {
  const a = S.fromAudius({ id: 'z', title: 'T', duration: 100, access: { stream: true }, user: { name: 'U' }, play_count: 1234, release_date: '2024-05-01T00:00:00Z' });
  assert.equal(a.pop, 1234);
  assert.equal(a.releasedAt, Date.parse('2024-05-01T00:00:00Z'));
  const c = S.fromCcmixter({ upload_id: 7, upload_name: 'Song', user_name: 'Bob', license_url: 'http://creativecommons.org/licenses/by/3.0/', license_name: 'Attribution', qrank: '900', upload_date_format: 'Thu, Sep 11, 2008 @ 12:06 PM', files: [{ download_url: 'https://ccmixter.org/x.mp3', file_format_info: { 'default-ext': 'mp3', ps: '2:45' } }] });
  assert.equal(c.id, 'ccmixter:7');
  assert.equal(c.duration, 165);
  assert.equal(c.pop, 900);
  assert.equal(c.year, 2008);
  assert.equal(S.fromCcmixter({ upload_id: 8, upload_name: 'x', files: [{ download_url: 'http://insecure/x.mp3', file_format_info: { 'default-ext': 'mp3' } }], license_url: 'x' }), null);
  assert.equal(cleanTrack({ ...c }).pop, 900);
});

test('device names from user agents', () => {
  assert.deepEqual(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64) AppleWebKit Chrome/120 Safari/537'), { name: 'Chrome on Windows', kind: 'desktop' });
  assert.deepEqual(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17 Mobile Safari/604'), { name: 'Safari on iPhone', kind: 'phone' });
  assert.equal(describeDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile Safari').kind, 'phone');
  assert.equal(describeDevice('Mozilla/5.0 (Linux; Android 13; SM-X700) Chrome/120 Safari').kind, 'tablet');
  assert.equal(describeDevice('Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit').kind, 'tv');
});
