// Podcast feeds. Shows publish an RSS feed so any app can stream their episodes for free; this reads one
// (browsers cannot, feeds send no CORS headers) and turns the newest episodes into Nexora tracks.
// Written for the free plan's 10 ms CPU limit: only the first ~450 KB of a feed is read and parsed.

import { sha256Hex } from './util.js';

const MAX_BYTES = 450 * 1024;
const MAX_EPISODES = 60;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decode = (s = '') => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
    return ENTITIES[e.toLowerCase()] ?? m;
  })
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const tag = (xml, name) => { const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml); return m ? decode(m[1]) : ''; };
const attr = (xml, name, a) => { const m = new RegExp(`<${name}\\b[^>]*\\b${a}="([^"]+)"`, 'i').exec(xml); return m ? decode(m[1]) : ''; };
const https = (u) => (u ? u.replace(/^http:\/\//i, 'https://') : '');

export function parseDuration(s = '') {
  const t = String(s).trim();
  if (!t) return 0;
  if (/^\d+$/.test(t)) return +t;
  const p = t.split(':').map(Number);
  if (p.some(Number.isNaN)) return 0;
  return p.reduce((a, v) => a * 60 + v, 0);
}

/** Block anything that is not a plain public https feed URL. */
export function safeFeedUrl(u) {
  let url;
  try { url = new URL(String(u).replace(/^http:\/\//i, 'https://')); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const h = url.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || !h.includes('.')) return null;
  return url.href;
}

export async function parseFeed(xml, feedUrl) {
  const head = xml.split(/<item[\s>]/i)[0];
  const show = {
    title: tag(head, 'title'),
    author: tag(head, 'itunes:author') || tag(head, 'managingEditor'),
    image: https(attr(head, 'itunes:image', 'href') || tag(head.replace(/<item[\s\S]*/i, ''), 'url')),
    language: (tag(head, 'language') || '').slice(0, 2).toLowerCase(),
    description: tag(head, 'description').slice(0, 400),
    link: https(tag(head, 'link')),
  };
  const items = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].slice(0, MAX_EPISODES);
  const episodes = [];
  for (const it of items) {
    const url = https(attr(it, 'enclosure', 'url'));
    const type = attr(it, 'enclosure', 'type');
    if (!url || (type && !/audio|video|octet/i.test(type)) || url.length > 1900) continue;
    const guid = tag(it, 'guid') || url;
    episodes.push({
      id: `pod:${(await sha256Hex(url)).slice(0, 20)}`,
      source: 'pod', kind: 'track',
      title: tag(it, 'title').slice(0, 250) || 'Episode',
      artist: show.title.slice(0, 200), album: show.title.slice(0, 200),
      duration: parseDuration(tag(it, 'itunes:duration')),
      artwork: https(attr(it, 'itunes:image', 'href')) || show.image || null,
      url, preview: false, license: 'Podcast feed (free to stream)', downloadable: true,
      genre: 'Podcast', lang: show.language || null,
      releasedAt: Date.parse(tag(it, 'pubDate')) || null,
      ext: https(tag(it, 'link')) || show.link || null,
      pop: 0, meta: { podcast: true },
      _guid: guid,
    });
  }
  episodes.forEach((e) => delete e._guid);
  return { show: { ...show, feedUrl }, episodes };
}

export async function fetchFeed(url, fetchFn = fetch) {
  const safe = safeFeedUrl(url);
  if (!safe) throw Object.assign(new Error('That is not a valid podcast feed address.'), { status: 400, code: 'bad_feed' });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetchFn(safe, { signal: ctl.signal, headers: { accept: 'application/rss+xml, application/xml, text/xml, */*', 'user-agent': 'Nexora/1.0 (podcast reader)' }, redirect: 'follow' });
    if (!res.ok) throw Object.assign(new Error(`The podcast server answered ${res.status}.`), { status: 502, code: 'feed_failed' });
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    while (got < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
    }
    try { await reader.cancel(); } catch { /* done reading */ }
    const buf = new Uint8Array(got);
    let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
    return await parseFeed(new TextDecoder().decode(buf), safe);
  } catch (e) {
    if (e.status) throw e;
    throw Object.assign(new Error(e.name === 'AbortError' ? 'The podcast server took too long.' : 'Could not read that podcast feed.'), { status: 502, code: 'feed_failed' });
  } finally {
    clearTimeout(timer);
  }
}
