// "Sound studio": 10-band equaliser, loudness levelling and a live analyser, built on the Web Audio API.
// It is created lazily (only when the user turns on EQ or opens the visualiser) because routing audio
// through Web Audio can interfere with background playback on iOS.

export const BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'bass-boost': [7, 6, 5, 3, 1, 0, 0, 0, 0, 0],
  'treble-boost': [0, 0, 0, 0, 0, 1, 3, 5, 6, 7],
  vocal: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1],
  rock: [5, 4, 2, -1, -2, 0, 2, 4, 5, 5],
  pop: [-1, 2, 4, 5, 3, 0, -1, -1, 1, 2],
  jazz: [3, 2, 0, 2, -2, -2, 0, 1, 3, 4],
  classical: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4],
  electronic: [6, 5, 1, 0, -2, 2, 1, 2, 5, 6],
  'hip-hop': [6, 5, 2, 3, -1, -1, 2, -1, 2, 3],
  lounge: [-3, -1, 1, 3, 2, 0, -2, 0, 1, 2],
  'small-speakers': [5, 6, 4, 2, 0, 0, 0, 1, 2, 2],
};

export const fx = {
  ctx: null,
  analyser: null,
  filters: [],
  comp: null,
  ready: false,

  /** Build the graph once for the given media element. */
  init(el) {
    if (this.ready) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC({ latencyHint: 'playback' });
      const src = this.ctx.createMediaElementSource(el);
      let node = src;
      this.filters = BANDS.map((f, i) => {
        const b = this.ctx.createBiquadFilter();
        b.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking';
        b.frequency.value = f;
        b.Q.value = 1.1;
        b.gain.value = 0;
        node.connect(b);
        node = b;
        return b;
      });
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = 0; // transparent until "normalise" is on
      this.comp.ratio.value = 1;
      node.connect(this.comp);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.82;
      this.comp.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.ready = true;
      return true;
    } catch (e) {
      console.warn('Web Audio unavailable', e);
      return false;
    }
  },

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); },

  setGains(gains, on = true) {
    if (!this.ready) return;
    this.filters.forEach((f, i) => { f.gain.setTargetAtTime(on ? gains[i] || 0 : 0, this.ctx.currentTime, 0.05); });
  },

  setNormalize(on) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.comp.threshold.setTargetAtTime(on ? -24 : 0, t, 0.05);
    this.comp.ratio.setTargetAtTime(on ? 4 : 1, t, 0.05);
    this.comp.knee.setTargetAtTime(on ? 20 : 0, t, 0.05);
  },
};
