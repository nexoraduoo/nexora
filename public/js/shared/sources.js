// Nexora catalogue sources.
//
// Isomorphic (runs in the browser AND in the Worker's background agent). Every source here is
// either free for apps to use or explicitly licensed for streaming:
//   - Audius        artist-uploaded full tracks (free API, artists opt in to streaming)
//   - Jamendo       Creative-Commons full tracks (free API key, optional)
//   - Internet Archive  Creative-Commons / public-domain audio
//   - Apple (iTunes) Search API  30-second previews + metadata + charts (flagged preview-only)
//   - Radio Browser community directory of public live radio streams
//   - LRCLIB        open synced-lyrics database
// Nothing here scrapes or rips content from services that don't allow it.

export const APP_NAME = 'NEXORA';

const cache = new Map();
const TTL = 5 * 60 * 1000;

export async function getJSON(url, { fetch: f = globalThis.fetch, timeout = 9000, ttl = TTL, init } = {}) {
  const hit = cache.get(url);
  if (hit && hit.exp > Date.now()) return hit.val;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await f(url, { ...init, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const val = await res.json();
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    cache.set(url, { val, exp: Date.now() + ttl });
    return val;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- text helpers

export function norm(s = '') {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(feat|ft|featuring|from|remastered|remaster|version|original|motion picture soundtrack)\b.*$/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const tokens = (s) => norm(s).split(' ').filter(Boolean);

const SCRIPTS = [
  [/[ऀ-ॿ]/, 'hi'], [/[ఀ-౿]/, 'te'], [/[஀-௿]/, 'ta'], [/[ಀ-೿]/, 'kn'],
  [/[ഀ-ൿ]/, 'ml'], [/[ঀ-৿]/, 'bn'], [/[਀-੿]/, 'pa'], [/[઀-૿]/, 'gu'],
  [/[؀-ۿ]/, 'ar'], [/[֐-׿]/, 'he'], [/[฀-๿]/, 'th'], [/[가-힯]/, 'ko'],
  [/[぀-ヿ]/, 'ja'], [/[一-鿿]/, 'zh'], [/[Ѐ-ӿ]/, 'ru'], [/[Ͱ-Ͽ]/, 'el'],
];

export function detectLang(text = '') {
  for (const [re, code] of SCRIPTS) if (re.test(text)) return code;
  return null;
}

// Store genre labels that really mean "language/region"
const GENRE_LANG = {
  telugu: 'te', tamil: 'ta', kannada: 'kn', malayalam: 'ml', bengali: 'bn', punjabi: 'pa', marathi: 'mr',
  gujarati: 'gu', bollywood: 'hi', hindi: 'hi', 'k-pop': 'ko', korean: 'ko', 'j-pop': 'ja', japanese: 'ja',
  mandopop: 'zh', cantopop: 'zh', chinese: 'zh', 'latin urban': 'es', latin: 'es', reggaeton: 'es',
  'french pop': 'fr', 'german pop': 'de', schlager: 'de', 'brazilian': 'pt', sertanejo: 'pt', samba: 'pt',
  'north african': 'ar', 'arabic pop': 'ar', 'egyptian pop': 'ar', 'turkish': 'tr', 'russian': 'ru', 'italian': 'it',
  'urdu': 'ur', 'nepali': 'ne', 'thai': 'th', 'vietnamese': 'vi', 'indonesian': 'id', 'persian': 'fa', 'afrobeats': 'en',
};

export function langFromGenre(genre = '') {
  const g = genre.toLowerCase();
  for (const key of Object.keys(GENRE_LANG)) if (g.includes(key)) return GENRE_LANG[key];
  return null;
}

export const LANGUAGES = [
  ['hi', 'Hindi', 'हिन्दी'], ['te', 'Telugu', 'తెలుగు'], ['ta', 'Tamil', 'தமிழ்'], ['kn', 'Kannada', 'ಕನ್ನಡ'],
  ['ml', 'Malayalam', 'മലയാളം'], ['pa', 'Punjabi', 'ਪੰਜਾਬੀ'], ['bn', 'Bengali', 'বাংলা'], ['mr', 'Marathi', 'मराठी'],
  ['gu', 'Gujarati', 'ગુજરાતી'], ['ur', 'Urdu', 'اردو'], ['en', 'English', 'English'], ['es', 'Spanish', 'Español'],
  ['pt', 'Portuguese', 'Português'], ['fr', 'French', 'Français'], ['de', 'German', 'Deutsch'], ['it', 'Italian', 'Italiano'],
  ['ko', 'Korean', '한국어'], ['ja', 'Japanese', '日本語'], ['zh', 'Chinese', '中文'], ['ar', 'Arabic', 'العربية'],
  ['tr', 'Turkish', 'Türkçe'], ['ru', 'Russian', 'Русский'], ['fa', 'Persian', 'فارسی'], ['th', 'Thai', 'ไทย'],
  ['vi', 'Vietnamese', 'Tiếng Việt'], ['id', 'Indonesian', 'Bahasa Indonesia'], ['ne', 'Nepali', 'नेपाली'],
  ['sw', 'Swahili', 'Kiswahili'], ['pl', 'Polish', 'Polski'], ['nl', 'Dutch', 'Nederlands'], ['el', 'Greek', 'Ελληνικά'],
  ['he', 'Hebrew', 'עברית'], ['sv', 'Swedish', 'Svenska'], ['uk', 'Ukrainian', 'Українська'],
];

export const langName = (code) => (LANGUAGES.find((l) => l[0] === code) || [code, code])[1];

// Apple store country per language (for charts + localised search)
export const LANG_COUNTRY = {
  hi: 'IN', te: 'IN', ta: 'IN', kn: 'IN', ml: 'IN', pa: 'IN', bn: 'IN', mr: 'IN', gu: 'IN', ur: 'PK', en: 'US', es: 'MX', pt: 'BR',
  fr: 'FR', de: 'DE', it: 'IT', ko: 'KR', ja: 'JP', zh: 'TW', ar: 'SA', tr: 'TR', ru: 'RU', fa: 'AE', th: 'TH', vi: 'VN',
  id: 'ID', ne: 'NP', sw: 'KE', pl: 'PL', nl: 'NL', el: 'GR', he: 'IL', sv: 'SE', uk: 'UA',
};

const bigArt = (u, size = 600) => (u ? u.replace(/\/\d+x\d+(bb)?\.(jpg|png)$/, `/${size}x${size}bb.$2`) : null);

/** Make a thumbnail URL for artwork from any source (iTunes + Audius sizes are resizable). */
export function artSize(url, size = 300) {
  if (!url) return null;
  if (/mzstatic\.com/.test(url)) return bigArt(url, size);
  const m = url.match(/^(.*\/)(150x150|480x480|1000x1000)\.jpg$/);
  if (m) return m[1] + (size <= 150 ? '150x150' : size <= 480 ? '480x480' : '1000x1000') + '.jpg';
  return url;
}

// ---------------------------------------------------------------- iTunes / Apple

const ITUNES = 'https://itunes.apple.com';

export function fromItunes(r) {
  if (!r.trackId || !r.previewUrl) return null;
  return {
    id: `itunes:${r.trackId}`,
    source: 'itunes',
    kind: 'track',
    title: r.trackName,
    artist: r.artistName,
    album: r.collectionName || '',
    duration: 30,
    artwork: bigArt(r.artworkUrl100),
    url: r.previewUrl,
    preview: true,
    license: 'Apple 30-second preview',
    downloadable: false,
    genre: r.primaryGenreName || null,
    lang: langFromGenre(r.primaryGenreName) || detectLang(`${r.trackName} ${r.artistName}`),
    year: r.releaseDate ? +r.releaseDate.slice(0, 4) : null,
    ext: r.trackViewUrl,
    meta: {
      albumId: r.collectionId ? `itunes:${r.collectionId}` : null,
      artistId: r.artistId ? `itunes:${r.artistId}` : null,
      fullDuration: Math.round((r.trackTimeMillis || 0) / 1000),
      explicit: r.trackExplicitness === 'explicit',
      trackNumber: r.trackNumber || null,
    },
  };
}

const albumFromItunes = (r) => ({
  id: `itunes:${r.collectionId}`,
  source: 'itunes',
  kind: 'album',
  title: r.collectionName,
  artist: r.artistName,
  artwork: bigArt(r.artworkUrl100),
  year: r.releaseDate ? +r.releaseDate.slice(0, 4) : null,
  genre: r.primaryGenreName || null,
  trackCount: r.trackCount || null,
  ext: r.collectionViewUrl,
});

const artistFromItunes = (r) => ({
  id: `itunes:${r.artistId}`,
  source: 'itunes',
  kind: 'artist',
  title: r.artistName,
  genre: r.primaryGenreName || null,
  ext: r.artistLinkUrl,
});

export async function itunesSearch(q, { fetch, country = 'US', limit = 25, entity = 'song' } = {}) {
  const url = `${ITUNES}/search?term=${encodeURIComponent(q)}&media=music&entity=${entity}&limit=${limit}&country=${country}`;
  const d = await getJSON(url, { fetch });
  return d.results || [];
}

export async function itunesLookup(ids, { fetch, country = 'US', entity, limit } = {}) {
  const list = Array.isArray(ids) ? ids.join(',') : ids;
  const url = `${ITUNES}/lookup?id=${list}&country=${country}${entity ? `&entity=${entity}` : ''}${limit ? `&limit=${limit}` : ''}`;
  const d = await getJSON(url, { fetch });
  return d.results || [];
}

export async function itunesAlbum(id, opts = {}) {
  const rows = await itunesLookup(id, { ...opts, entity: 'song', limit: 200 });
  const col = rows.find((r) => r.wrapperType === 'collection');
  const tracks = rows.filter((r) => r.wrapperType === 'track').map(fromItunes).filter(Boolean);
  if (!col) return null;
  return { ...albumFromItunes(col), tracks };
}

export async function itunesArtist(id, opts = {}) {
  const [songs, albums] = await Promise.all([
    itunesLookup(id, { ...opts, entity: 'song', limit: 30 }),
    itunesLookup(id, { ...opts, entity: 'album', limit: 30 }),
  ]);
  const a = songs.find((r) => r.wrapperType === 'artist') || albums.find((r) => r.wrapperType === 'artist');
  return {
    id: `itunes:${id}`,
    source: 'itunes',
    kind: 'artist',
    title: a?.artistName || songs[1]?.artistName || 'Artist',
    genre: a?.primaryGenreName || null,
    artwork: bigArt(songs.find((r) => r.artworkUrl100)?.artworkUrl100),
    tracks: songs.filter((r) => r.wrapperType === 'track').map(fromItunes).filter(Boolean),
    albums: albums.filter((r) => r.wrapperType === 'collection').map(albumFromItunes),
  };
}

/**
 * Apple's top-songs chart for a country, with preview URLs. Works in the browser (the classic iTunes
 * RSS feed allows CORS) and in the Worker (falls back to Apple's newer feed if the first is refused).
 */
export async function fetchChart(country = 'US', limit = 25, { fetch } = {}) {
  const cc = country.toLowerCase();
  const n = Math.min(limit, 50);
  const ttl = 30 * 60 * 1000;
  let ids = [];
  try {
    const feed = await getJSON(`https://itunes.apple.com/${cc}/rss/topsongs/limit=${n}/json`, { fetch, ttl });
    ids = (feed.feed?.entry || []).map((e) => e.id?.attributes?.['im:id']).filter(Boolean);
  } catch { /* try the next feed */ }
  if (!ids.length) {
    const feed = await getJSON(`https://rss.marketingtools.apple.com/api/v2/${cc}/music/most-played/${n}/songs.json`, { fetch, ttl });
    ids = (feed.feed?.results || []).map((r) => r.id);
  }
  if (!ids.length) return [];
  const rows = await itunesLookup(ids, { fetch, country });
  const byId = new Map(rows.filter((r) => r.trackId).map((r) => [String(r.trackId), r]));
  return ids.map((id) => fromItunes(byId.get(String(id)) || {})).filter(Boolean);
}
export const appleChart = fetchChart;

// ---------------------------------------------------------------- Podcasts (iTunes directory; episodes come from each show's own RSS feed)

const podFromItunes = (r) => ({
  id: `itunes:${r.collectionId || r.trackId}`, source: 'itunes', kind: 'podcast', title: r.collectionName || r.trackName, artist: r.artistName,
  artwork: bigArt(r.artworkUrl600 || r.artworkUrl100), feedUrl: r.feedUrl || null, genre: r.primaryGenreName || null, ext: r.collectionViewUrl || null,
  episodes: r.trackCount || null,
});

export async function podcastSearch(q, { fetch, country = 'US', limit = 20 } = {}) {
  const d = await getJSON(`${ITUNES}/search?term=${encodeURIComponent(q)}&media=podcast&entity=podcast&limit=${limit}&country=${country}`, { fetch });
  return (d.results || []).filter((r) => r.feedUrl).map(podFromItunes);
}

export async function podcastLookup(id, { fetch, country = 'US' } = {}) {
  const rows = await itunesLookup(String(id).replace(/^itunes:/, ''), { fetch, country });
  const r = rows.find((x) => x.feedUrl) || rows[0];
  return r ? podFromItunes(r) : null;
}

/** Apple's top podcasts for a country (CORS-friendly classic feed), resolved to feed URLs in one lookup. */
export async function podcastTop(country = 'US', limit = 24, { fetch } = {}) {
  const feed = await getJSON(`${ITUNES.replace('itunes.apple.com', 'itunes.apple.com')}/${country.toLowerCase()}/rss/toppodcasts/limit=${limit}/json`, { fetch, ttl: 30 * 60 * 1000 });
  const ids = (feed.feed?.entry || []).map((e) => e.id?.attributes?.['im:id']).filter(Boolean);
  if (!ids.length) return [];
  const rows = await itunesLookup(ids, { fetch, country });
  return rows.filter((r) => r.feedUrl).map(podFromItunes);
}

/** Newest episodes of a show, read by the Nexora server (feeds are not readable from a browser). */
export async function podcastEpisodes(feedUrl, { fetch, base = '' } = {}) {
  const res = await (fetch || globalThis.fetch)(`${base}/api/podcast/feed?url=${encodeURIComponent(feedUrl)}`, { credentials: 'same-origin' });
  const d = await res.json();
  if (!res.ok) throw new Error(d.message || 'Could not load that podcast.');
  return d;
}

// ---------------------------------------------------------------- Audius

const AUDIUS = 'https://api.audius.co/v1';

export function fromAudius(t) {
  if (!t || !t.id || t.is_delete || t.is_unlisted) return null;
  if (t.access && t.access.stream === false) return null;
  const art = t.artwork || {};
  const downloadable = !!(t.is_downloadable && (!t.access || t.access.download !== false));
  return {
    id: `audius:${t.id}`,
    source: 'audius',
    kind: 'track',
    title: t.title,
    artist: t.user?.name || 'Unknown artist',
    album: '',
    duration: t.duration || 0,
    artwork: art['480x480'] || art['1000x1000'] || art['150x150'] || null,
    url: `${AUDIUS}/tracks/${t.id}/stream?app_name=${APP_NAME}`,
    preview: false,
    license: t.license || 'Uploaded by the artist on Audius',
    downloadable,
    genre: t.genre || null,
    mood: t.mood || null,
    isrc: t.isrc || null,
    lang: detectLang(`${t.title} ${t.user?.name || ''}`),
    year: t.release_date ? +String(t.release_date).slice(0, 4) : null,
    ext: t.permalink ? `https://audius.co${t.permalink}` : null,
    pop: t.play_count || 0,
    releasedAt: Date.parse(t.release_date || t.created_at || '') || null,
    meta: { artistId: t.user?.id ? `audius:${t.user.id}` : null, verifiedArtist: !!t.user?.is_verified, plays: t.play_count || 0 },
  };
}

export async function audiusSearch(q, { fetch, limit = 20 } = {}) {
  const d = await getJSON(`${AUDIUS}/tracks/search?query=${encodeURIComponent(q)}&limit=${limit}&app_name=${APP_NAME}`, { fetch });
  return (d.data || []).map(fromAudius).filter(Boolean);
}

/** time: 'week' | 'month' | 'allTime' (best ever). offset pages deeper into the ranking. */
export async function audiusTrending(genre, { fetch, limit = 20, time = 'week', offset = 0 } = {}) {
  const g = genre ? `&genre=${encodeURIComponent(genre)}` : '';
  const d = await getJSON(`${AUDIUS}/tracks/trending?limit=${limit}&offset=${offset}&time=${time}${g}&app_name=${APP_NAME}`, { fetch, ttl: 15 * 60 * 1000 });
  return (d.data || []).map(fromAudius).filter(Boolean);
}

export async function audiusArtist(id, { fetch } = {}) {
  const raw = id.replace(/^audius:/, '');
  const [u, t] = await Promise.all([
    getJSON(`${AUDIUS}/users/${raw}?app_name=${APP_NAME}`, { fetch }),
    getJSON(`${AUDIUS}/users/${raw}/tracks?limit=40&app_name=${APP_NAME}`, { fetch }),
  ]);
  const user = u.data || {};
  return {
    id: `audius:${raw}`,
    source: 'audius',
    kind: 'artist',
    title: user.name || 'Artist',
    verified: !!user.is_verified,
    bio: user.bio || '',
    artwork: user.profile_picture?.['480x480'] || user.profile_picture?.['150x150'] || null,
    followers: user.follower_count || 0,
    ext: user.handle ? `https://audius.co/${user.handle}` : null,
    tracks: (t.data || []).map(fromAudius).filter(Boolean),
    albums: [],
  };
}

export async function audiusUsers(q, { fetch, limit = 6 } = {}) {
  const d = await getJSON(`${AUDIUS}/users/search?query=${encodeURIComponent(q)}&limit=${limit}&app_name=${APP_NAME}`, { fetch });
  return (d.data || []).map((u) => ({
    id: `audius:${u.id}`, source: 'audius', kind: 'artist', title: u.name,
    artwork: u.profile_picture?.['480x480'] || u.profile_picture?.['150x150'] || null, verified: !!u.is_verified,
  }));
}

// ---------------------------------------------------------------- Jamendo (needs a free client id)

const JAMENDO = 'https://api.jamendo.com/v3.0';

export function fromJamendo(t) {
  if (!t || !t.id) return null;
  return {
    id: `jamendo:${t.id}`,
    source: 'jamendo',
    kind: 'track',
    title: t.name,
    artist: t.artist_name,
    album: t.album_name || '',
    duration: +t.duration || 0,
    artwork: t.image || t.album_image || null,
    url: t.audio,
    preview: false,
    license: t.license_ccurl ? `Creative Commons (${t.license_ccurl.replace(/^https?:\/\/creativecommons.org\/licenses\//, '').replace(/\/.*$/, '').toUpperCase()})` : 'Creative Commons',
    downloadable: !!t.audiodownload_allowed,
    dlUrl: t.audiodownload || null,
    genre: t.musicinfo?.tags?.genres?.[0] || null,
    lang: t.musicinfo?.lang || detectLang(`${t.name} ${t.artist_name}`),
    year: t.releasedate ? +String(t.releasedate).slice(0, 4) : null,
    ext: t.shareurl || null,
    releasedAt: Date.parse(t.releasedate || '') || null,
    meta: { artistId: t.artist_id ? `jamendo:${t.artist_id}` : null, albumId: t.album_id ? `jamendo:${t.album_id}` : null },
  };
}

/** order: popularity_total | popularity_month | popularity_week | releasedate_desc ... (Jamendo API names) */
export async function jamendoSearch(q, { fetch, key, limit = 20, tags, order = 'popularity_total', offset = 0 } = {}) {
  if (!key) return [];
  const params = new URLSearchParams({ client_id: key, format: 'json', limit: String(limit), offset: String(offset), include: 'musicinfo', audioformat: 'mp32', order });
  if (q) params.set('search', q);
  if (tags) params.set('tags', tags);
  const d = await getJSON(`${JAMENDO}/tracks/?${params}`, { fetch });
  const ranked = /^(popularity|downloads|listens)/.test(order);
  // Jamendo does not return a play count, so rank position stands in for popularity (higher = better)
  return (d.results || []).map((r, i) => { const t = fromJamendo(r); if (t && ranked) t.pop = Math.max(1, 100000 - offset - i); return t; }).filter(Boolean);
}

// ---------------------------------------------------------------- Internet Archive

const IA = 'https://archive.org';
const IA_GOOD_LICENSE = /creativecommons\.org|publicdomain|public.?domain/i;

export async function iaSearch(q, { fetch, limit = 12, music = true } = {}) {
  const base = 'mediatype:audio AND (licenseurl:*creativecommons* OR licenseurl:*publicdomain*) AND format:"VBR MP3" AND -collection:librivox AND -collection:podcasts';
  const extra = music ? ' AND (collection:netlabels OR collection:opensource_audio OR collection:audio_music OR collection:etree)' : '';
  const query = q ? `(${base}${extra}) AND (title:(${q.replace(/["()]/g, ' ')}) OR creator:(${q.replace(/["()]/g, ' ')}))` : `${base}${extra}`;
  const fl = ['identifier', 'title', 'creator', 'licenseurl', 'language', 'year'].map((f) => `fl[]=${f}`).join('&');
  const url = `${IA}/advancedsearch.php?q=${encodeURIComponent(query)}&${fl}&rows=${limit}&output=json&sort[]=downloads+desc`;
  const d = await getJSON(url, { fetch });
  return (d.response?.docs || [])
    .filter((x) => IA_GOOD_LICENSE.test(x.licenseurl || ''))
    .map((x) => ({
      id: `ia:${x.identifier}`,
      source: 'ia',
      kind: 'album',
      title: Array.isArray(x.title) ? x.title[0] : x.title,
      artist: Array.isArray(x.creator) ? x.creator[0] : x.creator || 'Internet Archive',
      artwork: `${IA}/services/img/${x.identifier}`,
      year: x.year ? +x.year : null,
      lang: iaLang(x.language),
      license: x.licenseurl,
      ext: `${IA}/details/${x.identifier}`,
    }));
}

const IA_LANG = { eng: 'en', hin: 'hi', tel: 'te', tam: 'ta', kan: 'kn', mal: 'ml', ben: 'bn', pan: 'pa', spa: 'es', fra: 'fr', fre: 'fr', deu: 'de', ger: 'de', por: 'pt', ita: 'it', jpn: 'ja', kor: 'ko', zho: 'zh', chi: 'zh', ara: 'ar', rus: 'ru', tur: 'tr' };
const iaLang = (l) => (l ? IA_LANG[String(Array.isArray(l) ? l[0] : l).toLowerCase().slice(0, 3)] || null : null);

/**
 * Browse the Archive's openly licensed music in ranking order.
 * sort: 'downloads desc' (best-loved) | 'publicdate desc' (newest uploads) | 'date asc' (oldest recordings)
 */
export async function iaBrowse({ sort = 'downloads desc', page = 1, rows = 10, before = 0, fetch } = {}) {
  // before: only recordings dated up to that year (also searches the Archive's 78rpm collection)
  const cols = before ? 'netlabels OR audio_music OR opensource_audio OR 78rpm' : 'netlabels OR audio_music OR opensource_audio';
  const when = before ? ` AND date:[1900-01-01 TO ${before}-12-31]` : '';
  const q = `mediatype:audio AND (licenseurl:*creativecommons* OR licenseurl:*publicdomain*) AND format:"VBR MP3" AND collection:(${cols}) AND -collection:(librivox OR podcasts OR etree) AND -subject:(audiobook OR podcast OR "spoken word" OR interview OR lecture)${when}`;
  const fl = ['identifier', 'title', 'creator', 'downloads', 'publicdate', 'date'].map((f) => `fl[]=${f}`).join('&');
  const d = await getJSON(`${IA}/advancedsearch.php?q=${encodeURIComponent(q)}&${fl}&rows=${rows}&page=${page}&output=json&sort[]=${encodeURIComponent(sort)}`, { fetch, ttl: 10 * 60 * 1000 });
  return (d.response?.docs || []).map((x) => ({ id: x.identifier, downloads: +x.downloads || 0, publicdate: x.publicdate, date: x.date }));
}

export async function iaAlbum(identifier, { fetch, pop = 0, releasedAt = null } = {}) {
  const id = identifier.replace(/^ia:/, '');
  const d = await getJSON(`${IA}/metadata/${encodeURIComponent(id)}`, { fetch, timeout: 12000 });
  const md = d.metadata || {};
  const license = md.licenseurl || '';
  if (!IA_GOOD_LICENSE.test(license)) return null;
  const mp3s = (d.files || []).filter((f) => f.format === 'VBR MP3' || (/\.mp3$/i.test(f.name) && f.source === 'original'));
  const seen = new Set();
  const files = mp3s.filter((f) => (seen.has(f.name) ? false : seen.add(f.name))).slice(0, 120);
  const artist = Array.isArray(md.creator) ? md.creator[0] : md.creator || 'Internet Archive';
  const tracks = files.map((f, i) => ({
    id: `ia:${id}/${f.name}`,
    source: 'ia',
    kind: 'track',
    title: f.title || f.name.replace(/\.mp3$/i, '').replace(/[_]+/g, ' '),
    artist: f.artist || f.creator || artist,
    album: Array.isArray(md.title) ? md.title[0] : md.title,
    duration: Math.round(parseFloat(f.length) || 0),
    artwork: `${IA}/services/img/${id}`,
    url: `${IA}/download/${encodeURIComponent(id)}/${f.name.split('/').map(encodeURIComponent).join('/')}`,
    preview: false,
    license: license.replace(/^https?:\/\//, ''),
    downloadable: true,
    genre: f.genre || null,
    lang: iaLang(md.language),
    year: md.year ? +md.year : (md.date ? +String(md.date).slice(0, 4) || null : null),
    ext: `${IA}/details/${id}`,
    pop,
    releasedAt: releasedAt || Date.parse(md.publicdate || md.date || '') || null,
    meta: { albumId: `ia:${id}`, trackNumber: i + 1 },
  }));
  return {
    id: `ia:${id}`, source: 'ia', kind: 'album',
    title: Array.isArray(md.title) ? md.title[0] : md.title, artist,
    artwork: `${IA}/services/img/${id}`, year: md.year ? +md.year : null, license, ext: `${IA}/details/${id}`, tracks,
  };
}

// ---------------------------------------------------------------- ccMixter (Creative-Commons remixes and songs)
// The API sends no CORS headers, so only the server-side agent calls it; playback is a plain <audio> stream.

export function fromCcmixter(u) {
  const f = (u.files || []).find((x) => x.file_format_info?.['default-ext'] === 'mp3' && /^https:/.test(x.download_url || ''));
  if (!f || !u.license_url) return null;
  const [m, s] = (f.file_format_info.ps || '0:0').split(':').map(Number);
  const tags = (u.upload_extra?.usertags || '').split(',').filter(Boolean);
  return {
    id: `ccmixter:${u.upload_id}`,
    source: 'ccmixter',
    kind: 'track',
    title: u.upload_name,
    artist: u.user_name,
    album: '',
    duration: (m || 0) * 60 + (s || 0),
    artwork: /^https:/.test(u.user_avatar_url || '') ? u.user_avatar_url : null,
    url: f.download_url,
    preview: false,
    license: `${u.license_name || 'Creative Commons'} (${String(u.license_url).replace(/^https?:\/\/creativecommons.org\/licenses\//, '').replace(/\/.*$/, '').toUpperCase()})`,
    downloadable: true,
    genre: (tags[0] || '').replace(/_/g, ' ') || null,
    lang: null,
    year: +(String(u.upload_date_format || '').match(/\b(19|20)\d{2}\b/)?.[0]) || null,
    ext: u.file_page_url || null,
    pop: Number(u.qrank) || Number(u.upload_num_scores) || 0,
    releasedAt: Date.parse(String(u.upload_date_format || '').replace('@', '')) || null,
    meta: {},
  };
}

/** sort: 'rank' (best) | 'date' (newest) */
export async function ccmixterBrowse({ sort = 'rank', offset = 0, limit = 20, fetch } = {}) {
  const d = await getJSON(`https://ccmixter.org/api/query?f=json&tags=audio&dataview=default&sort=${sort}&limit=${limit}&offset=${offset}`, { fetch, ttl: 10 * 60 * 1000 });
  return (Array.isArray(d) ? d : []).map(fromCcmixter).filter(Boolean);
}

// ---------------------------------------------------------------- Radio Browser

const RADIO_HOSTS = ['https://de1.api.radio-browser.info', 'https://at1.api.radio-browser.info', 'https://nl1.api.radio-browser.info'];

export function fromStation(s) {
  const url = s.url_resolved || s.url;
  if (!url || !/^https:/i.test(url) || s.hls || s.lastcheckok === 0) return null;
  return {
    id: `radio:${s.stationuuid}`,
    source: 'radio',
    kind: 'radio',
    title: s.name.trim(),
    artist: [s.country, (s.tags || '').split(',').slice(0, 3).join(' · ')].filter(Boolean).join(' — '),
    album: 'Live radio',
    duration: 0,
    artwork: /^https:/.test(s.favicon || '') ? s.favicon : null,
    url,
    preview: false,
    license: 'Public radio stream',
    downloadable: false,
    genre: (s.tags || '').split(',')[0] || null,
    lang: s.languagecodes ? s.languagecodes.split(',')[0].slice(0, 2) : null,
    ext: s.homepage || null,
    meta: { codec: s.codec, bitrate: s.bitrate, country: s.countrycode },
  };
}

async function radioGet(path, { fetch } = {}) {
  let err;
  for (const host of RADIO_HOSTS) {
    try { return await getJSON(`${host}/json/${path}`, { fetch, timeout: 7000 }); } catch (e) { err = e; }
  }
  throw err;
}

export async function radioSearch({ q, language, tag, country, limit = 24 } = {}, { fetch } = {}) {
  const p = new URLSearchParams({ limit: String(limit * 2), hidebroken: 'true', order: 'clickcount', reverse: 'true', is_https: 'true' });
  if (q) p.set('name', q);
  if (language) p.set('language', language);
  if (tag) p.set('tag', tag);
  if (country) p.set('countrycode', country);
  const rows = await radioGet(`stations/search?${p}`, { fetch });
  return rows.map(fromStation).filter(Boolean).slice(0, limit);
}

// ---------------------------------------------------------------- Lyrics (LRCLIB)

export function parseLRC(text = '') {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!m.length) continue;
    const words = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const t of m) out.push({ t: +t[1] * 60 + parseFloat(t[2]), line: words });
  }
  return out.sort((a, b) => a.t - b.t);
}

export async function getLyrics({ title, artist, album, duration }, { fetch } = {}) {
  const p = new URLSearchParams({ track_name: title, artist_name: artist });
  if (album) p.set('album_name', album);
  if (duration) p.set('duration', String(Math.round(duration)));
  let d;
  try {
    d = await getJSON(`https://lrclib.net/api/get?${p}`, { fetch, ttl: 60 * 60 * 1000 });
  } catch {
    try {
      const list = await getJSON(`https://lrclib.net/api/search?q=${encodeURIComponent(`${title} ${artist}`)}`, { fetch, ttl: 60 * 60 * 1000 });
      d = list.find((x) => x.syncedLyrics) || list[0];
    } catch { d = null; }
  }
  if (!d) return null;
  return { synced: d.syncedLyrics ? parseLRC(d.syncedLyrics) : [], plain: d.plainLyrics || '', instrumental: !!d.instrumental };
}

// ---------------------------------------------------------------- ranking + federated search

const VERSION_TAG = /[([\-–]\s*(?:live|remix|acoustic|unplugged|instrumental|cover|sped up|slowed|reverb|demo|radio edit|extended|club mix|lofi|lo-fi|reprise|stripped)\b/i;
const VERSION_TAG_WORD = /\b(?:live|remix|acoustic|unplugged|instrumental|cover|sped up|slowed|reverb|demo|extended|lofi|lo-fi|reprise|stripped)\b/i;
const JUNK = /\b(karaoke|tribute|cover|instrumental|lullaby|8.?bit|made famous|originally performed|piano version|workout|fitness|sleep|ringtone)\b/i;

export function score(query, t) {
  const q = norm(query);
  if (!q) return 0;
  const qt = q.split(' ');
  const title = norm(t.title);
  // bracketed tags such as "(Live)" or "(Remix)" still count when the query mentions them
  const tags = norm(String(t.title).replace(/[()[\]]/g, ' '));
  const hay = `${title} ${tags} ${norm(t.artist)} ${norm(t.album)}`;
  let hits = 0;
  for (const w of qt) if (hay.includes(w)) hits++;
  let s = hits / qt.length;
  if (title === q) s += 1;
  else if (title.startsWith(q)) s += 0.5;
  else if (q.includes(title) && title.length > 2) s += 0.4;
  if (norm(`${t.title} ${t.artist}`) === q || norm(`${t.artist} ${t.title}`) === q) s += 1;
  if (JUNK.test(`${t.title} ${t.album}`) && !JUNK.test(query)) s -= 0.8;
  // alternate versions ("(Live)", "- Remix", "(Sped Up)") lose to the original unless asked for
  if (VERSION_TAG.test(`${t.title}`) && !VERSION_TAG_WORD.test(query)) s -= 0.3;
  if (!t.preview && t.kind === 'track') s += 0.05; // a tie goes to the full-length song
  if (t.meta?.verifiedArtist) s += 0.1;
  return s;
}

/**
 * Federated search. Each source runs in parallel and may fail independently.
 * opts: { fetch, country, jamendoKey, lang, sources: Set }
 */
export async function searchAll(q, opts = {}) {
  const { fetch, country = 'US', jamendoKey, sources } = opts;
  const want = (s) => !sources || sources.has(s);
  const errors = {};
  const run = async (name, fn, fallback) => {
    if (!want(name)) return fallback;
    try { return await fn(); } catch (e) { errors[name] = String(e.message || e); return fallback; }
  };

  // Apple allows ~20 calls/minute per IP, so ONE call feeds songs, albums and artists.
  const itRaw = await run('itunes', () => itunesSearch(q, { fetch, country, limit: 40 }), []);
  const itSongs = itRaw.map(fromItunes).filter(Boolean);
  const seenAlbum = new Set(), seenArtist = new Set();
  const itAlbums = [], itArtists = [];
  for (const r of itRaw) {
    if (r.collectionId && !seenAlbum.has(r.collectionId) && itAlbums.length < 8) { seenAlbum.add(r.collectionId); itAlbums.push(albumFromItunes(r)); }
    if (r.artistId && !seenArtist.has(r.artistId) && itArtists.length < 5) { seenArtist.add(r.artistId); itArtists.push({ ...artistFromItunes(r), artwork: bigArt(r.artworkUrl100) }); }
  }

  const [audius, audiusArtists, jam, ia, radio] = await Promise.all([
    run('audius', () => audiusSearch(q, { fetch, limit: 20 }), []),
    run('audius', () => audiusUsers(q, { fetch, limit: 4 }), []),
    run('jamendo', () => jamendoSearch(q, { fetch, key: jamendoKey, limit: 15 }), []),
    run('ia', () => iaSearch(q, { fetch, limit: 8 }), []),
    run('radio', () => radioSearch({ q, limit: 12 }, { fetch }), []),
  ]);

  const songs = [...itSongs, ...audius, ...jam]
    .map((t) => ({ t, s: score(q, t) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.t);
  // dedupe identical title+artist pairs within the list
  const seen = new Set();
  const uniq = songs.filter((t) => {
    const k = `${norm(t.title)}|${norm(t.artist)}|${t.preview ? 'p' : 'f'}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
  return { songs: uniq, albums: [...itAlbums, ...ia], artists: [...itArtists, ...audiusArtists], radio, errors };
}

/** Pick the single best playable match for a "play X" request. */
export function bestMatch(query, tracks) {
  let best = null;
  for (const t of tracks) {
    const s = score(query, t);
    if (!best || s > best.s) best = { t, s };
  }
  return best && best.s >= 0.5 ? best.t : tracks[0] || null;
}
