// Old iPhones / TVs drop CSS they cannot read (color-mix, inset). Every such line must have a plain twin before it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('every color-mix() / inset declaration has an old-browser twin (run scripts/css-fallbacks.mjs to add them)', () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/css-fallbacks.mjs', import.meta.url)), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
