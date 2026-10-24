// Filter any list of songs by genre, artist, album or mood (plus a quick text filter).
// Usage:  <${FilteredList} tracks=${tracks}>${(shown) => html`<${TrackList} tracks=${shown} />`}<//>
import { html, useState, useMemo } from '../lib.js';
import { t } from '../i18n.js';
import { FIELDS, optionsFor, applyFilter } from '../filterlogic.js';

const MIN_TRACKS = 6; // below this, filtering is just noise

export function FilteredList({ tracks, children }) {
  const [f, setF] = useState({});
  const opts = useMemo(() => Object.fromEntries(FIELDS.map(([k]) => [k, optionsFor(tracks, k)])), [tracks]);
  const shown = useMemo(() => applyFilter(tracks, f), [tracks, f]);
  const render = typeof children === 'function' ? children : children?.[0];
  if (tracks.length < MIN_TRACKS) return render(tracks);
  const active = Object.values(f).some(Boolean);
  const set = (k, v) => setF({ ...f, [k]: v });
  return html`<div>
    <div class="filter-bar">
      <input class="input sm" type="search" placeholder=${t('Filter these songs…')} value=${f.q || ''} onInput=${(e) => set('q', e.target.value)} />
      ${FIELDS.filter(([k]) => opts[k].length > 1).map(([k, label]) => html`
        <select class="select sm" aria-label=${t(label)} value=${f[k] || ''} onChange=${(e) => set(k, e.target.value)}>
          <option value="">${t(label)}: ${t('All')}</option>
          ${opts[k].map((o) => html`<option value=${o.value}>${o.value} (${o.n})</option>`)}
        </select>`)}
      ${active ? html`<button class="btn sm ghost" onClick=${() => setF({})}>${t('Clear')}</button>` : null}
    </div>
    ${active ? html`<p class="muted tiny pad-x">${shown.length} / ${tracks.length}</p>` : null}
    ${shown.length ? render(shown) : html`<p class="muted pad-x">${t('Nothing matches these filters.')}</p>`}
  </div>`;
}
