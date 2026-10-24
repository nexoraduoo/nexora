// The playback engine: queue, shuffle/repeat, offline playback, EQ routing, lock-screen controls,
// sleep timer, listening history. One instance (`engine`) per device.
import { player, clock, app, lib, toast, local } from './state.js';
import { fx } from './fx.js';
import * as offline from './offline.js';
import { post, put } from './api.js';
import { shuffled, throttle } from './lib.js';
import { artSize } from './shared/sources.js';
import { YTElement, ytFind } from './youtube.js';
import { isWorld, resolve as worldResolve, withAudio } from './world.js';

// Sources whose servers send CORS headers, so they may be routed through Web Audio (EQ / visualiser)
const CORS_OK = new Set(['itunes', 'audius', 'ia', 'jamendo', 'up', 'local']);
const rid = () => Math.random().toString(36).slice(2, 9);
const withQid = (t) => ({ ...t, qid: t.qid || rid() });

export const slim = (t) => ({
  id: t.id, source: t.source, kind: t.kind, title: t.title, artist: t.artist, album: t.album, duration: t.duration,
  artwork: t.artwork, url: t.url, preview: t.preview, license: t.license, downloadable: t.downloadable, lang: t.lang,
  genre: t.genre, year: t.year, ext: t.ext, meta: t.meta, yt: t.yt, isrc: t.isrc, rev: t.rev,
});

class Engine {
  constructor() {
    this.fxEl = this.make(true);
    this.plainEl = this.make(false);
    this.ytEl = this.wire(new YTElement());
    this.el = this.plainEl;
    this.orig = [];
    this.token = 0;
    this.failStreak = 0;
    this.recorded = false;
    this.sleepTimer = null;
    this.idleTimer = null;
    this.lastNP = 0;
    this.listeners = new Set();
    this.autoplayProvider = null;
    this.noFxFor = new Set();
    this.saveQueue = throttle(() => this.persist(), 4000);
    this.mediaSession();
    player.subscribe(() => this.saveQueue());
    this.unlockOnGesture();
  }

  /** iPhone / iPad only let an audio element play after that very element played during a tap. We have two
   *  (plain and equaliser), so the one not in use is warmed up with a silent clip on the first tap anywhere. */
  unlockOnGesture() {
    const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    const run = () => {
      for (const a of [this.fxEl, this.plainEl]) {
        if (a === this.el || a.getAttribute('src')) continue;
        a.src = SILENT;
        const done = () => { if (a.getAttribute('src') === SILENT) { a.pause(); a.removeAttribute('src'); a.load(); } };
        a.play().then(done, done);
      }
    };
    for (const ev of ['touchend', 'pointerup', 'keydown']) addEventListener(ev, run, { once: true, capture: true, passive: true });
  }

  make(cors) {
    const a = new Audio();
    a.preload = 'auto';
    a.setAttribute('playsinline', '');
    if (cors) a.crossOrigin = 'anonymous';
    return this.wire(a);
  }

  /** Attach the engine's listeners to an audio element (or the YouTube adapter, which behaves like one). */
  wire(a) {
    const mine = () => a === this.el;
    let lastTick = 0;
    a.addEventListener('timeupdate', () => {
      if (!mine()) return;
      const t = performance.now();
      if (t - lastTick < 240) return;
      lastTick = t;
      this.tick();
    });
    a.addEventListener('durationchange', () => mine() && this.tick(true));
    a.addEventListener('progress', () => mine() && this.tick(true));
    a.addEventListener('playing', () => { if (mine()) { player.set({ playing: true, loading: false, error: null }); this.failStreak = 0; this.onPlayState(); } });
    a.addEventListener('waiting', () => mine() && player.set({ loading: true }));
    a.addEventListener('canplay', () => mine() && player.set({ loading: false }));
    a.addEventListener('pause', () => { if (mine() && !a.ended) { player.set({ playing: false }); this.onPlayState(); } });
    a.addEventListener('ended', () => mine() && this.onEnded());
    a.addEventListener('error', () => mine() && this.onError(a));
    return a;
  }

  // ------------------------------------------------------------------ queue
  get state() { return player.get(); }
  get track() { return this.state.track; }

  async setQueue(tracks, start = 0, { context = '', shuffle, autoplay = true } = {}) {
    const list = tracks.filter(Boolean).map(withQid);
    if (!list.length) return;
    const wantShuffle = shuffle ?? this.state.shuffle;
    this.orig = list.slice();
    let queue = list, index = Math.min(Math.max(start, 0), list.length - 1);
    if (wantShuffle) {
      const cur = list[index];
      queue = [cur, ...shuffled(list.filter((_, i) => i !== index))];
      index = 0;
    }
    player.set({ queue, index, context, shuffle: wantShuffle, radio: list[index].kind === 'radio' });
    await this.start(index, { autoplay });
  }

  playNext(track) {
    const { queue, index } = this.state;
    const t = withQid(track);
    if (!queue.length) return this.setQueue([t], 0);
    const q = queue.slice();
    q.splice(index + 1, 0, t);
    this.orig.push(t);
    player.set({ queue: q });
    toast(`Playing next: ${track.title}`, { kind: 'ok' });
  }

  addToQueue(track) {
    const { queue } = this.state;
    const t = withQid(track);
    if (!queue.length) return this.setQueue([t], 0);
    this.orig.push(t);
    player.set({ queue: [...queue, t] });
    toast(`Added to queue: ${track.title}`, { kind: 'ok' });
  }

  removeAt(i) {
    const { queue, index } = this.state;
    if (i === index) return;
    const q = queue.slice();
    const [gone] = q.splice(i, 1);
    this.orig = this.orig.filter((t) => t.qid !== gone.qid);
    player.set({ queue: q, index: i < index ? index - 1 : index });
  }

  move(from, to) {
    const { queue, index } = this.state;
    if (from === to || from < 0 || to < 0 || from >= queue.length || to >= queue.length) return;
    const q = queue.slice();
    const [x] = q.splice(from, 1);
    q.splice(to, 0, x);
    let idx = index;
    if (from === index) idx = to;
    else if (from < index && to >= index) idx = index - 1;
    else if (from > index && to <= index) idx = index + 1;
    player.set({ queue: q, index: idx });
  }

  clearUpcoming() {
    const { queue, index } = this.state;
    player.set({ queue: queue.slice(0, index + 1) });
    this.orig = this.orig.filter((t) => queue.slice(0, index + 1).some((q) => q.qid === t.qid));
  }

  jump(i) { if (i >= 0 && i < this.state.queue.length) return this.start(i); }

  toggleShuffle(force) {
    const on = force ?? !this.state.shuffle;
    const { queue, index } = this.state;
    if (!queue.length) { player.set({ shuffle: on }); return; }
    if (on) {
      const done = queue.slice(0, index + 1);
      player.set({ shuffle: true, queue: [...done, ...shuffled(queue.slice(index + 1))] });
    } else {
      const cur = queue[index];
      const orig = this.orig.length ? this.orig : queue;
      const i = orig.findIndex((t) => t.qid === cur.qid);
      player.set({ shuffle: false, queue: orig.slice(), index: i < 0 ? 0 : i });
    }
  }

  cycleRepeat(force) {
    const order = ['off', 'all', 'one'];
    const next = force || order[(order.indexOf(this.state.repeat) + 1) % 3];
    player.set({ repeat: next });
  }

  // ------------------------------------------------------------------ playback
  async resolveUrl(t) {
    const saved = await offline.urlFor(t.id);
    if (saved) return { url: saved, offline: true };
    if (!t.url) throw new Error('This track has no playable source.');
    return { url: t.url, offline: false };
  }

  /** Is the optional YouTube full-song feature switched on by the owner? */
  ytEnabled() { return !!app.get().config.youtube; }

  /**
   * Swap a 30-second preview for the full song in YouTube's own player. Only runs when asked
   * (menu / button) or when the "full songs from YouTube automatically" setting is on.
   */
  async playFullOnYouTube(track = this.track) {
    if (!track) return false;
    if (!this.ytEnabled()) { toast('The owner has not switched on the YouTube option (Owner console).', { kind: 'warn' }); return false; }
    try {
      toast('Finding the full song on YouTube...', { ms: 1800 });
      const videoId = await ytFind(track);
      if (!videoId) { toast("Couldn't find a good official match on YouTube for this one.", { kind: 'warn' }); return false; }
      const { queue, index } = this.state;
      let i = queue.findIndex((q) => q.qid && q.qid === track.qid);
      if (i < 0) i = queue[index]?.id === track.id ? index : -1;
      const upgraded = { ...track, yt: videoId, preview: false, noYt: false, duration: track.meta?.fullDuration || track.duration };
      if (i < 0) { await this.setQueue([upgraded], 0); return true; }
      const q = queue.slice();
      q[i] = { ...q[i], ...upgraded };
      this.orig = this.orig.map((o) => (o.qid === q[i].qid ? q[i] : o));
      player.set({ queue: q });
      await this.start(i, { autoplay: true });
      return true;
    } catch (e) {
      toast(e.message || "Couldn't reach YouTube.", { kind: 'error' });
      return false;
    }
  }

  async start(index, { autoplay = true, pos: startPos = 0 } = {}) {
    let pos = startPos;
    const { queue } = this.state;
    let t = queue[index];
    if (!t) return;
    // a world-catalogue entry has no audio yet: find some (full song from the open catalogue, else a 30-second preview)
    if (isWorld(t) && !t.url && !t.yt) {
      const mine = ++this.token;
      player.set({ index, track: t, loading: true, error: null, playing: autoplay ? this.state.playing : false });
      this.updateMediaSession(t);
      document.title = `${t.title} · ${t.artist || 'Nexora'}`;
      let found = null;
      try {
        const r = await worldResolve(t);
        if (mine !== this.token) return;
        if (r.kind !== 'none') found = withAudio(t, r);
        else if (this.ytEnabled() && app.get().prefs.ytAuto) { const vid = await ytFind(t).catch(() => null); if (vid) found = { ...t, yt: vid, license: 'Played through YouTube' }; }
      } catch (e) { if (mine !== this.token) return; return this.fail(t, e.message); }
      if (mine !== this.token) return;
      if (!found) return this.fail(t, 'No free audio exists for this one. Open its ⋯ menu to find it on Spotify, Apple Music or YouTube Music.');
      t = found;
      const q = this.state.queue.slice(); q[index] = t; player.set({ queue: q });
    }
    // optional: previews play as full songs from YouTube automatically (owner key + user setting required)
    if (t.preview && !t.yt && !t.noYt && autoplay && this.ytEnabled() && app.get().prefs.ytAuto) {
      try {
        const videoId = await ytFind(t);
        if (videoId) { t = { ...t, yt: videoId, preview: false, duration: t.meta?.fullDuration || t.duration }; const q = queue.slice(); q[index] = t; player.set({ queue: q }); }
        else { t = { ...t, noYt: true }; }
      } catch { t = { ...t, noYt: true }; }
    }
    // podcasts resume where you stopped
    if (t.meta?.podcast && !pos) {
      const saved = Number(local.read(`nx.pod.${t.id}`, '0')) || 0;
      if (saved > 15 && (!t.duration || saved < t.duration - 20)) pos = saved;
    }
    const my = ++this.token;
    this.recorded = false;
    clearTimeout(this.idleTimer);
    player.set({ index, track: t, loading: true, error: null, radio: t.kind === 'radio', playing: autoplay ? this.state.playing : false });
    clock.set({ pos, dur: t.kind === 'radio' ? 0 : t.duration || 0, buffered: 0 });
    this.updateMediaSession(t);
    document.title = `${t.title} · ${t.artist || 'Nexora'}`;
    this.notify();

    if (t.yt) {
      // YouTube's embedded player (adapter behaves like an audio element)
      if (this.ytEl !== this.el) { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); }
      this.el = this.ytEl;
      const y = this.ytEl;
      y.src = t.yt;
      y.volume = this.state.muted ? 0 : this.state.vol;
      y.playbackRate = this.state.speed;
      if (pos > 0) y.currentTime = pos;
      try { if (autoplay) await y.play(); else { await y.load(); player.set({ loading: false }); } } catch (e) { if (my === this.token) this.onError(y); }
      return;
    }

    let src;
    try { src = await this.resolveUrl(t); } catch (e) { return this.fail(t, e.message); }
    if (my !== this.token) return;

    const corsOk = src.offline || CORS_OK.has(t.source) || CORS_OK.has(String(t.meta?.fullId || '').split(':')[0]);
    const useFx = this.state.fxOn && corsOk && !this.noFxFor.has(t.id);
    const next = useFx ? this.fxEl : this.plainEl;
    if (next !== this.el) { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); }
    this.el = next;
    const a = this.el;
    a.src = src.url;
    a.playbackRate = this.state.speed;
    a.volume = this.state.muted ? 0 : this.state.vol;
    if (pos > 0) {
      const seek = () => { try { a.currentTime = pos; } catch { /* not seekable yet */ } };
      a.addEventListener('loadedmetadata', seek, { once: true });
    }
    if (!autoplay) { a.load(); player.set({ loading: false }); return; }
    fx.resume();
    try {
      await a.play();
    } catch (e) {
      if (my !== this.token) return;
      if (e.name === 'NotAllowedError') {
        player.set({ playing: false, loading: false });
        toast('Tap play to start (your browser blocks auto-play).');
      } else if (e.name !== 'AbortError') this.onError(a);
    }
  }

  fail(t, msg) {
    player.set({ loading: false, playing: false, error: msg || 'unplayable' });
    toast(`Couldn't play "${t.title}". ${msg || ''}`.trim(), { kind: 'error' });
    this.failStreak++;
    if (!offline.isSaved(t.id) && t.source !== 'itunes' && t.source !== 'radio') post('/api/catalog/report', { id: t.id }).catch(() => {});
    if (this.failStreak < 3 && this.state.index < this.state.queue.length - 1) setTimeout(() => this.next(), 900);
  }

  onError(a) {
    const t = this.track;
    if (!t) return;
    // a YouTube video that cannot be embedded: go back to the 30-second preview instead of failing
    if (a === this.ytEl) {
      const { queue, index } = this.state;
      const q = queue.slice();
      q[index] = { ...q[index], yt: undefined, noYt: true, preview: true, duration: 30 };
      player.set({ queue: q });
      toast("YouTube won't let this video play here, so Nexora is using the preview.", { kind: 'warn' });
      return this.start(index);
    }
    // CORS trouble on the Web Audio element: retry on the plain element, without EQ for this track
    if (a === this.fxEl && !this.noFxFor.has(t.id)) {
      this.noFxFor.add(t.id);
      const pos = a.currentTime || 0;
      return this.start(this.state.index, { pos, autoplay: true });
    }
    if (t.kind === 'radio' && !this._radioRetry) {
      this._radioRetry = true;
      setTimeout(() => { this._radioRetry = false; }, 8000);
      return this.start(this.state.index);
    }
    this.fail(t, a.error?.code === 4 ? 'The source is unavailable.' : 'Playback failed.');
  }

  onEnded() {
    if (this.track?.meta?.podcast) local.write(`nx.pod.${this.track.id}`, '0');
    if (this.state.sleepEnd) { player.set({ sleepEnd: false, sleepAt: null, playing: false }); return; }
    this.next({ auto: true });
  }

  async next({ auto = false } = {}) {
    const { queue, index, repeat } = this.state;
    if (auto && repeat === 'one') return this.start(index);
    if (index + 1 < queue.length) return this.start(index + 1);
    if (repeat === 'all' && queue.length) {
      if (this.state.shuffle) player.set({ queue: shuffled(queue) });
      return this.start(0);
    }
    if (auto && this.autoplayProvider && this.track) {
      try {
        const more = (await this.autoplayProvider(this.track, queue)) || [];
        if (more.length) {
          const add = more.map(withQid);
          this.orig.push(...add);
          player.set({ queue: [...queue, ...add] });
          toast('Nexora Autoplay: more like this', { kind: 'ok' });
          return this.start(index + 1);
        }
      } catch { /* fall through to stop */ }
    }
    if (auto) { player.set({ playing: false }); clock.set({ pos: 0 }); this.el.pause(); }
  }

  prev() {
    const { queue, index, repeat } = this.state;
    if (this.el.currentTime > 3 || !queue.length) return this.seek(0);
    if (index > 0) return this.start(index - 1);
    if (repeat === 'all') return this.start(queue.length - 1);
    return this.seek(0);
  }

  async play() {
    if (!this.track) return;
    if (!this.el.src) return this.start(this.state.index);
    fx.resume();
    try { await this.el.play(); } catch (e) { if (e.name === 'NotAllowedError') toast('Tap play to start.'); }
  }
  pause() { this.el.pause(); }
  toggle() { return this.state.playing ? this.pause() : this.play(); }

  seek(t) {
    if (this.state.radio) return;
    const dur = this.el.duration;
    const clamped = Math.max(0, Number.isFinite(dur) ? Math.min(t, dur) : t);
    try { this.el.currentTime = clamped; } catch { /* ignore */ }
    clock.set({ pos: clamped });
    this.updatePosition();
  }
  seekBy(d) { this.seek((this.el.currentTime || 0) + d); }

  setVolume(v) {
    v = Math.min(1, Math.max(0, v));
    local.write('nx.vol', String(v));
    player.set({ vol: v, muted: false });
    this.el.volume = v;
    this.fxEl.volume = v; this.plainEl.volume = v;
  }
  toggleMute() {
    const muted = !this.state.muted;
    player.set({ muted });
    this.el.volume = muted ? 0 : this.state.vol;
  }
  setSpeed(r) {
    player.set({ speed: r });
    this.fxEl.playbackRate = r; this.plainEl.playbackRate = r; this.ytEl.playbackRate = r;
  }

  // ------------------------------------------------------------------ sound studio
  enableFx() {
    if (!fx.init(this.fxEl)) { toast('This browser does not support the sound studio.', { kind: 'warn' }); return false; }
    if (!this.state.fxOn) {
      player.set({ fxOn: true });
      const t = this.track;
      // hop the current track onto the Web Audio element so EQ applies immediately
      if (t && (CORS_OK.has(t.source) || offline.isSaved(t.id)) && this.el !== this.fxEl) {
        const wasPlaying = this.state.playing;
        this.start(this.state.index, { pos: this.el.currentTime || 0, autoplay: wasPlaying });
      }
    }
    fx.resume();
    return true;
  }

  // ------------------------------------------------------------------ sleep timer
  setSleep(minutes) {
    clearTimeout(this.sleepTimer);
    if (!minutes) { player.set({ sleepAt: null, sleepEnd: false }); return; }
    if (minutes === 'end') { player.set({ sleepEnd: true, sleepAt: null }); toast('Will stop after this track.'); return; }
    const at = Date.now() + minutes * 60000;
    player.set({ sleepAt: at, sleepEnd: false });
    this.sleepTimer = setTimeout(() => this.sleepFade(), minutes * 60000);
    toast(`Sleep timer: ${minutes} min`, { kind: 'ok' });
  }
  sleepFade() {
    const start = this.state.vol;
    let step = 0;
    const iv = setInterval(() => {
      step++;
      this.el.volume = Math.max(0, start * (1 - step / 20));
      if (step >= 20) {
        clearInterval(iv);
        this.pause();
        this.el.volume = this.state.muted ? 0 : start;
        player.set({ sleepAt: null });
      }
    }, 250);
  }

  // ------------------------------------------------------------------ reporting
  tick(force) {
    const a = this.el;
    const t = this.track;
    const live = this.state.radio;
    const dur = live ? 0 : Number.isFinite(a.duration) && a.duration > 0 ? a.duration : t?.duration || 0;
    let buffered = 0;
    try { if (a.buffered.length) buffered = a.buffered.end(a.buffered.length - 1); } catch { /* ignore */ }
    clock.set({ pos: a.currentTime || 0, dur, buffered });
    if (!force) {
      if (t?.meta?.podcast && a.currentTime > 5 && performance.now() - (this._podSave || 0) > 5000) { this._podSave = performance.now(); local.write(`nx.pod.${t.id}`, String(Math.floor(a.currentTime))); }
      this.updatePosition();
      if (!this.recorded && t && !live && a.currentTime >= Math.min(30, (dur || 60) * 0.5)) this.recordPlay(t, a.currentTime);
    }
  }

  recordPlay(t, secs) {
    this.recorded = true;
    if (!app.get().user || t.source === 'local') return;
    post('/api/history', { track: slim(t), ms: Math.round(secs * 1000) }).catch(() => {});
    lib.set((s) => ({ history: [{ ...t, at: Date.now() }, ...s.history.filter((h) => h.id !== t.id)].slice(0, 60) }));
  }

  onPlayState() {
    const { playing } = this.state;
    const t = this.track;
    this.notify();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    if (!app.get().user || !t || t.source === 'local') return;
    clearTimeout(this.idleTimer);
    if (playing) {
      if (Date.now() - this.lastNP > 20000 || this._lastNPId !== t.id) {
        this.lastNP = Date.now();
        this._lastNPId = t.id;
        put('/api/nowplaying', { track: slim(t) }).catch(() => {});
      }
    } else {
      this.idleTimer = setTimeout(() => { put('/api/nowplaying', { track: null }).catch(() => {}); this._lastNPId = null; }, 90000);
    }
  }

  // ------------------------------------------------------------------ OS media controls (lock screen, headphones, watch)
  mediaSession() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (a, f) => { try { ms.setActionHandler(a, f); } catch { /* unsupported action */ } };
    set('play', () => this.play());
    set('pause', () => this.pause());
    set('previoustrack', () => this.prev());
    set('nexttrack', () => this.next());
    set('stop', () => this.pause());
    set('seekto', (d) => d.seekTime != null && this.seek(d.seekTime));
    set('seekbackward', (d) => this.seekBy(-(d.seekOffset || 10)));
    set('seekforward', (d) => this.seekBy(d.seekOffset || 10));
  }

  updateMediaSession(t) {
    if (!('mediaSession' in navigator) || !t) return;
    const art = t.artwork;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: t.artist || '', album: t.album || (t.kind === 'radio' ? 'Live radio' : ''),
      artwork: art ? [96, 192, 384, 512].map((s) => ({ src: artSize(art, s), sizes: `${s}x${s}` })) : [],
    });
  }

  updatePosition() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const now = performance.now();
    if (now - (this._lastPos || 0) < 1000) return;
    this._lastPos = now;
    const a = this.el;
    if (!Number.isFinite(a.duration) || a.duration <= 0 || this.state.radio) return;
    try { navigator.mediaSession.setPositionState({ duration: a.duration, playbackRate: a.playbackRate || 1, position: Math.min(a.currentTime, a.duration) }); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------ persistence + transfer
  persist() {
    const { queue, index } = this.state;
    if (!queue.length || queue[index]?.source === 'local') return; // blob: URLs die with the page
    const lo = Math.max(0, index - 5);
    local.write('nx.queue', JSON.stringify({ q: queue.slice(lo, lo + 80).filter((t) => t.source !== 'local').map((t) => ({ ...slim(t), qid: t.qid })), i: index - lo, pos: this.el.currentTime || 0 }));
  }

  restore() {
    try {
      const s = JSON.parse(local.read('nx.queue', 'null'));
      if (!s?.q?.length) return;
      this.orig = s.q.slice();
      player.set({ queue: s.q, index: s.i, track: s.q[s.i], radio: s.q[s.i]?.kind === 'radio' });
      clock.set({ pos: s.pos || 0, dur: s.q[s.i]?.duration || 0 });
      this.updateMediaSession(s.q[s.i]);
      this.restorePos = s.pos || 0;
    } catch { /* ignore corrupt state */ }
  }

  snapshot(max = 70) {
    const { queue, index, shuffle, repeat, playing } = this.state;
    const lo = Math.max(0, index - 3);
    return { queue: queue.slice(lo, lo + max).map(slim), index: index - lo, pos: this.el.currentTime || 0, playing, shuffle, repeat, context: this.state.context };
  }

  async applySnapshot(s) {
    if (!s?.queue?.length) return;
    player.set({ shuffle: !!s.shuffle, repeat: s.repeat || 'off' });
    this.orig = s.queue.map(withQid);
    player.set({ queue: this.orig.slice(), index: s.index, context: s.context || '' });
    await this.start(s.index, { pos: s.pos || 0, autoplay: s.playing !== false });
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify() { for (const f of this.listeners) f(); }
}

export const engine = new Engine();

// first play after a restored session should resume from the saved position
const origPlay = engine.play.bind(engine);
engine.play = async function () {
  if (engine.track && !engine.el.src) {
    const pos = engine.restorePos || 0;
    engine.restorePos = 0;
    return engine.start(engine.state.index, { pos });
  }
  return origPlay();
};
