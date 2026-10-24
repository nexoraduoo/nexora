import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFilter, optionsFor } from '../public/js/filterlogic.js';
import { cleanIsrc } from '../src/tracks.js';

const T = [
  { id: 'a', title: 'Sunrise', artist: 'Ava', album: 'Day', genre: 'Pop', mood: 'happy' },
  { id: 'b', title: 'Night Drive', artist: 'Ava', album: 'Night', genre: 'Electronic', mood: 'chill' },
  { id: 'c', title: 'Monsoon', artist: 'Ravi', album: 'Rain', genre: 'Pop', mood: 'chill' },
  { id: 'd', title: 'No tags', artist: '', album: '', genre: null, mood: null },
];

test('options are the distinct values, most common first, empty ones left out', () => {
  assert.deepEqual(optionsFor(T, 'genre'), [{ value: 'Pop', n: 2 }, { value: 'Electronic', n: 1 }]);
  assert.deepEqual(optionsFor(T, 'artist').map((o) => o.value), ['Ava', 'Ravi']);
  assert.deepEqual(optionsFor(T, 'mood').map((o) => o.value), ['chill', 'happy']);
});

test('filters combine: genre AND mood AND text', () => {
  assert.deepEqual(applyFilter(T, {}).length, 4);
  assert.deepEqual(applyFilter(T, { genre: 'Pop' }).map((t) => t.id), ['a', 'c']);
  assert.deepEqual(applyFilter(T, { genre: 'Pop', mood: 'chill' }).map((t) => t.id), ['c']);
  assert.deepEqual(applyFilter(T, { artist: 'Ava', album: 'Night' }).map((t) => t.id), ['b']);
  assert.deepEqual(applyFilter(T, { q: ' rain ' }).map((t) => t.id), ['c']); // matches the album, ignores case and spaces
  assert.deepEqual(applyFilter(T, { genre: 'Jazz' }), []);
});

test('ISRC: 12 characters, accepted with dashes and lower case, rejected otherwise', () => {
  assert.equal(cleanIsrc('USUM71500001'), 'USUM71500001');
  assert.equal(cleanIsrc('us-um7-15-00001'), 'USUM71500001');
  assert.equal(cleanIsrc(' GBAYE 0601498 '), 'GBAYE0601498');
  for (const bad of ['', 'US', 'USUM7150000', 'USUM715000012', '12UM71500001', 'USUM7A500001', null, 42]) assert.equal(cleanIsrc(bad), null, String(bad));
});
