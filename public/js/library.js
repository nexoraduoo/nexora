// Library data (likes, playlists, saved items, history) with optimistic updates.
import { lib, app, toast } from './state.js';
import { get, put, del, post, patch } from './api.js';
import { slim } from './player.js';

export async function loadLibrary() {
  const [likes, pls, items, hist, people] = await Promise.all([
    get('/api/likes').catch(() => ({ tracks: [] })),
    get('/api/playlists').catch(() => ({ playlists: [] })),
    get('/api/library').catch(() => ({ albums: [], artists: [], stations: [], podcasts: [] })),
    get('/api/history?limit=40').catch(() => ({ tracks: [] })),
    get('/api/people').catch(() => ({ people: [] })),
  ]);
  lib.set({
    loaded: true,
    liked: likes.tracks,
    likedIds: new Set(likes.tracks.map((t) => t.id)),
    playlists: pls.playlists,
    albums: items.albums, artists: items.artists, stations: items.stations, podcasts: items.podcasts || [],
    history: hist.tracks,
    people: people.people,
  });
}

export const refreshPlaylists = async () => lib.set({ playlists: (await get('/api/playlists')).playlists });
export const refreshPeople = async () => lib.set({ people: (await get('/api/people')).people });

export const isLiked = (id) => lib.get().likedIds.has(id);

export async function toggleLike(track) {
  const { likedIds, liked } = lib.get();
  const was = likedIds.has(track.id);
  const ids = new Set(likedIds);
  if (was) { ids.delete(track.id); lib.set({ likedIds: ids, liked: liked.filter((t) => t.id !== track.id) }); }
  else { ids.add(track.id); lib.set({ likedIds: ids, liked: [track, ...liked] }); }
  try {
    if (was) await del(`/api/likes/${encodeURIComponent(track.id)}`);
    else await put('/api/likes', { track: slim(track) });
    toast(was ? 'Removed from Liked Songs' : 'Added to Liked Songs', { kind: 'ok', ms: 1800 });
  } catch (e) {
    lib.set({ likedIds, liked });
    toast(e.message, { kind: 'error' });
  }
}

export async function createPlaylist(name, tracks = []) {
  const r = await post('/api/playlists', { name, tracks: tracks.map(slim) });
  await refreshPlaylists();
  return r.id;
}

export async function addToPlaylist(playlistId, tracks, token) {
  const list = Array.isArray(tracks) ? tracks : [tracks];
  const r = await post(`/api/playlists/${playlistId}/tracks`, { tracks: list.map(slim), token });
  await refreshPlaylists();
  return r;
}

export async function saveItem(kind, item) {
  const key = { album: 'albums', artist: 'artists', station: 'stations', podcast: 'podcasts' }[kind];
  const cur = lib.get()[key];
  const ref = item.ref || item.id;
  if (cur.some((x) => x.ref === ref)) {
    lib.set({ [key]: cur.filter((x) => x.ref !== ref) });
    await del(`/api/library/${kind}/${encodeURIComponent(ref)}`).catch(() => {});
    toast('Removed from your library', { ms: 1800 });
    return false;
  }
  const entry = { ref, title: item.title, artist: item.artist, artwork: item.artwork, source: item.source, url: item.url };
  lib.set({ [key]: [entry, ...cur] });
  await put(`/api/library/${kind}`, entry).catch((e) => toast(e.message, { kind: 'error' }));
  toast('Saved to your library', { kind: 'ok', ms: 1800 });
  return true;
}

export const isSaved = (kind, ref) => {
  const key = { album: 'albums', artist: 'artists', station: 'stations', podcast: 'podcasts' }[kind];
  return lib.get()[key].some((x) => x.ref === ref);
};

export async function follow(person) {
  const on = !person.following;
  lib.set((s) => ({ people: s.people.map((p) => (p.id === person.id ? { ...p, following: on } : p)) }));
  try { await (on ? put : del)(`/api/follow/${person.id}`); } catch (e) { toast(e.message, { kind: 'error' }); refreshPeople(); }
}

export { patch };
export const me = () => app.get().user;
