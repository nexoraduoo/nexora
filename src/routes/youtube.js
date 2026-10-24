// Optional "play the full song on YouTube" lookup (needs a free YouTube Data API key in the Owner console).

import { getSetting, rateLimit, requireAuth } from '../auth.js';
import { YtError, findVideo } from '../yt.js';
import { HttpError, badRequest, int, now, str } from '../util.js';

const MISS_TTL = 3 * 86400000;

/** "Title - Artist" for a playlist entry. YouTube Music channels are called "Artist - Topic". */
export function lineFor(item) {
  const sn = item.snippet || {};
  const title = String(sn.title || '').replace(/\s*[([](official|lyrics?|audio|video|music video|hd|4k)[^)\]]*[)\]]/gi, '').trim();
  const artist = String(sn.videoOwnerChannelTitle || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
  if (!title || /^(deleted|private) video$/i.test(title)) return null;
  return artist && !title.toLowerCase().includes(artist.toLowerCase()) ? `${title} - ${artist}` : title;
}

export const routes = [
  // a public YouTube / YouTube Music playlist -> a list of "Title - Artist" lines for the importer
  ['GET', '/api/yt/playlist', async (c) => {
    const a = requireAuth(c);
    const key = await getSetting(c.env, 'youtube_key');
    if (!key) throw new HttpError(501, 'yt_disabled', 'The owner has not switched on the YouTube option yet (Owner console → YouTube API key).');
    const raw = str(c.url.searchParams.get('url') || '', 300);
    const list = (raw.match(/[?&]list=([\w-]{10,60})/) || raw.match(/^([\w-]{16,60})$/) || [])[1];
    if (!list) throw badRequest('Paste the playlist link (it contains "list=...").');
    if (!(await rateLimit(c.env, `ytpl:${a.user.id}`, 10, 3600))) throw new HttpError(429, 'rate_limited', 'Too many playlist imports this hour.');
    const lines = [];
    let page = '', playlistTitle = '';
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${list}${page ? `&pageToken=${page}` : ''}&key=${encodeURIComponent(key)}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, 'yt_playlist', res.status === 404 ? 'That playlist is private or does not exist. Make it public (or unlisted) and try again.' : (j.error?.message || 'YouTube could not read that playlist.'));
      for (const it of j.items || []) { const l = lineFor(it); if (l) lines.push(l); }
      page = j.nextPageToken || '';
      if (!page) break;
    }
    const meta = await fetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${list}&key=${encodeURIComponent(key)}`).then((r) => r.json()).catch(() => ({}));
    playlistTitle = meta.items?.[0]?.snippet?.title || '';
    return { title: playlistTitle, lines: lines.slice(0, 300) };
  }],

  ['GET', '/api/yt/find', async (c) => {
    const a = requireAuth(c);
    const key = await getSetting(c.env, 'youtube_key');
    if (!key) throw new HttpError(501, 'yt_disabled', 'The owner has not switched on the YouTube option yet.');
    const p = c.url.searchParams;
    const id = str(p.get('id') || '', 300);
    const title = str(p.get('title') || '', 200);
    if (!id || !title) throw badRequest('Missing song.');

    const hit = await c.env.DB.prepare('SELECT video_id,title,channel,at FROM yt_map WHERE track_id=?1').bind(id).first();
    if (hit && (hit.video_id || now() - hit.at < MISS_TTL)) {
      return hit.video_id ? { videoId: hit.video_id, title: hit.title, channel: hit.channel, cached: true } : { videoId: null };
    }
    if (!(await rateLimit(c.env, `yt:${a.user.id}`, 40, 3600))) throw new HttpError(429, 'rate_limited', 'Easy there: too many YouTube lookups this hour.');

    let found;
    try {
      found = await findVideo({ title, artist: str(p.get('artist') || '', 200), duration: int(p.get('duration'), 0, 7200, 0) }, key);
    } catch (e) {
      if (e instanceof YtError) throw new HttpError(e.status, e.code, e.message);
      throw e;
    }
    await c.env.DB.prepare('INSERT INTO yt_map (track_id,video_id,title,channel,at) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(track_id) DO UPDATE SET video_id=excluded.video_id,title=excluded.title,channel=excluded.channel,at=excluded.at')
      .bind(id, found?.videoId || '', found?.title || null, found?.channel || null, now()).run();
    return found ? { videoId: found.videoId, title: found.title, channel: found.channel } : { videoId: null };
  }],
];
