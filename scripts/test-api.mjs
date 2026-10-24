// Runs the full API suite against a throwaway server (own port, own empty database).
//   npm run test:api
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const state = mkdtempSync(join(tmpdir(), 'nexora-test-'));
const port = 8799;
const run = (args, opts = {}) => spawnSync(process.execPath, [wrangler, ...args], { cwd: root, encoding: 'utf8', ...opts });

console.log('Preparing an empty test database...');
const mig = run(['d1', 'migrations', 'apply', 'nexora', '--local', '--persist-to', state]);
if (mig.status !== 0) { console.error(mig.stdout, mig.stderr); process.exit(1); }

console.log(`Starting a test server on :${port}...`);
const testSecret = 'test-only-secret-not-used-anywhere-else-0123456789';
const server = spawn(process.execPath, [wrangler, 'dev', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', state, '--var', `AUTH_SECRET:${testSecret}`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (d) => { log += d; });
server.stderr.on('data', (d) => { log += d; });

const stop = () => {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F']);
    else server.kill('SIGTERM');
  } catch { /* already gone */ }
  setTimeout(() => { try { rmSync(state, { recursive: true, force: true }); } catch { /* files may still be locked on Windows */ } }, 1500);
};

let ready = false;
for (let i = 0; i < 90 && !ready; i++) {
  try { ready = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok; } catch { /* not up yet */ }
  if (!ready) await new Promise((r) => setTimeout(r, 1000));
}
if (!ready) { console.error('Server did not start:\n', log.slice(-2000)); stop(); process.exit(1); }

const t = spawnSync(process.execPath, [join(root, 'tests', 'smoke.mjs')], { cwd: root, stdio: 'inherit', env: { ...process.env, BASE: `http://127.0.0.1:${port}` } });
stop();
process.exit(t.status ?? 1);
