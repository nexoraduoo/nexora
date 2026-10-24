// Pure planning for the daily mixes (no browser code, so it is unit-tested in Node).
import { langName } from './shared/sources.js';

const DEFAULT_GENRES = ['Electronic', 'Hip-Hop/Rap', 'Pop', 'Rock', 'Jazz', 'Lo-Fi', 'R&B/Soul', 'Folk', 'Ambient', 'Classical'];
const HUES = [265, 190, 330, 28, 150, 45];

/** Small seeded random generator: the same day gives the same mixes, tomorrow gives new ones. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function seededShuffle(list, seed) {
  const r = rng(seed);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const daySeed = (d = new Date()) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

/** taste = { genres:[{name,n}], langs:[{name,n}], artists:[{name,n}] } -> list of mix specs */
export function planMixes(taste = {}, seed = daySeed(), known) {
  const lower = new Map(known.map((g) => [g.toLowerCase(), g]));
  const mine = (taste.genres || []).map((g) => lower.get(String(g.name).toLowerCase())).filter(Boolean);
  const top = [...new Set(mine)];
  // top up with a different set of genres every day so a new listener still gets variety
  const pool = seededShuffle(DEFAULT_GENRES.filter((g) => known.includes(g) && !top.includes(g)), seed);
  const picks = [...top, ...pool].slice(0, 3);
  const specs = picks.map((genre, i) => ({ id: `daily-${i + 1}`, title: `Daily Mix ${i + 1}`, genre, hue: HUES[i], q: { genre } }));
  const lang = taste.langs?.[0]?.name;
  if (lang) specs.splice(2, 1, { id: 'daily-lang', title: `${langName(lang)} Mix`, genre: null, hue: HUES[2], q: { lang } });
  const unseen = seededShuffle(known.filter((g) => !picks.includes(g)), seed + 7)[0];
  if (unseen) specs.push({ id: 'discover', title: 'Discover', subtitle: unseen, genre: unseen, hue: HUES[3], q: { genre: unseen } });
  specs.push({ id: 'time-machine', title: 'Time machine', subtitle: 'Old recordings', genre: null, hue: HUES[4], q: { sort: 'old' } });
  specs.push({ id: 'fresh', title: 'Fresh finds', subtitle: 'Just released', genre: null, hue: HUES[5], q: { sort: 'new' } });
  return specs;
}

