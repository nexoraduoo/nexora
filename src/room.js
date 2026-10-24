// "Listen together": one Durable Object per room. It is a tiny command bus:
//   - every member's player command (play, pause, seek, next, new queue...) is sent to everyone, including the sender,
//     so all devices act on the same commands in the same order
//   - the host also sends a heartbeat so listeners stay within a second or two of each other
//   - a newcomer asks the host for the current state, and the host answers with a snapshot
// WebSocket Hibernation keeps idle rooms free on the Cloudflare free plan.

import { DurableObject } from 'cloudflare:workers';

const CMDS = new Set(['playTrack', 'play', 'pause', 'seek', 'next', 'prev', 'queue', 'shuffle', 'repeat', 'transfer']);

export class Room extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/end') {
      for (const ws of this.ctx.getWebSockets()) { try { ws.send(JSON.stringify({ t: 'ended' })); ws.close(4000, 'room ended'); } catch { /* closed */ } }
      return new Response('ok');
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const me = {
      key: `${request.headers.get('x-user-id')}:${request.headers.get('x-device-id')}`,
      id: request.headers.get('x-user-id'),
      name: request.headers.get('x-user-name') || 'Friend',
      hue: Number(request.headers.get('x-user-hue')) || 260,
      host: request.headers.get('x-is-host') === '1',
    };
    for (const old of this.ctx.getWebSockets(me.key)) { try { old.close(1000, 'replaced'); } catch { /* ignore */ } }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [me.key, me.host ? 'host' : 'guest']);
    server.serializeAttachment(me);
    this.presence();
    // a newcomer needs the current song and position: ask the host
    if (!me.host) for (const h of this.ctx.getWebSockets('host')) { try { h.send(JSON.stringify({ t: 'need-sync', to: me.key })); } catch { /* host gone */ } }
    return new Response(null, { status: 101, webSocket: client });
  }

  members() {
    const seen = new Map();
    for (const ws of this.ctx.getWebSockets()) { const a = ws.deserializeAttachment(); if (a) seen.set(a.id, { id: a.id, name: a.name, hue: a.hue, host: a.host }); }
    return [...seen.values()];
  }

  presence() {
    const msg = JSON.stringify({ t: 'presence', members: this.members() });
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(msg); } catch { /* closing */ } }
  }

  webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
    const me = ws.deserializeAttachment();
    if (!me || typeof m !== 'object') return;
    const all = this.ctx.getWebSockets();

    if (m.t === 'cmd' && CMDS.has(m.cmd)) {
      const out = JSON.stringify({ t: 'cmd', cmd: m.cmd, args: m.args && typeof m.args === 'object' ? m.args : {}, from: me.id, name: me.name, at: Date.now() });
      if (out.length > 250000) return;
      for (const s of all) { try { s.send(out); } catch { /* ignore */ } }
    } else if (m.t === 'sync' && me.host) {
      const out = JSON.stringify({ t: 'sync', id: String(m.id || '').slice(0, 300), pos: Number(m.pos) || 0, playing: !!m.playing, at: Date.now() });
      for (const s of all) if (s !== ws) { try { s.send(out); } catch { /* ignore */ } }
    } else if (m.t === 'snapshot' && me.host && typeof m.to === 'string') {
      const out = JSON.stringify({ t: 'cmd', cmd: 'transfer', args: { snapshot: m.snapshot }, from: me.id, name: me.name, at: Date.now() });
      if (out.length > 250000) return;
      for (const s of this.ctx.getWebSockets(m.to)) { try { s.send(out); } catch { /* ignore */ } }
    }
  }

  webSocketClose(ws, code) { try { ws.close(code, 'bye'); } catch { /* ignore */ } this.presence(); }
  webSocketError() { this.presence(); }
}
