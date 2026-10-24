// Optional full-song playback through YouTube's OFFICIAL embedded player (IFrame API).
// Nothing is downloaded or extracted. YouTube's rules apply: the player must stay visible, YouTube may show
// its own ads, and phones may pause it in the background. Nexora only uses this when you ask for it.
import { get } from './api.js';

let apiReady = null;
function loadApi() {
  apiReady = apiReady || new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { apiReady = null; reject(new Error('Could not reach YouTube.')); };
    document.head.appendChild(s);
  });
  return apiReady;
}

function host() {
  let h = document.getElementById('yt-host');
  if (h) return h;
  h = document.createElement('div');
  h.id = 'yt-host';
  h.className = 'yt-host';
  h.hidden = true;
  h.innerHTML = '<div class="yt-bar"><span>YouTube &middot; full song</span><button type="button" aria-label="Close video">&times;</button></div><div class="yt-frame"><div id="yt-player"></div></div>';
  document.body.appendChild(h);
  h.querySelector('button').addEventListener('click', () => { h.hidden = true; el?.pause(); window.dispatchEvent(new Event('nexora:yt-closed')); });
  return h;
}

let el = null;

/** Quacks like an HTMLAudioElement so the playback engine can drive it unchanged. */
export class YTElement extends EventTarget {
  constructor() {
    super();
    el = this;
    this._vid = null; this._p = null; this._ready = null; this._vol = 1; this._rate = 1;
    this._paused = true; this._ended = false; this._start = 0; this._fresh = true; this._timer = null; this._announced = false;
    this.error = null;
    this.buffered = { length: 0, end: () => 0 };
  }

  get paused() { return this._paused; }
  get ended() { return this._ended; }
  get src() { return this._vid || ''; }
  set src(v) { this._vid = v; this._fresh = true; this._ended = false; this._announced = false; this._start = 0; this.error = null; }
  get duration() { try { return this._p?.getDuration?.() || NaN; } catch { return NaN; } }
  get currentTime() { try { return this._p?.getCurrentTime?.() || 0; } catch { return 0; } }
  set currentTime(t) {
    if (this._fresh || !this._p?.seekTo) this._start = t; else { try { this._p.seekTo(t, true); } catch { /* not ready */ } }
  }
  get volume() { return this._vol; }
  set volume(v) { this._vol = v; try { this._p?.setVolume?.(Math.round(v * 100)); } catch { /* not ready */ } }
  get playbackRate() { return this._rate; }
  set playbackRate(r) { this._rate = r; try { this._p?.setPlaybackRate?.(r); } catch { /* unsupported rate */ } }

  setAttribute() {}
  removeAttribute(name) {
    if (name !== 'src') return;
    try { this._p?.stopVideo?.(); } catch { /* ignore */ }
    this._vid = null;
    this._stopTimer();
    host().hidden = true;
  }

  async _player() {
    if (this._ready) return this._ready;
    const h = host();
    h.hidden = false;
    this._ready = loadApi().then((YT) => new Promise((resolve) => {
      const p = new YT.Player('yt-player', {
        width: '100%', height: '100%', host: 'https://www.youtube-nocookie.com',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1, origin: location.origin, enablejsapi: 1 },
        events: {
          onReady: () => { this._p = p; resolve(p); },
          onStateChange: (e) => this._state(e.data),
          onError: (e) => { this.error = { code: e.data }; this.dispatchEvent(new Event('error')); },
        },
      });
    }));
    return this._ready;
  }

  load() {
    // cue without playing (used when the app restores a paused session)
    if (!this._vid) return Promise.resolve(); // nothing to cue: don't even load YouTube's script
    return this._player().then((p) => { host().hidden = false; p.cueVideoById({ videoId: this._vid, startSeconds: this._start }); this._fresh = false; });
  }

  async play() {
    const p = await this._player();
    host().hidden = false;
    this._p = p;
    p.setVolume(Math.round(this._vol * 100));
    if (this._fresh) {
      this._fresh = false;
      p.loadVideoById({ videoId: this._vid, startSeconds: this._start || 0 });
    } else p.playVideo();
  }

  pause() { try { this._p?.pauseVideo?.(); } catch { /* ignore */ } }

  _state(s) {
    // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
    if (s === 1) {
      this._paused = false; this._ended = false;
      if (!this._announced) { this._announced = true; this.dispatchEvent(new Event('loadedmetadata')); this.dispatchEvent(new Event('durationchange')); }
      try { this._p.setPlaybackRate(this._rate); } catch { /* ignore */ }
      this.dispatchEvent(new Event('playing'));
      this._startTimer();
    } else if (s === 2) {
      this._paused = true; this._stopTimer(); this.dispatchEvent(new Event('timeupdate')); this.dispatchEvent(new Event('pause'));
    } else if (s === 3) {
      this.dispatchEvent(new Event('waiting'));
    } else if (s === 0) {
      this._paused = true; this._ended = true; this._stopTimer(); this.dispatchEvent(new Event('ended'));
    } else if (s === 5) {
      this.dispatchEvent(new Event('canplay'));
    }
  }

  _startTimer() { this._stopTimer(); this._timer = setInterval(() => this.dispatchEvent(new Event('timeupdate')), 300); }
  _stopTimer() { clearInterval(this._timer); this._timer = null; }
}

const cache = new Map();
/** Ask the server for the official video matching a song. Throws a friendly Error on failure. */
export async function ytFind(track) {
  if (cache.has(track.id)) return cache.get(track.id);
  const q = new URLSearchParams({ id: track.id, title: track.title, artist: track.artist || '', duration: String(track.meta?.fullDuration || track.duration || 0) });
  const r = await get(`/api/yt/find?${q}`);
  if (r.videoId) cache.set(track.id, r.videoId);
  return r.videoId || null;
}
