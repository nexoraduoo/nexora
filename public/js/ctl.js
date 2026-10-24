// The single facade the UI talks to. A command goes to:
//   1. the listening room, if you are in one ("Listen together": everyone's player does it), else
//   2. another signed-in device you chose in the Connect menu, else
//   3. this device.
import { conn, player, clock } from './state.js';
import { engine, slim } from './player.js';
import { sendCmd } from './connect.js';
import * as together from './together.js';
import { useStore, useState, useEffect, shuffled } from './lib.js';

const target = () => conn.get().target;
const remote = (cmd, args) => { const t = target(); if (!t) return false; sendCmd(t, cmd, args); return true; };
const room = (cmd, args) => { if (!together.active()) return false; together.send(cmd, args); return true; };
const nextRepeat = (cur) => ['off', 'all', 'one'][(['off', 'all', 'one'].indexOf(cur || 'off') + 1) % 3];

export const ctl = {
  toggle: () => (room(player.get().playing ? 'pause' : 'play') || remote('toggle') || engine.toggle()),
  play: () => room('play') || remote('play') || engine.play(),
  pause: () => room('pause') || remote('pause') || engine.pause(),
  next: () => room('next') || remote('next') || engine.next(),
  prev: () => room('prev') || remote('prev') || engine.prev(),
  seek: (pos) => room('seek', { pos }) || remote('seek', { pos }) || engine.seek(pos),
  volume: (v) => remote('volume', { v }) || engine.setVolume(v), // volume is always yours alone
  mute: () => remote('mute') || engine.toggleMute(),
  shuffle: () => {
    if (room('shuffle', { on: !player.get().shuffle })) return undefined;
    const t = target();
    if (t) return sendCmd(t, 'shuffle', { on: !conn.get().remote[t]?.shuffle });
    return engine.toggleShuffle();
  },
  repeat: () => {
    if (room('repeat', { mode: nextRepeat(player.get().repeat) })) return undefined;
    const t = target();
    if (t) return sendCmd(t, 'repeat', { mode: nextRepeat(conn.get().remote[t]?.repeat) });
    return engine.cycleRepeat();
  },

  /** Play a list starting at `index` in the room, on the controlled device, or here. */
  playTracks(tracks, index = 0, opts = {}) {
    if (together.active() || target()) {
      let list = tracks, i = index;
      if (opts.shuffle) { const first = tracks[index]; list = [first, ...shuffled(tracks.filter((_, k) => k !== index))]; i = 0; }
      const lo = Math.max(0, i - 3);
      const args = { queue: list.slice(lo, lo + 70).map(slim), index: i - lo, context: opts.context || '' };
      if (together.active()) { together.send('playTrack', args); return undefined; }
      return sendCmd(target(), 'playTrack', args);
    }
    return engine.setQueue(tracks, index, opts);
  },
  playOne: (track, opts) => ctl.playTracks([track], 0, opts),
  queueNext: (track) => { if (room('queue', { track: slim(track), next: true })) return undefined; const t = target(); return t ? sendCmd(t, 'queue', { track: slim(track), next: true }) : engine.playNext(track); },
  queueAdd: (track) => { if (room('queue', { track: slim(track) })) return undefined; const t = target(); return t ? sendCmd(t, 'queue', { track: slim(track) }) : engine.addToQueue(track); },
};

/** The now-playing info for whichever device is in control (local or remote). */
export function useNow() {
  const local = useStore(player, (s) => ({ track: s.track, playing: s.playing, loading: s.loading, vol: s.vol, shuffle: s.shuffle, repeat: s.repeat, radio: s.radio, muted: s.muted }));
  const c = useStore(conn, (s) => ({ target: s.target, remote: s.remote, devices: s.devices }));
  if (!c.target) return { ...local, remote: null };
  const st = c.remote[c.target];
  const dev = c.devices.find((d) => d.id === c.target);
  return {
    track: st?.track ? { ...st.track, kind: 'track' } : null,
    playing: !!st?.playing, loading: false, vol: st?.vol ?? 1, shuffle: !!st?.shuffle, repeat: st?.repeat || 'off', radio: false, muted: false,
    remote: dev || { id: c.target, name: 'Device', kind: 'desktop' },
  };
}

/** Position + duration, interpolated for remote devices. */
export function useClock() {
  const local = useStore(clock);
  const c = useStore(conn, (s) => ({ target: s.target, remote: s.remote }));
  const [, force] = useState(0);
  const st = c.target ? c.remote[c.target] : null;
  useEffect(() => {
    if (!st?.playing) return undefined;
    const iv = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(iv);
  }, [st?.playing, c.target]);
  if (!c.target) return local;
  if (!st) return { pos: 0, dur: 0, buffered: 0 };
  const dur = st.track?.duration || 0;
  const pos = Math.min(dur || Infinity, (st.pos || 0) + (st.playing ? (performance.now() - st.at) / 1000 : 0));
  return { pos, dur, buffered: 0 };
}
