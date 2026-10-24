// Listen together: a shared room. While you are in one, play / pause / seek / next / new songs are sent to the room
// and every member's player does the same thing, so you all hear the same song at the same moment.
// The host's player also sends a heartbeat so listeners stay within a couple of seconds.
import { createStore } from './lib.js';
import { app, toast, ui } from './state.js';
import { api } from './api.js';
import { engine } from './player.js';

export const room = createStore({ code: null, members: [], connected: false, host: false, hostName: '' });

let ws = null;
let heartbeat = null;
let wanted = null;
let backoff = 1000;
let retry = null;

// phones freeze background sockets without telling us: check again when the app comes back or the network returns
const wake = () => { if (wanted && (!ws || ws.readyState > 1)) { backoff = 1000; open(); } };
document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
addEventListener('online', wake);
addEventListener('pageshow', wake);

export const active = () => !!room.get().code && room.get().connected;
export const roomLink = (code = room.get().code) => `${location.origin}/#/together/${code}`;

const me = () => app.get().user?.id;

function open() {
  clearTimeout(retry);
  if (!wanted) return;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms/${wanted}/ws`);
  ws.onopen = () => {
    backoff = 1000;
    room.set({ connected: true });
    clearInterval(heartbeat);
    heartbeat = setInterval(() => {
      if (!room.get().host || !engine.track || !engine.state.playing || ws?.readyState !== 1) return;
      ws.send(JSON.stringify({ t: 'sync', id: engine.track.id, pos: engine.el.currentTime || 0, playing: true }));
    }, 5000);
  };
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } handle(m); };
  ws.onclose = () => {
    clearInterval(heartbeat);
    room.set({ connected: false });
    if (wanted) { retry = setTimeout(open, backoff); backoff = Math.min(backoff * 2, 15000); }
  };
  ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
}

function handle(m) {
  if (m.t === 'presence') room.set({ members: m.members });
  else if (m.t === 'cmd') applyCmd(m);
  else if (m.t === 'sync') followHost(m);
  else if (m.t === 'need-sync') {
    // a newcomer is asking what is playing: the host answers with a snapshot
    if (room.get().host && engine.track && ws?.readyState === 1) ws.send(JSON.stringify({ t: 'snapshot', to: m.to, snapshot: engine.snapshot() }));
  } else if (m.t === 'ended') { leave(); toast('The host ended the listening room.', { kind: 'warn' }); }
}

async function applyCmd({ cmd, args = {}, from, name }) {
  const mine = from === me();
  switch (cmd) {
    case 'playTrack':
      if (Array.isArray(args.queue)) {
        await engine.setQueue(args.queue.filter((t) => t.source !== 'local'), args.index || 0, { context: args.context || 'Listening together' });
        if (!mine) toast(`${name} started “${args.queue[args.index || 0]?.title || 'a song'}”`, { ms: 2500 });
      }
      break;
    case 'play': engine.play(); break;
    case 'pause': engine.pause(); break;
    case 'seek': engine.seek(Number(args.pos) || 0); break;
    case 'next': engine.next(); break;
    case 'prev': engine.prev(); break;
    case 'shuffle': engine.toggleShuffle(args.on); break;
    case 'repeat': engine.cycleRepeat(args.mode); break;
    case 'queue': if (args.track) (args.next ? engine.playNext(args.track) : engine.addToQueue(args.track)); break;
    case 'transfer': await engine.applySnapshot(args.snapshot); break;
    default:
  }
}

/** Keep listeners close to the host: fix only real drift, never fight small differences. */
function followHost(m) {
  if (room.get().host || !engine.track || engine.track.id !== m.id) return;
  const drift = Math.abs((engine.el.currentTime || 0) - m.pos);
  if (drift > 3 && Number.isFinite(engine.el.duration || NaN)) engine.seek(m.pos + 0.4);
  if (m.playing && !engine.state.playing) engine.play();
}

export function send(cmd, args = {}) {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'cmd', cmd, args }));
}

export async function join(code) {
  code = String(code || '').trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error('A room code has 6 letters and numbers.');
  const info = await api('GET', `/api/rooms/${code}`);
  leave(true);
  wanted = code;
  room.set({ code, members: [], connected: false, host: info.hostId === me(), hostName: info.host });
  open();
  ui.set({ panel: 'together' });
  return info;
}

export async function start() {
  const r = await api('POST', '/api/rooms', {});
  await join(r.code);
  return r.code;
}

export function leave(quiet = false) {
  wanted = null;
  clearTimeout(retry);
  clearInterval(heartbeat);
  try { ws?.close(); } catch { /* ignore */ }
  ws = null;
  room.set({ code: null, members: [], connected: false, host: false, hostName: '' });
  if (!quiet) toast('You left the listening room.', { ms: 2000 });
}

export async function end() {
  const code = room.get().code;
  if (code) await api('DELETE', `/api/rooms/${code}`).catch(() => {});
  leave(true);
}
