import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findVideo, parseISODuration, pickBest, YtError } from '../src/yt.js';

const want = { title: 'Blinding Lights', artist: 'The Weeknd', duration: 200 };
const v = (o) => ({ id: 'x', title: 'Blinding Lights', channel: 'The Weeknd - Topic', duration: 201, embeddable: true, ...o });

test('ISO durations', () => {
  assert.equal(parseISODuration('PT3M20S'), 200);
  assert.equal(parseISODuration('PT1H2M3S'), 3723);
  assert.equal(parseISODuration('PT45S'), 45);
  assert.equal(parseISODuration('garbage'), 0);
});

test('prefers the official audio over covers, live and wrong-length videos', () => {
  const best = pickBest([
    v({ id: 'cover', title: 'Blinding Lights (cover)', channel: 'Some Singer' }),
    v({ id: 'live', title: 'The Weeknd - Blinding Lights (Live)', channel: 'TheWeekndVEVO', duration: 260 }),
    v({ id: 'topic', title: 'Blinding Lights', channel: 'The Weeknd - Topic', duration: 200 }),
    v({ id: 'long', title: 'Blinding Lights 1 hour loop', channel: 'Loops', duration: 3600 }),
  ], want);
  assert.equal(best.id, 'topic');
});

test('never picks videos that cannot be embedded, and gives up on poor matches', () => {
  assert.equal(pickBest([v({ id: 'a', embeddable: false })], want), null);
  assert.equal(pickBest([v({ id: 'b', title: 'Totally different song', channel: 'Nobody', duration: 90 })], want), null);
});

function fakeYouTube(routes) {
  return async (url) => {
    const u = new URL(url);
    const r = routes[u.pathname.split('/').pop()];
    return new Response(JSON.stringify(r.body), { status: r.status || 200 });
  };
}

test('finds a video through search + details (official API shapes)', async () => {
  const f = fakeYouTube({
    search: { body: { items: [{ id: { videoId: 'aaa' }, snippet: { title: 'Blinding Lights', channelTitle: 'The Weeknd - Topic' } }, { id: { videoId: 'bbb' }, snippet: { title: 'Blinding Lights (Lyrics)', channelTitle: 'Lyric Guy' } }] } },
    videos: { body: { items: [{ id: 'aaa', contentDetails: { duration: 'PT3M20S' }, status: { embeddable: true } }, { id: 'bbb', contentDetails: { duration: 'PT3M21S' }, status: { embeddable: false } }] } },
  });
  const r = await findVideo(want, 'KEY', f);
  assert.deepEqual(r, { videoId: 'aaa', title: 'Blinding Lights', channel: 'The Weeknd - Topic' });
  assert.equal(await findVideo(want, 'KEY', fakeYouTube({ search: { body: { items: [] } } })), null);
});

test('friendly errors for a bad key, a disabled API and used-up quota', async () => {
  const err = (status, reason, message = '') => fakeYouTube({ search: { status, body: { error: { message, errors: [{ reason }] } } } });
  await assert.rejects(findVideo(want, 'k', err(400, 'badRequest', 'API key not valid. Please pass a valid API key.')), (e) => e instanceof YtError && e.code === 'yt_key_invalid');
  await assert.rejects(findVideo(want, 'k', err(403, 'quotaExceeded')), (e) => e.code === 'yt_quota' && e.status === 429);
  await assert.rejects(findVideo(want, 'k', err(403, 'accessNotConfigured')), (e) => e.code === 'yt_not_enabled');
});

import { lineFor } from '../src/routes/youtube.js';
test('YouTube Music playlist entries become "Title - Artist" lines', () => {
  assert.equal(lineFor({ snippet: { title: 'Tum Hi Ho (Official Video)', videoOwnerChannelTitle: 'Arijit Singh - Topic' } }), 'Tum Hi Ho - Arijit Singh');
  assert.equal(lineFor({ snippet: { title: 'Blinding Lights', videoOwnerChannelTitle: 'The Weeknd' } }), 'Blinding Lights - The Weeknd');
  assert.equal(lineFor({ snippet: { title: 'The Weeknd - Starboy', videoOwnerChannelTitle: 'The Weeknd' } }), 'The Weeknd - Starboy');
  assert.equal(lineFor({ snippet: { title: 'Deleted video' } }), null);
});
