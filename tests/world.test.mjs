import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, recordingToTrack, ISRC_RE, MBID_RE } from '../src/world.js';

test('a typed search becomes "every word in title, artist or album"', () => {
  const q = buildQuery('tum hi ho arijit');
  assert.equal((q.match(/ AND /g) || []).length, 3);
  assert.ok(q.includes('recording:"tum" OR artist:"tum" OR release:"tum"'));
});

test('search text cannot inject query syntax', () => {
  const q = buildQuery('a" OR artist:* AND (x');
  assert.ok(!q.includes('artist:*'));
  assert.ok(!/[()]\s*\)/.test(q.replace(/\(recording:"[^"]*" OR artist:"[^"]*" OR release:"[^"]*"\)/g, '')));
  assert.equal(buildQuery('   '), '');
  assert.equal(buildQuery('!!!'), '');
});

test('an ISRC typed anywhere (dashes, lower case) searches by ISRC', () => {
  assert.equal(buildQuery('us-um7-15-00001'), 'isrc:USUM71500001');
  assert.equal(buildQuery('INS181303031'), 'isrc:INS181303031');
  assert.ok(ISRC_RE.test('USUM71500001') && !ISRC_RE.test('USUM7150000'));
  assert.ok(MBID_RE.test('e6e4fba1-ad29-4df2-87c7-042268c87f39') && !MBID_RE.test('nope'));
});

test('a MusicBrainz recording becomes a Nexora track with its ISRC, cover and year', () => {
  const t = recordingToTrack({
    id: '1a67e215-a19e-40c9-9b12-732de134bf5f', title: 'Blinding Lights', length: 200046,
    'artist-credit': [{ name: 'The Weeknd', joinphrase: ' feat. ' }, { name: 'Someone' }],
    isrcs: ['USUG11904206', 'X'], 'first-release-date': '2019-11-29',
    releases: [{ id: 'e6e4fba1-ad29-4df2-87c7-042268c87f39', title: 'After Hours' }],
  });
  assert.equal(t.id, 'mb:1a67e215-a19e-40c9-9b12-732de134bf5f');
  assert.equal(t.artist, 'The Weeknd feat. Someone');
  assert.equal(t.isrc, 'USUG11904206');
  assert.equal(t.duration, 200);
  assert.equal(t.year, 2019);
  assert.equal(t.url, null);
  assert.ok(t.artwork.includes('/release/e6e4fba1'));
  assert.equal(t.album, 'After Hours');
});

test('a bare recording does not crash', () => {
  const t = recordingToTrack({ id: 'x', title: 'Untitled' });
  assert.equal(t.artist, 'Unknown artist');
  assert.equal(t.isrc, null);
  assert.equal(t.artwork, null);
});
