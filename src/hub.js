// "Nexora Connect": one Durable Object per user. It holds a WebSocket for every device that user
// is signed in on, relays remote-control commands between them and shares live player state.
//
// Uses the WebSocket Hibernation API, so idle connections cost nothing on the free plan.

import { DurableObject } from 'cloudflare:workers';

const CMDS = new Set(['play', 'pause', 'toggle', 'next', 'prev', 'seek', 'volume', 'shuffle', 'repeat', 'playTrack', 'transfer', 'pull', 'queue', 'mute']);

export class UserHub extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/kick') {
      const dev = url.searchParams.get('device');
      for (const ws of this.ctx.getWebSockets(dev)) {
        try { ws.send(JSON.stringify({ t: 'kicked' })); ws.close(4001, 'signed out'); } catch { /* already closed */ }
      }
      this.presence();
      return new Response('ok');
    }

    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });

    const device = {
      id: request.headers.get('x-device-id'),
      name: request.headers.get('x-device-name') || 'Device',
      kind: request.headers.get('x-device-kind') || 'desktop',
    };
    // one live socket per device
    for (const old of this.ctx.getWebSockets(device.id)) {
      try { old.close(1000, 'replaced'); } catch { /* ignore */ }
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [device.id]);
    server.serializeAttachment({ ...device, since: Date.now(), state: null });
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.presence();
    return new Response(null, { status: 101, webSocket: client });
  }

  devices() {
    const list = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a) list.push({ id: a.id, name: a.name, kind: a.kind, since: a.since, state: a.state });
    }
    return list;
  }

  presence() {
    const msg = JSON.stringify({ t: 'presence', devices: this.devices() });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch { /* socket closing */ }
    }
  }

  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
    const me = ws.deserializeAttachment();
    if (!me) return;

    if (m.t === 'state' && m.state && typeof m.state === 'object') {
      // keep the snapshot small: it lives in the socket attachment (max 2 KB)
      const s = m.state;
      me.state = {
        track: s.track ? { id: String(s.track.id || '').slice(0, 120), title: String(s.track.title || '').slice(0, 100), artist: String(s.track.artist || '').slice(0, 80), artwork: typeof s.track.artwork === 'string' && s.track.artwork.length < 220 ? s.track.artwork : null, duration: Number(s.track.duration) || 0 } : null,
        playing: !!s.playing, pos: Number(s.pos) || 0, vol: Number(s.vol), ts: Date.now(),
        shuffle: !!s.shuffle, repeat: ['off', 'all', 'one'].includes(s.repeat) ? s.repeat : 'off', queueLen: Number(s.queueLen) || 0,
      };
      ws.serializeAttachment(me);
      const out = JSON.stringify({ t: 'state', id: me.id, state: me.state });
      for (const other of this.ctx.getWebSockets()) if (other !== ws) { try { other.send(out); } catch { /* ignore */ } }
      return;
    }

    if (m.t === 'cmd' && CMDS.has(m.cmd) && typeof m.to === 'string') {
      const payload = JSON.stringify({ t: 'cmd', from: me.id, cmd: m.cmd, args: m.args && typeof m.args === 'object' ? m.args : {} });
      if (payload.length > 250000) return;
      for (const target of this.ctx.getWebSockets(m.to)) { try { target.send(payload); } catch { /* ignore */ } }
      return;
    }

    if (m.t === 'hello') this.presence();
  }

  webSocketClose(ws, code) {
    try { ws.close(code, 'bye'); } catch { /* ignore */ }
    this.presence();
  }

  webSocketError() {
    this.presence();
  }
}
