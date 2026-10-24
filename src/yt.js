// Finds the official YouTube video for a song, so it can be played in YouTube's own embedded player.
// Uses only the official YouTube Data API (free key, 10,000 units/day; a search costs 100). Nothing is
// downloaded or extracted: playback happens inside YouTube's player, with YouTube's own rules (and ads).

import { norm, tokens } from '../public/js/shared/sources.js';

const BAD = /\b(live|cover|remix|karaoke|reaction|slowed|sped up|8d|nightcore|instrumental|tutorial|lesson|mashup|reverb|piano version|acoustic|parody|trailer|teaser|shorts?)\b/i;

export function parseISODuration(s = '') {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(s);
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

/** Score one candidate video against the song we want. */
export function scoreVideo(v, want) {
  if (!v.embeddable) return -9;
  const wantTitle = tokens(want.title);
  const hay = norm(`${v.title} ${v.channel}`);
  let hits = 0;
  for (const w of wantTitle) if (hay.includes(w)) hits++;
  let s = wantTitle.length ? hits / wantTitle.length : 0;
  const artistTokens = tokens(want.artist).slice(0, 4);
  if (artistTokens.length) s += 0.5 * (artistTokens.filter((w) => hay.includes(w)).length / artistTokens.length);
  if (/ - topic$/i.test(v.channel)) s += 0.6; // auto-generated "official audio" channels
  else if (/\bofficial\b/i.test(v.title) || /vevo$/i.test(v.channel)) s += 0.3;
  if (BAD.test(v.title) && !BAD.test(`${want.title} ${want.artist}`)) s -= 0.8;
  if (want.duration && v.duration) {
    const d = Math.abs(v.duration - want.duration);
    s += d <= 8 ? 0.5 : d <= 20 ? 0.2 : d > 45 ? -0.6 : 0;
  }
  return s;
}

export function pickBest(videos, want) {
  let best = null;
  for (const v of videos) {
    const s = scoreVideo(v, want);
    if (!best || s > best.s) best = { v, s };
  }
  return best && best.s >= 1.0 ? best.v : null;
}

export class YtError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

async function yt(path, params, key, fetchFn) {
  const url = `https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key })}`;
  const res = await fetchFn(url);
  if (res.ok) return res.json();
  let reason = '', message = '';
  try { const j = await res.json(); reason = j.error?.errors?.[0]?.reason || ''; message = j.error?.message || ''; } catch { /* ignore */ }
  if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded') throw new YtError(429, 'yt_quota', "Today's free YouTube lookups are used up. They reset every day; songs already looked up still work.");
  if (reason === 'keyInvalid' || reason === 'API_KEY_INVALID' || /API key not valid/i.test(message)) throw new YtError(400, 'yt_key_invalid', 'The YouTube key in the Owner console is not valid.');
  if (reason === 'accessNotConfigured' || reason === 'forbidden' || res.status === 403) throw new YtError(403, 'yt_not_enabled', 'YouTube Data API v3 is not switched on for this key. Enable it in the Google Cloud console.');
  throw new YtError(502, 'yt_failed', `YouTube lookup failed (${res.status}).`);
}

/** want = { title, artist, duration } -> { videoId, title, channel } | null */
export async function findVideo(want, key, fetchFn = fetch) {
  const cleanTitle = want.title.replace(/\s*[([][^)\]]*[)\]]/g, '').trim() || want.title;
  const q = `${cleanTitle} ${want.artist || ''} official audio`.trim();
  const search = await yt('search', { part: 'snippet', type: 'video', videoCategoryId: '10', videoEmbeddable: 'true', maxResults: '6', q }, key, fetchFn);
  const ids = (search.items || []).map((i) => i.id?.videoId).filter(Boolean);
  if (!ids.length) return null;
  const details = await yt('videos', { part: 'contentDetails,status', id: ids.join(',') }, key, fetchFn);
  const info = new Map((details.items || []).map((d) => [d.id, d]));
  const videos = (search.items || []).map((i) => {
    const d = info.get(i.id?.videoId);
    return {
      id: i.id?.videoId, title: i.snippet?.title || '', channel: i.snippet?.channelTitle || '',
      duration: parseISODuration(d?.contentDetails?.duration), embeddable: d?.status?.embeddable !== false && !!d,
    };
  }).filter((v) => v.id);
  const best = pickBest(videos, { ...want, title: cleanTitle });
  return best ? { videoId: best.id, title: best.title, channel: best.channel } : null;
}
