// Keeping saved music current. A recording keeps its id (and ISRC) when its audio is replaced, and its revision
// number goes up. This module asks the server which revision is live and refreshes what this device kept:
//   - downloaded songs are downloaded again when a newer revision exists (or removed if the recording was withdrawn)
//   - the saved queue gets the current audio address
// It runs when the app opens and at most every 6 hours afterwards, like a streaming app's cache check.
import { app, lib, player, local, toast } from './state.js';
import { get } from './api.js';
import * as offline from './offline.js';

const EVERY = 6 * 3600 * 1000;
const KEY = 'nx.assetCheck';
const CATALOGUE = /^(audius|jamendo|ia|ccmixter):/;

/** id -> { rev, url, duration, gone } for up to 100 ids per request. */
export async function fetchAssets(ids) {
  const out = {};
  const list = [...new Set(ids)].filter((id) => CATALOGUE.test(id));
  for (let i = 0; i < list.length; i += 100) {
    const r = await get(`/api/tracks/assets?ids=${encodeURIComponent(list.slice(i, i + 100).join(','))}`);
    Object.assign(out, r.assets);
  }
  return out;
}

/** Re-download every saved song whose revision on the server is newer. Returns { updated, removed }. */
export async function refreshDownloads() {
  const saved = [...lib.get().downloads.values()].map((d) => d.track);
  const assets = await fetchAssets(saved.map((t) => t.id));
  let updated = 0, removed = 0;
  for (const t of saved) {
    const a = assets[t.id];
    if (!a) continue;
    if (a.gone) { await offline.remove(t.id); removed++; continue; }
    if ((a.rev || 1) > (t.rev || 1) && a.url) {
      try {
        if (await offline.replace(t.id, { ...t, url: a.url, duration: a.duration || t.duration, rev: a.rev })) updated++;
      } catch { /* keep the old copy; try again next time */ }
    }
  }
  if (updated) toast(`Updated ${updated} downloaded song${updated === 1 ? '' : 's'} to the latest version.`, { kind: 'ok' });
  if (removed) toast(`${removed} downloaded song${removed === 1 ? ' was' : 's were'} removed: withdrawn by the rights holder.`, { kind: 'warn' });
  return { updated, removed };
}

/** Give the saved queue the current audio addresses (the song playing right now is left alone). */
export async function freshenQueue() {
  const { queue, index } = player.get();
  if (!queue.length) return;
  const assets = await fetchAssets(queue.map((t) => t.id));
  let changed = false;
  const next = queue.map((t, i) => {
    const a = assets[t.id];
    if (!a || i === index || (a.rev || 1) <= (t.rev || 1) || !a.url) return t;
    changed = true;
    return { ...t, url: a.url, duration: a.duration || t.duration, rev: a.rev };
  });
  if (changed) player.set({ queue: next });
}

/** Run both checks if it has been a while. Safe to call often. */
export async function checkOnce({ force = false } = {}) {
  if (!app.get().user || !app.get().online) return;
  const last = Number(local.read(KEY, '0')) || 0;
  if (!force && Date.now() - last < EVERY) return;
  local.write(KEY, String(Date.now()));
  try { await freshenQueue(); await refreshDownloads(); } catch { /* offline or server busy: next time */ }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) checkOnce(); });
