// Offline library: downloaded tracks live in IndexedDB as audio blobs and play without any network.
// Only tracks that may legally be saved (artist-enabled downloads, Creative Commons, public domain,
// your own uploads) can be downloaded. Previews and live radio never can.
import { createStore } from './lib.js';
import { lib, toast } from './state.js';

const DB_NAME = 'nexora-offline';
const STORE = 'files';
export const dl = createStore({ active: {} }); // id -> percent while downloading

let dbp;
function open() {
  dbp = dbp || new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
};

const urls = new Map(); // id -> blob URL

export const canDownload = (t) => !!t && t.kind !== 'radio' && !t.preview && !!t.downloadable && !!t.url;
export const isSaved = (id) => lib.get().downloads.has(id);

export async function init() {
  try {
    const all = await tx('readonly', (s) => s.getAll());
    const map = new Map();
    for (const f of all || []) map.set(f.id, { size: f.size, at: f.at, track: f.track });
    lib.set({ downloads: map });
  } catch { /* IndexedDB unavailable (private mode): downloads disabled */ }
}

export async function urlFor(id) {
  if (!isSaved(id)) return null;
  if (urls.has(id)) return urls.get(id);
  const f = await tx('readonly', (s) => s.get(id));
  if (!f?.blob) return null;
  const u = URL.createObjectURL(f.blob);
  urls.set(id, u);
  return u;
}

async function fetchBlob(track, onProgress) {
  const res = await fetch(track.url, { credentials: track.url.startsWith('/') ? 'same-origin' : 'omit' });
  if (!res.ok) throw new Error(`The server refused the download (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  const type = res.headers.get('content-type') || 'audio/mpeg';
  if (!res.body || !total) {
    const blob = await res.blob();
    onProgress?.(100);
    return blob;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress?.(Math.round((got / total) * 100));
  }
  return new Blob(chunks, { type });
}

export async function save(track) {
  if (!canDownload(track)) { toast('This track can only be streamed, not downloaded.', { kind: 'warn' }); return false; }
  if (isSaved(track.id)) return true;
  if (dl.get().active[track.id] !== undefined) return false;
  try {
    navigator.storage?.persist?.();
    dl.set((s) => ({ active: { ...s.active, [track.id]: 0 } }));
    const blob = await fetchBlob(track, (p) => dl.set((s) => ({ active: { ...s.active, [track.id]: p } })));
    if (blob.size < 2000) throw new Error('The file looked empty.');
    const rec = { id: track.id, blob, track, size: blob.size, at: Date.now() };
    await tx('readwrite', (s) => s.put(rec));
    const map = new Map(lib.get().downloads);
    map.set(track.id, { size: rec.size, at: rec.at, track });
    lib.set({ downloads: map });
    toast(`Saved for offline: ${track.title}`, { kind: 'ok' });
    return true;
  } catch (e) {
    toast(`Couldn't download "${track.title}". ${e.message || ''}`.trim(), { kind: 'error' });
    return false;
  } finally {
    dl.set((s) => { const a = { ...s.active }; delete a[track.id]; return { active: a }; });
  }
}

export async function remove(id) {
  await tx('readwrite', (s) => s.delete(id));
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  const map = new Map(lib.get().downloads);
  map.delete(id);
  lib.set({ downloads: map });
}

export async function clearAll() {
  await tx('readwrite', (s) => s.clear());
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
  lib.set({ downloads: new Map() });
}

export const totalBytes = () => [...lib.get().downloads.values()].reduce((s, f) => s + f.size, 0);

/** Save a downloadable track to the user's device as a normal audio file (usually .mp3). */
export async function exportFile(track) {
  if (!canDownload(track)) { toast('This track can only be streamed, not exported.', { kind: 'warn' }); return; }
  let blob;
  if (isSaved(track.id)) blob = (await tx('readonly', (s) => s.get(track.id)))?.blob;
  if (!blob) {
    toast('Preparing your file…');
    try { blob = await fetchBlob(track); } catch (e) { toast(`Couldn't fetch the file. ${e.message}`, { kind: 'error' }); return; }
  }
  const type = blob.type || '';
  const ext = /mp4|m4a|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : /flac/.test(type) ? 'flac' : /wav/.test(type) ? 'wav' : /opus/.test(type) ? 'opus' : 'mp3';
  const name = `${track.artist ? track.artist + ' - ' : ''}${track.title}`.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120);
  const a = document.createElement('a');
  const u = URL.createObjectURL(blob);
  a.href = u;
  a.download = `${name}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
  toast(`Saved ${a.download}`, { kind: 'ok' });
}

/** Swap a saved copy for a newer revision of the same recording (id and playlists stay the same). */
export async function replace(id, track) {
  const old = lib.get().downloads.get(id);
  if (!old) return false;
  const blob = await fetchBlob(track);
  if (blob.size < 2000) throw new Error('The new file looked empty.');
  const rec = { id, blob, track, size: blob.size, at: old.at };
  await tx('readwrite', (s) => s.put(rec));
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  const map = new Map(lib.get().downloads);
  map.set(id, { size: rec.size, at: rec.at, track });
  lib.set({ downloads: map });
  return true;
}
