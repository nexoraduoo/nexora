// Player surfaces: bottom bar, full-screen Now Playing, queue, lyrics, sound studio, devices.
import { html, cx, fmtTime, useState, useEffect, useRef, useStore, useMemo, dominantColour, isIOS, timeAgo } from '../lib.js';
import { Icon, deviceIcon } from '../icons.js';
import { app, player, conn, lib, ui, toast, setPrefs } from '../state.js';
import { engine } from '../player.js';
import { ctl, useNow, useClock } from '../ctl.js';
import { Cover, IconBtn, Slider, Empty, openMenu, trackMenu, trackBadges, Equalizer, Spinner } from '../ui.js';
import { toggleLike } from '../library.js';
import { bringHere, transferTo, controlOnly, releaseControl } from '../connect.js';
import { fx, BANDS, PRESETS } from '../fx.js';
import { getLyrics } from '../shared/sources.js';
import * as offline from '../offline.js';
import { startListening } from '../voice.js';
import { t } from '../i18n.js';
import { TogetherPanel } from './together.js';
import * as together from '../together.js';
import { get, patch, del } from '../api.js';

/** A safe CSS url(): artwork URLs come from other services and friends, so neutralise quotes/brackets. */
const cssUrl = (u) => `url("${String(u).replace(/["'()\\\s]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)}")`;

// ------------------------------------------------------------------ shared controls
export function Transport({ big, compact }) {
  const now = useNow();
  const busy = now.loading && !now.remote;
  return html`<div class=${cx('transport', big && 'big', compact && 'compact')}>
    ${compact ? null : html`<${IconBtn} icon="shuffle" label=${t('Shuffle')} active=${now.shuffle} onClick=${() => ctl.shuffle()} size=${big ? 24 : 18} />`}
    <${IconBtn} icon="prev" label=${t('Previous')} onClick=${() => ctl.prev()} fill size=${big ? 30 : 20} />
    <button class="playbtn" onClick=${() => ctl.toggle()} aria-label=${now.playing ? t('Pause') : t('Play')} disabled=${!now.track}>
      ${busy && !now.playing ? html`<${Spinner} size=${big ? 30 : 20} />` : html`<${Icon} name=${now.playing ? 'pause' : 'play'} size=${big ? 34 : 22} />`}
    </button>
    <${IconBtn} icon="next" label=${t('Next')} onClick=${() => ctl.next()} fill size=${big ? 30 : 20} />
    ${compact ? null : html`<${IconBtn} icon=${now.repeat === 'one' ? 'repeat1' : 'repeat'} label=${t('Repeat')} active=${now.repeat !== 'off'} onClick=${() => ctl.repeat()} size=${big ? 24 : 18} />`}
  </div>`;
}

export function SeekBar() {
  const now = useNow();
  const { pos, dur, buffered } = useClock();
  if (now.radio) return html`<div class="seek live"><span class="live-dot"></span> ${t('LIVE')}</div>`;
  return html`<div class="seek">
    <span class="time">${fmtTime(pos)}</span>
    <${Slider} value=${pos} max=${dur} buffered=${buffered} label=${t('Seek')} onCommit=${(v) => ctl.seek(v)} disabled=${!now.track || !dur} />
    <span class="time">${fmtTime(dur)}</span>
  </div>`;
}

export function VolumeControl() {
  const now = useNow();
  if (isIOS && !now.remote) return null;
  const v = now.muted ? 0 : now.vol;
  return html`<div class="volume">
    <${IconBtn} icon=${v === 0 ? 'mute' : v < 0.45 ? 'volumeLow' : 'volume'} label=${t('Mute')} onClick=${() => ctl.mute()} size=${20} />
    <${Slider} value=${v} max=${1} step="0.01" label=${t('Volume')} onCommit=${(x) => ctl.volume(x)} onLive=${(x) => ctl.volume(x)} />
  </div>`;
}

const LikeBtn = ({ track, size = 20 }) => {
  const liked = useStore(lib, (s) => !!track && s.likedIds.has(track.id));
  if (!track || track.kind === 'radio') return null;
  return html`<${IconBtn} icon="heart" label=${t('Like')} active=${liked} fill=${liked} size=${size} class="like" onClick=${() => toggleLike(track)} />`;
};

// ------------------------------------------------------------------ bottom bar
export function PlayerBar() {
  const now = useNow();
  const { panel, np } = useStore(ui, (s) => ({ panel: s.panel, np: s.nowPlaying }));
  const sleep = useStore(player, (s) => s.sleepAt || s.sleepEnd);
  const online = useStore(conn, (s) => s.devices.length > 1);
  const inRoom = useStore(together.room, (s) => !!s.code);
  const tr = now.track;
  const { pos, dur } = useClock();
  if (!tr) {
    return html`<footer class="playerbar empty"><div class="pb-hint"><${Icon} name="music" size=${18} /> ${t('Pick something to play. Nexora is ad-free.')}</div>
      <div class="pb-right"><${IconBtn} icon="mic" label=${t('Voice assistant')} onClick=${() => ui.set({ voice: true })} /></div></footer>`;
  }
  return html`<footer class=${cx('playerbar', now.remote && 'remote')}>
    <div class="pb-progress" style=${`--p:${dur ? (pos / dur) * 100 : 0}%`}></div>
    <div class="pb-left" onClick=${(e) => { if (innerWidth < 900 && !e.target.closest('button')) ui.set({ nowPlaying: true }); }}>
      <div class="pb-art" onClick=${() => ui.set({ nowPlaying: true })}><${Cover} src=${tr.artwork} size=128 title=${tr.title} icon=${tr.kind === 'radio' ? 'radio' : 'music'} /></div>
      <div class="pb-info">
        <div class="pb-title">${tr.title} ${trackBadges(tr)}</div>
        <div class="pb-sub">${together.room.get().code ? html`<span class="remote-tag"><${Icon} name="users" size=${12} /> ${t('Listening together')} · ${together.room.get().members.length}</span>` : now.remote ? html`<span class="remote-tag"><${Icon} name=${deviceIcon(now.remote.kind)} size=${12} /> ${t('Playing on')} ${now.remote.name}</span>` : tr.artist}</div>
      </div>
      <${LikeBtn} track=${tr} />
    </div>
    <div class="pb-center"><${Transport} /><${SeekBar} /></div>
    <div class="pb-mobile-ctl"><${Transport} compact /></div>
    <div class="pb-right">
      <${IconBtn} icon="mic" label=${t('Voice assistant')} onClick=${() => startListening() || ui.set({ voice: true })} />
      <${IconBtn} icon="lyrics" label=${t('Lyrics')} onClick=${() => ui.set({ nowPlaying: true, nowTab: 'lyrics' })} />
      <${IconBtn} icon="queue" label=${t('Queue')} active=${panel === 'queue'} onClick=${() => ui.set({ panel: panel === 'queue' ? null : 'queue' })} />
      <${IconBtn} icon="devices" label=${t('Connect to a device')} active=${panel === 'devices' || !!now.remote} badge=${online && !now.remote} onClick=${() => ui.set({ panel: panel === 'devices' ? null : 'devices' })} />
      <${IconBtn} icon="users" label=${t('Listen together')} active=${panel === 'together' || inRoom} onClick=${() => ui.set({ panel: panel === 'together' ? null : 'together' })} />
      ${sleep ? html`<${IconBtn} icon="timer" label=${t('Sleep timer')} active onClick=${() => ui.set({ nowPlaying: true, nowTab: 'studio' })} />` : null}
      <${VolumeControl} />
      <${IconBtn} icon="expand" label=${t('Full screen')} onClick=${() => ui.set({ nowPlaying: true })} />
    </div>
  </footer>`;
}

// ------------------------------------------------------------------ queue
export function QueueList({ compact }) {
  const { queue, index, context } = useStore(player, (s) => ({ queue: s.queue, index: s.index, context: s.context }));
  const [drag, setDrag] = useState(null);
  const remote = useStore(conn, (s) => s.target);
  if (remote) return html`<${Empty} icon="devices" title=${t('Queue lives on the other device')} text=${t('You are controlling another device. Bring playback here to see its queue.')} />`;
  if (!queue.length) return html`<${Empty} icon="queue" title=${t('Your queue is empty')} text=${t('Play a song or add one with “Add to queue”.')} />`;
  const upcoming = queue.slice(index + 1);
  const row = (tr, i, isNow) => html`<div class=${cx('qrow', isNow && 'now', drag === i && 'dragging')} key=${tr.qid || i} draggable=${!isNow}
      onDragStart=${() => setDrag(i)} onDragOver=${(e) => e.preventDefault()} onDrop=${() => { if (drag != null) engine.move(drag, i); setDrag(null); }} onDragEnd=${() => setDrag(null)}>
    <span class="grip"><${Icon} name="grip" size=${16} /></span>
    <button class="qmain" onClick=${() => (isNow ? ctl.toggle() : engine.jump(i))}>
      <${Cover} src=${tr.artwork} size=96 title=${tr.title} class="qart" />
      <span class="qtext"><b>${isNow ? html`<${Equalizer} /> ` : null}${tr.title}</b><small>${tr.artist}</small></span>
    </button>
    <span class="qdur">${tr.kind === 'radio' ? t('LIVE') : fmtTime(tr.duration)}</span>
    ${isNow ? null : html`<${IconBtn} icon="x" label=${t('Remove')} size=${16} onClick=${() => engine.removeAt(i)} />`}
  </div>`;
  return html`<div class=${cx('queue', compact && 'compact')}>
    <h4>${t('Now playing')}</h4>
    ${row(queue[index], index, true)}
    <div class="queue-head"><h4>${t('Next up')}${context ? html` <small>· ${context}</small>` : null}</h4>${upcoming.length ? html`<button class="link" onClick=${() => engine.clearUpcoming()}>${t('Clear')}</button>` : null}</div>
    ${upcoming.length ? upcoming.map((tr, k) => row(tr, index + 1 + k, false)) : html`<p class="muted pad">${t('Nothing queued. Nexora Autoplay will keep the music going with similar songs.')}</p>`}
  </div>`;
}

// ------------------------------------------------------------------ lyrics
export function Lyrics({ track }) {
  const [data, setData] = useState({ loading: true, lines: [], plain: '' });
  const { pos } = useClock();
  const box = useRef();
  useEffect(() => {
    let live = true;
    if (!track || track.kind === 'radio') { setData({ loading: false, lines: [], plain: '' }); return undefined; }
    setData({ loading: true, lines: [], plain: '' });
    getLyrics({ title: track.title, artist: track.artist, album: track.album, duration: track.meta?.fullDuration || track.duration })
      .then((d) => live && setData({ loading: false, lines: d?.synced || [], plain: d?.plain || '', instrumental: d?.instrumental }))
      .catch(() => live && setData({ loading: false, lines: [], plain: '' }));
    return () => { live = false; };
  }, [track?.id]);
  let active = -1;
  for (let i = 0; i < data.lines.length; i++) if (data.lines[i].t <= pos + 0.25) active = i; else break;
  useEffect(() => {
    const el = box.current?.querySelector('.ly.on');
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active]);
  if (data.loading) return html`<div class="lyrics center"><${Spinner} /></div>`;
  if (data.instrumental) return html`<div class="lyrics center"><p class="muted">${t('Instrumental')}</p></div>`;
  if (data.lines.length) {
    return html`<div class="lyrics" ref=${box}>${data.lines.map((l, i) => html`<p class=${cx('ly', i === active && 'on', i < active && 'past')} onClick=${() => ctl.seek(l.t)}>${l.line || '♪'}</p>`)}</div>`;
  }
  if (data.plain) return html`<div class="lyrics plain"><pre>${data.plain}</pre></div>`;
  return html`<div class="lyrics center"><${Icon} name="lyrics" size=${30} /><p class="muted">${t('No lyrics found for this song.')}</p></div>`;
}

// ------------------------------------------------------------------ sound studio (EQ + visualiser + timers)
function Visualizer() {
  const cv = useRef();
  const { fxOn } = useStore(player, (s) => ({ fxOn: s.fxOn }));
  const playing = useStore(player, (s) => s.playing);
  useEffect(() => {
    const c = cv.current;
    if (!c) return undefined;
    const g = c.getContext('2d');
    let raf;
    const data = new Uint8Array(64);
    const css = getComputedStyle(document.documentElement);
    const draw = (ts) => {
      const w = c.clientWidth * devicePixelRatio, h = c.clientHeight * devicePixelRatio;
      if (c.width !== w) { c.width = w; c.height = h; }
      g.clearRect(0, 0, w, h);
      const n = 48, bw = w / n;
      const live = fx.ready && fxOn && fx.analyser && player.get().playing;
      if (live) fx.analyser.getByteFrequencyData(data);
      const grad = g.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, css.getPropertyValue('--accent').trim() || '#8b6cff');
      grad.addColorStop(1, css.getPropertyValue('--accent-2').trim() || '#00d4ff');
      g.fillStyle = grad;
      for (let i = 0; i < n; i++) {
        const k = Math.floor((i / n) * 40);
        const v = live ? data[k] / 255 : player.get().playing ? 0.18 + 0.12 * Math.sin(ts / 300 + i * 0.6) : 0.06;
        const bh = Math.max(3 * devicePixelRatio, v * h * 0.95);
        const x = i * bw + bw * 0.18;
        const r = bw * 0.32;
        g.beginPath();
        g.roundRect ? g.roundRect(x, h - bh, bw * 0.64, bh, r) : g.rect(x, h - bh, bw * 0.64, bh);
        g.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [fxOn, playing]);
  return html`<canvas class="viz" ref=${cv}></canvas>`;
}

export function StudioPanel({ full }) {
  const prefs = useStore(app, (s) => s.prefs);
  const { fxOn, speed, sleepAt, sleepEnd, track } = useStore(player, (s) => ({ fxOn: s.fxOn, speed: s.speed, sleepAt: s.sleepAt, sleepEnd: s.sleepEnd, track: s.track }));
  const [, force] = useState(0);
  useEffect(() => { if (!sleepAt) return undefined; const iv = setInterval(() => force((n) => n + 1), 1000); return () => clearInterval(iv); }, [sleepAt]);
  const eq = prefs.eq;
  const unsupported = track && track.source === 'radio';
  const apply = (next) => {
    setPrefs({ eq: next });
    if (next.on && !engine.enableFx()) return;
    fx.setGains(next.gains, next.on);
  };
  useEffect(() => { if (eq.on && fxOn) { fx.setGains(eq.gains, true); fx.setNormalize(prefs.normalize); } }, [fxOn]);
  const left = sleepAt ? Math.max(0, Math.round((sleepAt - Date.now()) / 1000)) : 0;
  return html`<div class=${cx('studio', full && 'full')}>
    <${Visualizer} />
    ${isIOS ? html`<p class="muted note">${t('On iPhone/iPad the equaliser is limited by Apple. Lock-screen playback works best with it off.')}</p>` : null}
    <div class="studio-row">
      <label class="switch"><input type="checkbox" checked=${eq.on} onChange=${(e) => apply({ ...eq, on: e.target.checked })} /><i></i><span>${t('Equaliser')}</span></label>
      <select class="select" value=${eq.preset} onChange=${(e) => apply({ ...eq, on: true, preset: e.target.value, gains: PRESETS[e.target.value] || eq.gains })}>
        ${Object.keys(PRESETS).map((k) => html`<option value=${k}>${k.replace(/-/g, ' ')}</option>`)}
        ${eq.preset === 'custom' ? html`<option value="custom">custom</option>` : null}
      </select>
      <label class="switch"><input type="checkbox" checked=${prefs.normalize} onChange=${(e) => { setPrefs({ normalize: e.target.checked }); if (engine.enableFx()) fx.setNormalize(e.target.checked); }} /><i></i><span>${t('Level volume')}</span></label>
    </div>
    ${unsupported ? html`<p class="muted note">${t('Live radio streams cannot be equalised by the browser.')}</p>` : null}
    <div class=${cx('eq', !eq.on && 'off')}>
      ${BANDS.map((f, i) => html`<div class="band"><input type="range" min="-12" max="12" step="0.5" value=${eq.gains[i]} orient="vertical" aria-label=${`${f} Hz`}
        onInput=${(e) => { const g = eq.gains.slice(); g[i] = Number(e.target.value); apply({ ...eq, on: true, preset: 'custom', gains: g }); }} />
        <small>${f >= 1000 ? `${f / 1000}k` : f}</small></div>`)}
    </div>
    <div class="studio-grid">
      <div class="field"><label>${t('Playback speed')}</label>
        <div class="seg">${[0.75, 1, 1.25, 1.5, 2].map((r) => html`<button class=${cx(speed === r && 'on')} onClick=${() => engine.setSpeed(r)}>${r}×</button>`)}</div></div>
      <div class="field"><label>${t('Sleep timer')} ${sleepAt ? html`<small>· ${fmtTime(left)} ${t('left')}</small>` : sleepEnd ? html`<small>· ${t('after this track')}</small>` : null}</label>
        <div class="seg">${[15, 30, 45, 60].map((m) => html`<button onClick=${() => engine.setSleep(m)}>${m}m</button>`)}
          <button class=${cx(sleepEnd && 'on')} onClick=${() => engine.setSleep('end')}>${t('End of track')}</button>
          ${sleepAt || sleepEnd ? html`<button onClick=${() => engine.setSleep(0)}>${t('Off')}</button>` : null}</div></div>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ devices (Nexora Connect)
export function DevicesPanel({ onClose }) {
  const { devices, target, meId, online } = useStore(conn, (s) => ({ devices: s.devices, target: s.target, meId: s.meId, online: s.online }));
  const remote = useStore(conn, (s) => s.remote);
  const [all, setAll] = useState([]);
  const me = app.get().device;
  useEffect(() => { get('/api/devices').then((d) => setAll(d.devices)).catch(() => {}); }, [devices.length]);
  const here = player.get();
  const rows = useMemo(() => {
    const live = new Map(devices.map((d) => [d.id, d]));
    const out = all.map((d) => ({ ...d, live: live.get(d.id) }));
    return out.sort((a, b) => (b.id === me?.id) - (a.id === me?.id) || !!b.live - !!a.live);
  }, [all, devices]);
  const rename = async (d) => {
    const name = prompt(t('Name this device'), d.name);
    if (!name) return;
    await patch(`/api/devices/${d.id}`, { name }).catch((e) => toast(e.message, { kind: 'error' }));
    setAll((a) => a.map((x) => (x.id === d.id ? { ...x, name } : x)));
  };
  const signOut = async (d) => {
    if (!confirm(`${t('Sign out')} ${d.name}?`)) return;
    await del(`/api/devices/${d.id}`).catch((e) => toast(e.message, { kind: 'error' }));
    setAll((a) => a.filter((x) => x.id !== d.id));
  };
  return html`<div class="devices">
    <p class="muted pad">${online ? t('Everything signed in to your account shows up here. Play on several at once, or move your music between them.') : t('Reconnecting to your other devices…')}</p>
    ${rows.map((d) => {
      const isMe = d.id === me?.id;
      const st = isMe ? { playing: here.playing, track: here.track } : remote[d.id] || d.live?.state;
      const controlling = target === d.id;
      return html`<div class=${cx('device', (isMe && !target) && 'active', controlling && 'active')}>
        <div class="device-ic"><${Icon} name=${deviceIcon(d.kind)} size=${24} />${d.live || isMe ? html`<i class="presence"></i>` : null}</div>
        <div class="device-main">
          <b>${d.name} ${isMe ? html`<small class="chip">${t('This device')}</small>` : null}</b>
          <small>${d.live || isMe ? (st?.playing && st?.track ? `${t('Playing')}: ${st.track.title}` : st?.track ? `${t('Paused')}: ${st.track.title}` : t('Online · idle')) : `${t('Last seen')} ${timeAgo(d.last_seen)}`}</small>
        </div>
        <div class="device-actions">
          ${isMe
            ? (target ? html`<button class="btn sm primary" onClick=${() => { bringHere(); onClose?.(); }}>${t('Play here')}</button><button class="btn sm ghost" onClick=${() => { releaseControl(); }}>${t('Play here too')}</button>` : html`<span class="muted sm">${t('Controlling')}</span>`)
            : d.live ? html`
              ${here.track ? html`<button class="btn sm primary" onClick=${() => { transferTo(d.id); onClose?.(); }}>${t('Move music here')}</button>` : null}
              ${!controlling ? html`<button class="btn sm ghost" onClick=${() => controlOnly(d.id)}>${t('Control')}</button>` : html`<button class="btn sm ghost" onClick=${releaseControl}>${t('Stop controlling')}</button>`}`
            : null}
          <${IconBtn} icon="more" label=${t('More')} size=${18} onClick=${(e) => openMenu(e, [
            { icon: 'edit', label: t('Rename'), onClick: () => rename(d) },
            !isMe ? { icon: 'logout', label: t('Sign out this device'), danger: true, onClick: () => signOut(d) } : null,
          ])} />
        </div>
      </div>`;
    })}
    ${!rows.length ? html`<${Empty} icon="devices" title=${t('Just this device so far')} text=${t('Sign in on your phone, laptop or TV with the same account and they will appear here.')} />` : null}
  </div>`;
}

// ------------------------------------------------------------------ side panel (queue / devices)
export function SidePanel() {
  const { panel } = useStore(ui, (s) => ({ panel: s.panel }));
  if (!panel) return null;
  const close = () => ui.set({ panel: null });
  return html`<aside class="sidepanel" role="complementary">
    <div class="sp-head">
      <div class="seg tabs"><button class=${cx(panel === 'queue' && 'on')} onClick=${() => ui.set({ panel: 'queue' })}>${t('Queue')}</button><button class=${cx(panel === 'devices' && 'on')} onClick=${() => ui.set({ panel: 'devices' })}>${t('Devices')}</button><button class=${cx(panel === 'together' && 'on')} onClick=${() => ui.set({ panel: 'together' })}>${t('Together')}</button></div>
      <${IconBtn} icon="x" label=${t('Close')} onClick=${close} />
    </div>
    <div class="sp-body">${panel === 'queue' ? html`<${QueueList} compact />` : panel === 'together' ? html`<${TogetherPanel} />` : html`<${DevicesPanel} onClose=${close} />`}</div>
  </aside>`;
}

// ------------------------------------------------------------------ full-screen now playing
export function NowPlaying() {
  const { open, tab } = useStore(ui, (s) => ({ open: s.nowPlaying, tab: s.nowTab }));
  const now = useNow();
  const ctxLabel = useStore(player, (s) => s.context);
  const [col, setCol] = useState(null);
  const tr = now.track;
  useEffect(() => { let live = true; dominantColour(tr?.artwork).then((c) => live && setCol(c)); return () => { live = false; }; }, [tr?.artwork]);
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => e.key === 'Escape' && ui.set({ nowPlaying: false });
    addEventListener('keydown', k);
    document.body.classList.add('noscroll', 'np-open');
    return () => { removeEventListener('keydown', k); document.body.classList.remove('noscroll', 'np-open'); };
  }, [open]);
  if (!open || !tr) return null;
  const bg = col ? `--c:${col[0]},${col[1]},${col[2]}` : '';
  const setTab = (k) => ui.set({ nowTab: k });
  const saved = lib.get().downloads.has(tr.id);
  const canDl = offline.canDownload(tr);
  return html`<div class="np" style=${bg}>
    <div class="np-bg" style=${tr.artwork ? `background-image:${cssUrl(tr.artwork)}` : ''}></div>
    <div class="np-shade"></div>
    <header class="np-head">
      <${IconBtn} icon="down" label=${t('Minimise')} onClick=${() => ui.set({ nowPlaying: false })} size=${26} />
      <div class="np-ctx"><small>${t('Playing from')}</small><b>${now.remote ? `${now.remote.name}` : ctxLabel || 'Nexora'}</b></div>
      <${IconBtn} icon="more" label=${t('More')} onClick=${(e) => openMenu(e, trackMenu(tr))} size=${24} />
    </header>
    <div class="np-tabs seg tabs">${[['art', t('Now playing')], ['lyrics', t('Lyrics')], ['queue', t('Queue')], ['studio', t('Studio')]].map(([k, l]) => html`<button class=${cx(tab === k && 'on')} onClick=${() => setTab(k)}>${l}</button>`)}</div>
    <div class="np-body">
      <div class=${cx('np-stage', tab !== 'art' && 'compact')}>
        <${Cover} src=${tr.artwork} size=800 title=${tr.title} class="np-cover" icon=${tr.kind === 'radio' ? 'radio' : 'music'} />
        <div class="np-meta">
          <div class="np-title">${tr.title} ${trackBadges(tr)}</div>
          <div class="np-artist">${tr.artist}${tr.album ? ` · ${tr.album}` : ''}</div>
        </div>
        <${SeekBar} />
        <${Transport} big />
        <div class="np-extra">
          <${LikeBtn} track=${tr} size=${24} />
          ${canDl ? html`<${IconBtn} icon=${saved ? 'check' : 'download'} label=${saved ? t('Downloaded') : t('Download for offline')} active=${saved} size=${22} onClick=${() => (saved ? offline.remove(tr.id) : offline.save(tr))} />` : null}
          <${IconBtn} icon="mic" label=${t('Voice assistant')} onClick=${() => startListening() || ui.set({ voice: true })} size=${22} />
          <${IconBtn} icon="devices" label=${t('Connect to a device')} onClick=${() => ui.set({ panel: 'devices', nowPlaying: false })} active=${!!now.remote} size=${22} />
          <${IconBtn} icon="users" label=${t('Listen together')} onClick=${() => ui.set({ panel: 'together', nowPlaying: false })} active=${!!together.room.get().code} size=${22} />
          <${VolumeControl} />
        </div>
        ${tr.preview && tr.kind !== 'radio' && app.get().config.youtube ? html`<button class="btn primary" onClick=${() => engine.playFullOnYouTube(tr)}><${Icon} name="play" size=${18} /> ${t('Play full song (YouTube)')}</button>` : null}
        ${tr.preview ? html`<p class="np-note"><${Icon} name="info" size=${14} /> ${t('This is a 30-second preview. Nexora plays full-length songs from artists and open licences; open the full song in your own music subscription from the ⋯ menu.')}</p>` : null}
      </div>
      <div class=${cx('np-side', tab === 'art' && 'hide-mobile')}>
        ${tab === 'lyrics' || tab === 'art' ? html`<${Lyrics} track=${tr} />` : null}
        ${tab === 'queue' ? html`<${QueueList} />` : null}
        ${tab === 'studio' ? html`<${StudioPanel} full />` : null}
      </div>
    </div>
  </div>`;
}
