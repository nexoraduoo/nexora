// Older iPhones (iOS 15 / 16.0-16.1), older Android and older TVs do not understand color-mix() or `inset`.
// A browser drops a declaration it cannot read, so this adds a plain-colour twin right before each one:
// new browsers use the later (nicer) line, old browsers use the earlier one. Safe to run again (it skips twins already there).
//   node scripts/css-fallbacks.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public', 'css', 'app.css');
let css = readFileSync(file, 'utf8');

// the same in both themes, so a fixed rgba() is exact
const STATIC = { '--accent': [139, 108, 255], '--accent-2': [0, 212, 255], '--danger': [255, 93, 108], '--ok': [61, 220, 151], '--warn': [255, 180, 84] };
const SOLID = new Set(['--bg', '--bg-2', '--surface', '--surface-2']); // theme-dependent: keep the variable

function fallbackValue(value) {
  // color-mix(in srgb, COLOR P%, REST)  ->  rgba(COLOR, P)  (or a solid variable for the nearly-opaque panel backgrounds)
  let out = '', i = 0;
  while (i < value.length) {
    const at = value.indexOf('color-mix(', i);
    if (at < 0) { out += value.slice(i); break; }
    out += value.slice(i, at);
    let depth = 0, j = at + 9;
    for (; j < value.length; j++) { if (value[j] === '(') depth++; else if (value[j] === ')') { depth--; if (!depth) break; } }
    const inner = value.slice(at + 10, j);
    const m = inner.match(/^in srgb,\s*(var\((--[a-z0-9-]+)\)|currentColor)\s+(\d+)%/);
    let rep = 'transparent';
    if (m) {
      const [, , name, pct] = m;
      if (name && STATIC[name]) rep = `rgba(${STATIC[name].join(',')},${(pct / 100).toFixed(2)})`;
      else if (name && SOLID.has(name) && Number(pct) >= 90) rep = `var(${name})`;
    }
    out += rep;
    i = j + 1;
  }
  return out;
}

function twinFor(prop, value) {
  if (/color-mix\(/.test(value)) return `${prop}: ${fallbackValue(value)};`;
  if (prop === 'backdrop-filter') return `-webkit-backdrop-filter: ${value.trim()};`; // Safari up to 17 only knows the prefixed name
  if (prop === 'inset') {
    const v = value.trim();
    if (v === '0') return 'top: 0; right: 0; bottom: 0; left: 0;';
    const m = v.match(/^(-?\d+px)$/);
    if (m) return `top: ${m[1]}; right: ${m[1]}; bottom: ${m[1]}; left: ${m[1]};`;
  }
  return null;
}

// walk declarations: a declaration starts after "{" or ";" and ends at ";" or "}" outside parentheses
let out = '', pos = 0, added = 0;
const re = /[{;]\s*/g;
let m;
while ((m = re.exec(css))) {
  const start = m.index + m[0].length;
  if (start < pos) continue;
  // find the end of this declaration
  let depth = 0, k = start;
  for (; k < css.length; k++) {
    const c = css[k];
    if (c === '(') depth++; else if (c === ')') depth--;
    else if (!depth && (c === ';' || c === '}' || c === '{')) break;
  }
  if (css[k] === '{') continue; // a selector, not a declaration
  const decl = css.slice(start, k);
  const dm = decl.match(/^([a-z-]+)\s*:\s*([\s\S]+)$/);
  if (!dm) continue;
  const twin = twinFor(dm[1], dm[2]);
  if (!twin) continue;
  const before = css.slice(Math.max(0, start - twin.length - 2), start);
  if (before.includes(twin)) continue; // already has its twin
  out += css.slice(pos, start) + twin + ' ';
  pos = start;
  added++;
}
out += css.slice(pos);
if (process.argv.includes('--check')) { console.log(added ? `${added} declaration(s) are missing an old-browser twin: run node scripts/css-fallbacks.mjs` : 'all declarations have their twins'); process.exit(added ? 1 : 0); }
writeFileSync(file, out);
console.log(`${added} fallback declaration(s) added`);
