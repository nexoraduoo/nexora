// One-command local run: prepares secrets + database, starts Nexora, opens your browser.
//   node scripts/dev.mjs        (or double-click start-nexora.cmd / .command / .sh)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const port = Number(process.env.PORT || 8787);

if (!existsSync(wrangler)) {
  console.error('Components are not installed yet. Run "npm install" first (the start scripts do this for you).');
  process.exit(1);
}

// a private secret for this machine, created once
const vars = join(root, '.dev.vars');
if (!existsSync(vars) || !/AUTH_SECRET=.{24,}/.test(readFileSync(vars, 'utf8'))) {
  writeFileSync(vars, `AUTH_SECRET=${randomBytes(36).toString('base64url')}\n`);
  console.log('Created a private secret for this computer (.dev.vars).');
}

console.log('Preparing the local database...');
const mig = spawnSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'nexora', '--local'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
if (mig.status !== 0) { console.error('Could not prepare the database.'); process.exit(1); }

console.log(`\nStarting Nexora at http://localhost:${port}\n(first account you create becomes the owner; press Ctrl+C to stop)\n`);
const server = spawn(process.execPath, [wrangler, 'dev', '--port', String(port), '--ip', '127.0.0.1'], { cwd: root, stdio: 'inherit' });

(async () => {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  const url = `http://localhost:${port}`;
  if (process.env.NEXORA_NO_OPEN) return;
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref(); } catch { /* open it yourself */ }
})();

const quit = () => { try { server.kill(); } catch { /* ignore */ } process.exit(0); };
process.on('SIGINT', quit);
process.on('SIGTERM', quit);
server.on('exit', (c) => process.exit(c ?? 0));
