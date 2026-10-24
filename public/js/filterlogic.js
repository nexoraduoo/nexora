// The filtering rules behind the Genre / Artist / Album / Mood bars (pure functions, easy to test).
export const FIELDS = [['genre', 'Genre'], ['artist', 'Artist'], ['album', 'Album'], ['mood', 'Mood']];

/** Distinct non-empty values of one field, most common first. */
export function optionsFor(tracks, field, limit = 80) {
  const count = new Map();
  for (const tr of tracks) {
    const v = (tr[field] || '').trim();
    if (v) count.set(v, (count.get(v) || 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([v, n]) => ({ value: v, n }));
}

/** Pure filter: every chosen field must match exactly; the text matches title, artist or album. */
export function applyFilter(tracks, f) {
  const q = (f.q || '').trim().toLowerCase();
  return tracks.filter((tr) => {
    for (const [k] of FIELDS) if (f[k] && (tr[k] || '') !== f[k]) return false;
    return !q || `${tr.title} ${tr.artist} ${tr.album}`.toLowerCase().includes(q);
  });
}
