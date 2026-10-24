// Tiny hygiene check: lists (and with --fix removes) imported names that are never used in the same file.
//   node scripts/unused-imports.mjs [--fix]
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const fix = process.argv.includes('--fix');
let issues = 0;

(function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!/node_modules|vendor|\.tools|\.wrangler|dist|share/.test(n)) walk(p); continue; }
    if (!/\.m?js$/.test(n) || n === 'sw-manifest.js') continue;
    let src = readFileSync(p, 'utf8');
    let changed = false;
    for (const m of [...src.matchAll(/import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*(['"][^'"]+['"]);?\n?/g)]) {
      const def = m[1];
      const named = (m[2] || '').split(',').map((s) => s.trim()).filter(Boolean);
      const body = src.replace(m[0], '');
      const used = (name) => new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])|\\.\\.\\.${name}(?![\\w$])`).test(body);
      const keep = named.filter((s) => used(s.split(/\s+as\s+/).pop()));
      const dropDef = def && !used(def);
      const dropped = named.length - keep.length + (dropDef ? 1 : 0);
      if (!dropped) continue;
      issues += dropped;
      console.log(`${p.replace(root, '.')}: unused ${[...named.filter((s) => !keep.includes(s)), dropDef ? def : null].filter(Boolean).join(', ')}`);
      if (fix) {
        const parts = [def && !dropDef ? def : null, keep.length ? `{ ${keep.join(', ')} }` : null].filter(Boolean);
        const repl = parts.length ? `import ${parts.join(', ')} from ${m[3]};\n` : '';
        src = src.replace(m[0], repl);
        changed = true;
      }
    }
    if (changed) writeFileSync(p, src);
  }
})(root);
console.log(issues ? `${issues} unused import(s)${fix ? ' removed' : ' (run with --fix to remove)'}` : 'No unused imports');
