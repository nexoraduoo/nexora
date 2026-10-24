// "Made for you": daily mixes built from your listening. Loading from the catalogue; planning lives in mixplan.js.
import { get } from './api.js';
import * as cat from './catalog.js';
import { daySeed, planMixes, rng, seededShuffle } from './mixplan.js';

export { daySeed, planMixes, rng, seededShuffle };

/** Load each mix: half best-loved, half newest from the same pool, shuffled for the day. */
export async function buildMixes() {
  const taste = await get('/api/taste').catch(() => ({ genres: [], langs: [], artists: [] }));
  const seed = daySeed();
  const specs = planMixes(taste, seed, cat.GENRES.map((g) => g.cg));
  const mixes = await Promise.all(specs.map(async (s, idx) => {
    const off = Math.floor(rng(seed + idx)() * 30);
    const [best, fresh] = s.q.sort
      ? [await cat.browse({ ...s.q, limit: 30 }).catch(() => []), []]
      : await Promise.all([cat.browse({ ...s.q, sort: 'best', limit: 24, offset: off }).catch(() => []), cat.browse({ ...s.q, sort: 'new', limit: 8 }).catch(() => [])]);
    const seen = new Set();
    const tracks = seededShuffle([...best, ...fresh], seed + idx).filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true))).slice(0, 30);
    const artists = [...new Set(tracks.map((t) => t.artist))].slice(0, 3);
    return { ...s, tracks, artwork: tracks.find((t) => t.artwork)?.artwork || null, sub: s.subtitle || `${artists.join(', ')}${artists.length ? ' and more' : ''}` };
  }));
  return mixes.filter((m) => m.tracks.length >= 6);
}
