// Nexora Connect: realtime link between all the devices signed in to one account.
// - shows which devices are online and what each is playing
// - lets any device control or take over another (like Spotify Connect)
// - never forces a single device: two devices may play different music at the same time
import { app, conn, player, toast, nav } from './state.js';
import { engine } from './player.js';
import { api } from './api.js';

let ws = null;
let backoff = 1000;
let pingTimer = null;
let stateTimer = null;
let stopped = true;
let reconnectTimer = null;

const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

export function sendCmd(to, cmd, args = {}) { send({ t: 'cmd', to, cmd, args }); }

function myState() {
  const p = player.get();
  const t = p.track;
  return {
    track: t ? { id: t.id, title: t.title, artist: t.artist, artwork: t.artwork, duration: t.duration } : null,
    playing: p.playing, pos: engine.el.currentTime || 0, vol: p.vol, shuffle: p.shuffle, repeat: p.repeat, queueLen: p.queue.length,
  };
}

let pushTimer = null;
export function pushState() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => send({ t: 'state', state: myState() }), 350);
}

function setRemote(id, state) {
  conn.set((s) => ({ remote: { ...s.remote, [id]: { ...state, at: performance.now() } } }));
}

function onMessage(ev) {
  if (ev.data === 'pong') return;
  let m;
  try { m = JSON.parse(ev.data); } catch { return; }
  const me = app.get().device?.id;
  if (m.t === 'presence') {
    const remote = { ...conn.get().remote };
    for (const d of m.devices) if (d.state && d.id !== me) remote[d.id] = { ...d.state, at: performance.now() };
    for (const id of Object.keys(remote)) if (!m.devices.some((d) => d.id === id)) delete remote[id];
    const target = conn.get().target;
    const gone = target && !m.devices.some((d) => d.id === target);
    if (gone) toast('The other device went offline. Controls are back on this device.');
    conn.set({ devices: m.devices, remote, target: gone ? null : target, meId: me });
    pushState();
  } else if (m.t === 'state') {
    setRemote(m.id, m.state);
  } else if (m.t === 'cmd') {
    handleCmd(m);
  } else if (m.t === 'kicked') {
    stopped = true;
    toast('This device was signed out from another device.', { kind: 'warn' });
    app.set({ user: null });
    nav('/login', true);
  }
}

const nameOf = (id) => conn.get().devices.find((d) => d.id === id)?.name || 'another device';

async function handleCmd({ cmd, args = {}, from }) {
  switch (cmd) {
    case 'play': return engine.play();
    case 'pause': return engine.pause();
    case 'toggle': return engine.toggle();
    case 'next': return engine.next();
    case 'prev': return engine.prev();
    case 'seek': return engine.seek(Number(args.pos) || 0);
    case 'volume': return engine.setVolume(Number(args.v));
    case 'mute': return engine.toggleMute();
    case 'shuffle': return engine.toggleShuffle(args.on);
    case 'repeat': return engine.cycleRepeat(args.mode);
    case 'playTrack':
      if (Array.isArray(args.queue)) return engine.setQueue(args.queue, args.index || 0, { context: args.context || '' });
      return;
    case 'queue':
      if (args.track) return args.next ? engine.playNext(args.track) : engine.addToQueue(args.track);
      return;
    case 'transfer':
      conn.set({ target: null });
      await engine.applySnapshot(args.snapshot);
      toast(`Playback moved here from ${nameOf(from)}`, { kind: 'ok' });
      return;
    case 'pull': {
      const snap = engine.snapshot();
      engine.pause();
      if (snap.queue.length) sendCmd(from, 'transfer', { snapshot: { ...snap, playing: true } });
      return;
    }
    default:
  }
}

function open() {
  clearTimeout(reconnectTimer);
  if (!app.get().user || stopped) return;
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`;
  ws = new WebSocket(url);
  let opened = false;
  ws.onopen = () => {
    opened = true;
    backoff = 1000;
    conn.set({ online: true });
    send({ t: 'hello' });
    pushState();
    clearInterval(pingTimer);
    pingTimer = setInterval(() => ws && ws.readyState === 1 && ws.send('ping'), 25000);
    clearInterval(stateTimer);
    stateTimer = setInterval(() => player.get().playing && send({ t: 'state', state: myState() }), 12000);
  };
  ws.onmessage = onMessage;
  ws.onclose = () => {
    conn.set({ online: false, devices: [], remote: {} });
    clearInterval(pingTimer); clearInterval(stateTimer);
    // never connected? maybe the session was revoked: a 401 here sends the user back to sign-in
    if (!opened && navigator.onLine) api('GET', '/api/me').catch(() => {});
    if (!stopped && app.get().user) {
      reconnectTimer = setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, 30000);
    }
  };
  ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
}

export function start() {
  stopped = false;
  if (!ws || ws.readyState > 1) open();
}

export function stop() {
  stopped = true;
  clearTimeout(reconnectTimer);
  try { ws && ws.close(); } catch { /* ignore */ }
  ws = null;
  conn.set({ online: false, devices: [], remote: {}, target: null });
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && !stopped && (!ws || ws.readyState > 1)) { backoff = 1000; open(); } });
window.addEventListener('online', () => { if (!stopped) { backoff = 1000; open(); } });

// keep other devices informed whenever playback changes
player.subscribe(() => { if (!stopped) pushState(); });

// ------------------------------------------------------------------ user-facing actions
export function transferTo(id) {
  const snap = engine.snapshot();
  if (snap.queue.length) {
    sendCmd(id, 'transfer', { snapshot: { ...snap, playing: true } });
    engine.pause();
  }
  conn.set({ target: id });
}

export function bringHere() {
  const t = conn.get().target;
  if (t) sendCmd(t, 'pull');
  conn.set({ target: null });
}

export function controlOnly(id) { conn.set({ target: id }); }
export function releaseControl() { conn.set({ target: null }); }
