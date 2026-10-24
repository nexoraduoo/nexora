// Lists every app file for the service worker and stamps a version, so users always get updates.
// Runs automatically before "wrangler dev" and "wrangler deploy" (see wrangler.jsonc "build").
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const skip = new Set(['sw.js', 'sw-manifest.js', '_headers', 'favicon-32.png']);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (!skip.has(relative(root, p))) files.push(p);
  }
})(root);

files.sort();
const hash = createHash('sha1');
const urls = ['/'];
for (const f of files) {
  hash.update(relative(root, f)).update(readFileSync(f));
  const u = '/' + relative(root, f).split(sep).join('/');
  urls.push(u);
}
// lang packs are loaded on demand; keep them out of the install (they cache on first use)
const precache = urls.filter((u) => !u.startsWith('/js/lang/') && !u.startsWith('/downloads/') && u !== '/install.html' && u !== '/js/install.js');
const version = hash.digest('hex').slice(0, 10);
writeFileSync(join(root, 'sw-manifest.js'), `self.__VERSION = ${JSON.stringify(version)};\nself.__PRECACHE = ${JSON.stringify(precache, null, 1)};\n`);
console.log(`service worker manifest: ${precache.length} files, version ${version}`);
