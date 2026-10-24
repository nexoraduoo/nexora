import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMixes, seededShuffle, rng, daySeed } from '../public/js/mixplan.js';

const KNOWN = ['Pop', 'Jazz', 'Rock', 'Electronic', 'Hip-Hop/Rap', 'Lo-Fi', 'Folk', 'Ambient', 'Classical', 'Blues', 'Latin'];

test('the same day always gives the same random order, another day a different one', () => {
  const a = Array.from({ length: 30 }, (_, i) => i);
  assert.deepEqual(seededShuffle(a, 20261024), seededShuffle(a, 20261024));
  assert.notDeepEqual(seededShuffle(a, 20261024), seededShuffle(a, 20261025));
  assert.deepEqual([...seededShuffle(a, 5)].sort((x, y) => x - y), a, 'nothing is lost or duplicated');
  assert.equal(rng(1)(), rng(1)());
  assert.equal(daySeed(new Date(2026, 9, 24)), 20261024);
});

test('mixes follow what you listen to', () => {
  const specs = planMixes({ genres: [{ name: 'jazz', n: 9 }, { name: 'Rock', n: 4 }, { name: 'Bollywood', n: 3 }], langs: [] }, 20261024, KNOWN);
  assert.deepEqual(specs.slice(0, 2).map((s) => s.genre), ['Jazz', 'Rock'], 'known genres first, matched without case');
  assert.equal(specs[0].title, 'Daily Mix 1');
  assert.ok(specs.some((s) => s.id === 'time-machine') && specs.some((s) => s.id === 'fresh') && specs.some((s) => s.id === 'discover'));
  const genres = specs.filter((s) => s.id.startsWith('daily-') || s.id === 'discover').map((s) => s.genre).filter(Boolean);
  assert.equal(new Set(genres).size, genres.length, 'Discover never repeats a daily mix genre');
});

test('a favourite language gets its own mix', () => {
  const specs = planMixes({ genres: [{ name: 'Pop', n: 3 }], langs: [{ name: 'te', n: 12 }] }, 20261024, KNOWN);
  const lang = specs.find((s) => s.id === 'daily-lang');
  assert.equal(lang.title, 'Telugu Mix');
  assert.deepEqual(lang.q, { lang: 'te' });
});

test('a brand new listener still gets full, varied mixes that change daily', () => {
  const today = planMixes({}, 20261024, KNOWN);
  const tomorrow = planMixes({}, 20261025, KNOWN);
  assert.ok(today.length >= 5);
  assert.ok(today.slice(0, 3).every((s) => s.genre && KNOWN.includes(s.genre)));
  assert.notDeepEqual(today.map((s) => s.genre), tomorrow.map((s) => s.genre));
});
