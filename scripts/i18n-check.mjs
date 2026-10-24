// Lists every UI string that goes through t(), and reports which are missing in each language pack.
//   node scripts/i18n-check.mjs            -> summary
//   node scripts/i18n-check.mjs --list     -> all English strings (handy when adding a language)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public', 'js');
const found = new Set();
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!/vendor|lang|shared/.test(name)) walk(p); continue; }
    if (!p.endsWith('.js')) continue;
    const src = readFileSync(p, 'utf8');
    for (const re of [/\bt\('((?:[^'\\]|\\.)*)'/g, /\bt\("((?:[^"\\]|\\.)*)"/g]) {
      for (const m of src.matchAll(re)) found.add(m[1].replace(/\\'/g, "'"));
    }
  }
})(root);

const strings = [...found].sort();
if (process.argv.includes('--list')) { console.log(JSON.stringify(strings, null, 1)); process.exit(0); }

console.log(`${strings.length} UI strings in use`);
const langDir = join(root, 'lang');
if (existsSync(langDir)) {
  for (const f of readdirSync(langDir).filter((n) => n.endsWith('.js'))) {
    const dict = (await import(pathToFileURL(join(langDir, f)).href)).default;
    const missing = strings.filter((s) => !(s in dict));
    const extra = Object.keys(dict).filter((k) => !found.has(k));
    console.log(`${f.padEnd(8)} ${strings.length - missing.length}/${strings.length} translated${extra.length ? `, ${extra.length} unused keys` : ''}`);
    if (process.argv.includes('--missing') && missing.length) console.log('  missing:', missing.join(' | '));
  }
}
