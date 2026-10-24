// Nexora voice assistant: browser speech recognition -> nlu.parse -> actions -> spoken reply.
// Audio is handled by the browser's own speech service; Nexora only ever receives the text.
import { app, conn, lib, nav, player, clock, ui, toast, region } from './state.js';
import { createStore } from './lib.js';
import { parse } from './nlu.js';
import { ctl } from './ctl.js';
import { engine } from './player.js';
import { bringHere, transferTo } from './connect.js';
import * as offline from './offline.js';
import * as cat from './catalog.js';
import { addToPlaylist, createPlaylist, isLiked, toggleLike } from './library.js';
import { get } from './api.js';
import * as S from './shared/sources.js';
import { langName, norm, bestMatch } from './shared/sources.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = !!SR;

export const voice = createStore({ listening: false, wake: false, interim: '', heard: '', busy: false, result: null, error: null, history: [] });

let rec = null;
let wakeRec = null;
let wakeWanted = false;

const voiceLang = () => app.get().prefs.voiceLang || navigator.language || 'en-US';

// ------------------------------------------------------------------ speaking
export function speak(text) {
  if (!app.get().prefs.voiceReplies || !('speechSynthesis' in window) || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voiceLang();
    u.rate = 1.03;
    const v = speechSynthesis.getVoices().find((x) => x.lang === u.lang) || speechSynthesis.getVoices().find((x) => x.lang.startsWith(u.lang.slice(0, 2)));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch { /* speech output is optional */ }
}

// ------------------------------------------------------------------ listening
function pickAlternative(result, ctx) {
  // among the recogniser's alternatives, prefer one that parses as a real command
  const alts = [...result].map((a) => a.transcript);
  for (const a of alts) {
    const it = parse(a, ctx);
    if (it.type !== 'play' || !it.guess) return a;
  }
  return alts[0];
}

export function parseContext() {
  const { playlists } = lib.get();
  const { devices, meId } = conn.get();
  return { playlists, devices: devices.map((d) => ({ ...d, current: d.id === meId })), hasTrack: !!player.get().track };
}

export function startListening() {
  if (!SR) { ui.set({ voice: true }); return; }
  stopWake(true);
  try { speechSynthesis.cancel(); } catch { /* ignore */ }
  if (rec) { try { rec.abort(); } catch { /* ignore */ } }
  rec = new SR();
  rec.lang = voiceLang();
  rec.interimResults = true;
  rec.maxAlternatives = 4;
  rec.continuous = false;
  let finalText = '';
  rec.onstart = () => voice.set({ listening: true, interim: '', heard: '', error: null, result: null });
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText = pickAlternative(r, parseContext());
      else interim += r[0].transcript;
    }
    voice.set({ interim: finalText || interim });
  };
  rec.onerror = (e) => {
    const msg = {
      'not-allowed': 'Microphone access is blocked. Allow it in your browser\'s address bar and try again.',
      'service-not-allowed': 'Speech recognition is not allowed in this browser.',
      'no-speech': "I didn't hear anything. Tap the mic and try again.",
      'audio-capture': 'No microphone was found.',
      network: 'Speech recognition needs an internet connection.',
      'language-not-supported': 'This language is not supported for voice. Change it in Settings → Voice.',
    }[e.error];
    if (e.error !== 'aborted') voice.set({ error: msg || `Voice error: ${e.error}` });
  };
  rec.onend = async () => {
    voice.set({ listening: false });
    rec = null;
    if (finalText) { voice.set({ heard: finalText, interim: '' }); await runText(finalText); }
    if (wakeWanted) startWake();
  };
  try { rec.start(); } catch { voice.set({ error: 'Could not start the microphone.' }); }
}

export function stopListening() {
  if (rec) { try { rec.stop(); } catch { /* ignore */ } }
}

// "Hey Nexora": hands-free, only while the app is open
const WAKE_RE = /(?:^|\s)(?:hey |ok |okay |hi )?(?:nexora|next ora|nex ora|nexera|nexura|nexxora|next sora|next aura)\b[ ,]*(.*)$/i;

export function startWake() {
  wakeWanted = true;
  if (!SR || wakeRec || voice.get().listening) return;
  wakeRec = new SR();
  wakeRec.lang = voiceLang();
  wakeRec.continuous = true;
  wakeRec.interimResults = false;
  wakeRec.onstart = () => voice.set({ wake: true });
  wakeRec.onresult = async (e) => {
    const t = e.results[e.results.length - 1][0].transcript.trim();
    const m = t.match(WAKE_RE);
    if (!m) return;
    wakeRec.onend = null;
    try { wakeRec.stop(); } catch { /* ignore */ }
    wakeRec = null;
    voice.set({ wake: false });
    if (m[1] && m[1].length > 1) { voice.set({ heard: m[1] }); ui.set({ voice: true }); await runText(m[1]); if (wakeWanted) setTimeout(startWake, 800); }
    else { ui.set({ voice: true }); startListening(); }
  };
  wakeRec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wakeWanted = false; voice.set({ wake: false, error: 'Microphone blocked, so "Hey Nexora" is off.' }); } };
  wakeRec.onend = () => { wakeRec = null; voice.set({ wake: false }); if (wakeWanted && !document.hidden) setTimeout(startWake, 600); };
  try { wakeRec.start(); } catch { wakeRec = null; }
}

export function stopWake(keepWanted = false) {
  if (!keepWanted) wakeWanted = false;
  if (wakeRec) { wakeRec.onend = null; try { wakeRec.abort(); } catch { /* ignore */ } wakeRec = null; }
  voice.set({ wake: false });
}

document.addEventListener('visibilitychange', () => { if (document.hidden) { if (wakeRec) stopWake(true); } else if (wakeWanted) startWake(); });

// ------------------------------------------------------------------ doing things
const said = (ok, say, extra = {}) => ({ ok, say, ...extra });
const nowTrack = () => player.get().track;

function fuzzyPlaylist(name) {
  const n = norm(name);
  let best = null;
  for (const p of lib.get().playlists) {
    const pn = norm(p.name);
    const sc = pn === n ? 3 : pn.includes(n) || n.includes(pn) ? 2 : n.split(' ').filter((w) => w && pn.includes(w)).length / Math.max(1, n.split(' ').length);
    if (sc > (best?.sc ?? 0.5)) best = { p, sc };
  }
  return best?.p || null;
}

async function playList(tracks, label, { shuffle } = {}) {
  const playable = cat.hideExplicit(tracks.filter((t) => t && (t.url || offline.isSaved(t.id))));
  if (!playable.length) return said(false, `I couldn't find anything to play for ${label}.`);
  await ctl.playTracks(playable, 0, { context: label, shuffle: shuffle ? true : undefined });
  return said(true, `Playing ${label}`, { track: playable[0] });
}

async function findSong(query) {
  // Nexora's own catalogue first, then live sources; previews only if they are allowed / playable via YouTube
  const [mine, r] = await Promise.all([cat.browse({ q: query, limit: 12 }).catch(() => []), cat.search(query)]);
  const seen = new Set();
  const songs = cat.fullOnly([...mine, ...r.songs]).filter((t) => t.url && !seen.has(t.id) && seen.add(t.id));
  return { songs, best: bestMatch(query, songs) };
}

export async function execute(it) {
  const p = player.get();
  switch (it.type) {
    case 'empty': return said(false, "I didn't catch that.");
    case 'help': return said(true, 'Try: play Blinding Lights, play some Telugu songs, next song, volume up, or add this to my gym playlist.');
    case 'pause': ctl.pause(); return said(true, 'Paused');
    case 'resume': ctl.play(); return said(true, 'Playing');
    case 'next': ctl.next(); return said(true, 'Next');
    case 'prev': ctl.prev(); return said(true, 'Previous');
    case 'mute': if (!p.muted) ctl.mute(); return said(true, 'Muted');
    case 'unmute': if (p.muted) ctl.mute(); return said(true, 'Sound on');
    case 'volume': {
      const cur = p.vol * 100;
      const v = it.set != null ? it.set : Math.min(100, Math.max(0, cur + it.delta));
      ctl.volume(v / 100);
      return said(true, `Volume ${Math.round(v)} percent`);
    }
    case 'seek': {
      const pos = clock.get().pos;
      ctl.seek(it.to != null ? it.to : Math.max(0, pos + it.by));
      return said(true, it.to === 0 ? 'Starting over' : it.by > 0 ? `Forward ${Math.abs(it.by)} seconds` : `Back ${Math.abs(it.by)} seconds`);
    }
    case 'speed': {
      const r = it.rate ?? Math.min(2, Math.max(0.5, p.speed + it.delta));
      engine.setSpeed(r);
      return said(true, `Speed ${r}x`);
    }
    case 'shuffle': engine.toggleShuffle(it.on); return said(true, it.on ? 'Shuffle on' : 'Shuffle off');
    case 'repeat': engine.cycleRepeat(it.mode); return said(true, it.mode === 'one' ? 'Repeating this song' : it.mode === 'all' ? 'Repeating all' : 'Repeat off');
    case 'like': {
      const t = nowTrack();
      if (!t) return said(false, 'Nothing is playing yet.');
      if (!isLiked(t.id)) await toggleLike(t);
      return said(true, `Liked ${t.title}`);
    }
    case 'unlike': {
      const t = nowTrack();
      if (t && isLiked(t.id)) await toggleLike(t);
      return said(!!t, t ? `Removed ${t.title} from your liked songs` : 'Nothing is playing yet.');
    }
    case 'download': {
      const t = nowTrack();
      if (!t) return said(false, 'Nothing is playing yet.');
      if (!offline.canDownload(t)) return said(false, `${t.title} can only be streamed, not downloaded.`);
      offline.save(t);
      return said(true, `Downloading ${t.title}`);
    }
    case 'save_playlist': {
      const t = nowTrack();
      if (!t) return said(false, 'Nothing is playing yet.');
      let pl = fuzzyPlaylist(it.name);
      if (!pl) {
        const name = it.name.replace(/\b\w/g, (c) => c.toUpperCase());
        await createPlaylist(name, [t]);
        return said(true, `Created ${name} and added ${t.title}`);
      }
      await addToPlaylist(pl.id, t);
      return said(true, `Added ${t.title} to ${pl.name}`);
    }
    case 'full_song': {
      const t = nowTrack();
      if (!t) return said(false, 'Nothing is playing yet.');
      if (!t.preview) return said(true, 'This is already the full song.');
      const ok = await engine.playFullOnYouTube(t);
      return said(ok, ok ? `Playing the full version of ${t.title}` : "I couldn't find the full song on YouTube.");
    }
    case 'whats_playing': {
      const t = nowTrack();
      return t ? said(true, `This is ${t.title}${t.artist ? ` by ${t.artist}` : ''}`) : said(false, 'Nothing is playing right now.');
    }
    case 'sleep':
      if (it.cancel) { engine.setSleep(0); return said(true, 'Sleep timer cancelled'); }
      engine.setSleep(it.end ? 'end' : it.minutes);
      return said(true, it.end ? 'I will stop after this song' : `Sleep timer set for ${it.minutes} minutes`);
    case 'open': {
      const v = it.view;
      if (v === 'queue') ui.set({ panel: 'queue' });
      else if (v === 'devices') ui.set({ panel: 'devices' });
      else if (v === 'lyrics') ui.set({ nowPlaying: true, nowTab: 'lyrics' });
      else if (v === 'nowplaying') ui.set({ nowPlaying: true, nowTab: 'art' });
      else if (v === 'equalizer') nav('/settings/sound');
      else if (v === 'liked') nav('/library/liked');
      else if (v === 'downloads') nav('/library/downloads');
      else if (v === 'charts') nav('/browse');
      else nav(`/${v}`);
      return said(true, `Opening ${v}`);
    }
    case 'search': nav(`/search/${encodeURIComponent(it.query)}`); return said(true, `Searching for ${it.query}`);
    case 'device': {
      if (it.here) { bringHere(); return said(true, 'Playing here'); }
      if (it.missing) return said(false, `I couldn't find a ${it.missing} signed in to your account.`);
      transferTo(it.id); return said(true, `Playing on ${it.name}`);
    }
    case 'queue': {
      const { best } = await findSong(it.query);
      if (!best) return said(false, `I couldn't find ${it.query}.`);
      if (it.next) ctl.queueNext(best); else ctl.queueAdd(best);
      return said(true, `${it.next ? 'Playing next' : 'Added to queue'}: ${best.title}`);
    }
    case 'play': return doPlay(it);
    default: return said(false, "Sorry, I can't do that yet.");
  }
}

async function doPlay(it) {
  const shuffle = !!it.shuffle;
  switch (it.what) {
    case 'song': {
      const { songs, best } = await findSong(it.query);
      if (!best) {
        return said(false, `I couldn't find ${it.title || it.query}.`, { notFound: it.query });
      }
      const same = songs.filter((t) => t.id !== best.id && t.artist === best.artist && t.preview === best.preview).slice(0, 12);
      await ctl.playTracks([best, ...same], 0, { context: `Search: ${it.query}` });
      return said(true, `Playing ${best.preview ? 'a 30-second preview of ' : ''}${best.title}${best.artist ? ` by ${best.artist}` : ''}`, { track: best });
    }
    case 'artist': {
      const [mine, r] = await Promise.all([cat.browse({ q: it.query, limit: 30 }).catch(() => []), cat.search(it.query)]);
      const full = cat.fullOnly(r.songs);
      const top = full.find((x) => norm(x.artist).includes(norm(it.query))) || full[0];
      let tracks = [...mine];
      if (top?.meta?.artistId?.startsWith('audius:')) {
        try { tracks.push(...(await cat.loadArtist('audius', top.meta.artistId.slice(7))).tracks); } catch { /* fall back */ }
      } else if (top?.meta?.artistId?.startsWith('itunes:') && cat.previewsAllowed()) {
        try { tracks.push(...(await cat.loadArtist('itunes', top.meta.artistId.slice(7))).tracks); } catch { /* fall back */ }
      }
      if (!tracks.length) tracks = full.slice(0, 25);
      const seen = new Set();
      tracks = cat.fullOnly(tracks).filter((x) => !seen.has(x.id) && seen.add(x.id));
      return playList(tracks, top?.artist || it.query, { shuffle });
    }
    case 'album': {
      const r = await cat.search(it.query, { sources: new Set(['itunes']) });
      const al = r.albums[0];
      if (!al) return said(false, `I couldn't find the album ${it.query}.`);
      const full = await cat.loadAlbum(al.source, al.id.split(':')[1]);
      return playList(full?.tracks || [], `${al.title} by ${al.artist}`, { shuffle });
    }
    case 'playlist': {
      const pl = fuzzyPlaylist(it.name);
      if (!pl) return said(false, `I couldn't find a playlist called ${it.name}.`);
      const d = await get(`/api/playlists/${pl.id}`);
      return playList(d.tracks, `your ${pl.name} playlist`, { shuffle });
    }
    case 'podcast': {
      if (!it.query) { nav('/podcasts'); return said(true, 'Opening podcasts'); }
      const shows = await S.podcastSearch(it.query, { country: region(), limit: 5 });
      const show = shows[0];
      if (!show) return said(false, `I couldn't find a podcast called ${it.query}.`);
      const d = await S.podcastEpisodes(show.feedUrl);
      return playList(d.episodes.slice(0, 30), `the podcast ${show.title}`);
    }
    case 'liked': return playList(lib.get().liked, 'your liked songs', { shuffle });
    case 'downloads': return playList([...lib.get().downloads.values()].map((d) => d.track), 'your downloads', { shuffle });
    case 'recent': return playList(lib.get().history, 'your recently played', { shuffle });
    case 'language': {
      if (it.query || it.mood) {
        const r = await cat.search(`${langName(it.lang)} ${it.query || ''} ${it.mood || ''}`.trim());
        const songs = cat.fullOnly(r.songs);
        if (songs.length) return playList(songs.slice(0, 25), `${langName(it.lang)} ${it.query || it.mood}`, { shuffle });
      }
      const d = await cat.languageSongs(it.lang, 25);
      return playList([...d.free, ...d.songs], `${langName(it.lang)} songs`, { shuffle });
    }
    case 'mood': {
      const mood = cat.MOODS.find((m) => m.id === it.mood);
      let tracks = await cat.browse({ mood: mood.cm, limit: 40 }).catch(() => []);
      if (tracks.length < 10) tracks = [...tracks, ...cat.fullOnly((await cat.search(mood.q)).songs).slice(0, 30)];
      return playList(tracks, `${mood.title} mix`, { shuffle: true });
    }
    case 'radio': {
      const stations = await cat.radioFor({ q: it.query || undefined, language: it.lang ? langName(it.lang).toLowerCase() : undefined, limit: 20 });
      return playList(stations, it.query ? `${it.query} radio` : it.lang ? `${langName(it.lang)} radio` : 'live radio');
    }
    case 'old': return playList(await cat.browse({ sort: 'old', limit: 40 }), 'classics and old recordings', { shuffle });
    case 'best': return playList(await cat.browse({ sort: 'best', limit: 40 }), 'the best songs on Nexora', { shuffle });
    case 'charts': {
      if (!cat.previewsAllowed()) return playList(await cat.browse({ sort: 'best', limit: 40 }), 'the best songs on Nexora', { shuffle });
      const tracks = await cat.charts(it.lang ? ({ hi: 'IN', te: 'IN', ta: 'IN', ko: 'KR', ja: 'JP', es: 'MX', pt: 'BR', fr: 'FR', de: 'DE', ar: 'SA', tr: 'TR', ru: 'RU' }[it.lang] || region()) : region(), 30);
      return playList(tracks, 'the top charts', { shuffle });
    }
    case 'new': {
      return playList(await cat.browse({ sort: 'new', limit: 40 }), 'the newest songs on Nexora', { shuffle });
    }
    case 'similar': {
      const t = nowTrack();
      if (!t) return said(false, 'Play something first and I will find more like it.');
      const more = await cat.similarTo(t, player.get().queue);
      if (!more.length) return said(false, "I couldn't find anything similar.");
      more.slice().reverse().forEach((x) => engine.playNext(x));
      return said(true, 'Added similar songs to your queue');
    }
    default: return said(false, "I'm not sure what to play.");
  }
}

/** Parse + execute + report. Used by the mic, the typed command box and the wake word. */
export async function runText(text) {
  voice.set({ busy: true, heard: text, result: null });
  let result;
  try {
    const it = parse(text, parseContext());
    result = { ...(await execute(it)), intent: it, text };
  } catch (e) {
    result = { ok: false, say: e?.message || 'Something went wrong.', text };
  }
  voice.set((s) => ({ busy: false, result, history: [result, ...s.history].slice(0, 8) }));
  speak(result.say);
  if (!result.ok && !ui.get().voice) toast(result.say, { kind: 'warn' });
  return result;
}
