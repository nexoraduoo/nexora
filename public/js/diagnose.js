// "Check this device": plain-language answers to "why doesn't X work here?". Pure data, no UI.
import { isStandalone, isIOS, fmtBytes } from './lib.js';
import { app, conn } from './state.js';
import { room } from './together.js';

const ok = (id, label, detail = '') => ({ id, label, state: 'ok', detail });
const warn = (id, label, detail, fix = '') => ({ id, label, state: 'warn', detail, fix });
const bad = (id, label, detail, fix = '') => ({ id, label, state: 'bad', detail, fix });

export async function runChecks() {
  const out = [];

  out.push(isSecureContext
    ? ok('secure', 'Secure connection', location.origin)
    : bad('secure', 'Secure connection', 'This address is not https, so installing, offline mode and the microphone are blocked by the browser.', 'Open Nexora from its https:// address.'));

  out.push(navigator.onLine ? ok('online', 'Internet', 'Connected') : warn('online', 'Internet', 'You are offline. Downloaded songs still play.', 'Reconnect to browse new music.'));

  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
    out.push(reg?.active
      ? ok('sw', 'Offline app', navigator.serviceWorker.controller ? 'Ready: the app opens without internet' : 'Installed. Reload once to switch it on')
      : warn('sw', 'Offline app', 'Not ready yet', 'Reload the page once while online.'));
  } else out.push(bad('sw', 'Offline app', 'This browser cannot keep apps for offline use.', 'Use Chrome, Edge, Firefox or Safari.'));

  out.push(isStandalone()
    ? ok('installed', 'Installed as an app', 'Yes')
    : warn('installed', 'Installed as an app', 'Running in a browser tab', isIOS ? 'Safari: Share → Add to Home Screen. Background playback is best when installed.' : 'Use Settings → Install on this device for background playback and a launcher icon.'));

  const A = window.AudioContext || window.webkitAudioContext;
  out.push(A ? ok('audio', 'Sound engine (equalizer)', 'Supported') : warn('audio', 'Sound engine (equalizer)', 'Not available, playback still works', 'The equalizer needs a newer browser.'));

  out.push('mediaSession' in navigator
    ? ok('media', 'Lock-screen and media keys', 'Supported')
    : warn('media', 'Lock-screen and media keys', 'Not available in this browser', 'Songs still play; you just cannot control them from the lock screen.'));

  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) out.push(warn('voice', 'Voice assistant', 'This browser cannot listen.', 'Chrome, Edge and Safari can. You can still type commands in the voice window.'));
  else {
    let perm = 'unknown';
    try { perm = (await navigator.permissions.query({ name: 'microphone' })).state; } catch { /* not supported */ }
    out.push(perm === 'denied'
      ? bad('voice', 'Voice assistant', 'The microphone is blocked for Nexora.', 'Click the lock icon next to the address, then allow Microphone.')
      : ok('voice', 'Voice assistant', perm === 'granted' ? 'Microphone allowed' : 'Supported (the browser will ask once)'));
  }

  try {
    const db = await new Promise((res, rej) => { const q = indexedDB.open('nx-diagnose'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    db.close(); indexedDB.deleteDatabase('nx-diagnose');
    out.push(ok('db', 'Downloads storage', 'Works'));
  } catch { out.push(bad('db', 'Downloads storage', 'This browser blocks local storage (private window?).', 'Use a normal window to download songs.')); }

  if (navigator.storage?.estimate) {
    const e = await navigator.storage.estimate().catch(() => null);
    if (e?.quota) {
      const free = e.quota - e.usage;
      out.push(free < 200e6 ? warn('quota', 'Space for downloads', `${fmtBytes(free)} free`, 'Remove some downloads or free up space on the device.') : ok('quota', 'Space for downloads', `${fmtBytes(free)} free`));
    }
  }

  out.push(conn.get().online
    ? ok('live', 'Link to your other devices', `${conn.get().devices.length} device(s) online`)
    : warn('live', 'Link to your other devices', 'Not connected right now', 'It reconnects by itself. If it stays like this, reload the page.'));

  if (room.get().code) out.push(room.get().connected ? ok('room', 'Listening room', `Room ${room.get().code}`) : warn('room', 'Listening room', 'Reconnecting…', 'Check your internet.'));

  const a = document.createElement('audio');
  const can = (t) => a.canPlayType(t) ? 1 : 0;
  const fmts = [['MP3', 'audio/mpeg'], ['AAC', 'audio/mp4; codecs="mp4a.40.2"'], ['Ogg', 'audio/ogg; codecs="vorbis"'], ['FLAC', 'audio/flac'], ['HLS', 'application/vnd.apple.mpegurl']];
  out.push(can('audio/mpeg') ? ok('formats', 'Song formats', fmts.filter(([, t]) => can(t)).map(([n]) => n).join(', ')) : bad('formats', 'Song formats', 'This browser cannot play MP3.', 'Update your browser.'));

  return out;
}

export async function report() {
  const checks = await runChecks();
  const lines = [
    `Nexora check · ${new Date().toISOString()}`,
    `Browser: ${navigator.userAgent}`,
    `Screen: ${screen.width}x${screen.height} @${devicePixelRatio}`,
    `User: ${app.get().user?.username || '(signed out)'}`,
    '',
    ...checks.map((c) => `[${c.state.toUpperCase()}] ${c.label}: ${c.detail}${c.fix ? `  -> ${c.fix}` : ''}`),
  ];
  return { checks, text: lines.join('\n') };
}
