// Guided, free deployment to Cloudflare (Workers + D1 + Durable Objects, optional R2 / AI).
//   node scripts/deploy.mjs            interactive
//   node scripts/deploy.mjs --dry-run  build + validate only (no account needed)
//   node scripts/deploy.mjs --yes      accept defaults (no R2, no AI)
//   node scripts/deploy.mjs --domain=music.example.com   also serve it on your own domain (the domain must be on your Cloudflare account)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const wranglerJs = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const CFG = join(root, 'wrangler.deploy.jsonc');
const dry = process.argv.includes('--dry-run');
const yes = process.argv.includes('--yes');
// a custom domain: given now, or remembered from last time in MY-NEXORA-DOMAIN.txt
const DOMAIN_FILE = join(root, 'MY-NEXORA-DOMAIN.txt');
const domainArg = (process.argv.find((a) => a.startsWith('--domain=')) || '').slice(9).trim().toLowerCase();
const domain = domainArg || (existsSync(DOMAIN_FILE) ? readFileSync(DOMAIN_FILE, 'utf8').trim().toLowerCase() : '');
if (domain && !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) { console.log(`"${domain}" does not look like a domain name (example: music.example.com).`); process.exit(1); }

const say = (m = '') => console.log(m);
const step = (n, m) => say(`\n[${n}] ${m}`);
const wr = (args, { input, inherit = false } = {}) =>
  spawnSync(process.execPath, [wranglerJs, ...args], { cwd: root, encoding: 'utf8', input, stdio: inherit ? ['pipe', 'inherit', 'inherit'] : 'pipe', maxBuffer: 20 * 1024 * 1024 });

/** JSON with comments -> object (comments inside strings, like URLs, are left alone) */
function parseJsonc(text) {
  let out = '', i = 0, str = false;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (str) { out += c; if (c === '\\') { out += n; i += 2; continue; } if (c === '"') str = false; i++; continue; }
    if (c === '"') { str = true; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q, def = '') => {
  if (yes) return def;
  const a = (await rl.question(`${q}${def ? ` [${def}]` : ''} `)).trim();
  return a || def;
};
const askYN = async (q, def = false) => /^y/i.test(await ask(`${q} (y/n)`, def ? 'y' : 'n'));

say('\n  NEXORA deploy: free hosting on Cloudflare\n  -----------------------------------------');

if (!existsSync(wranglerJs)) {
  step(0, 'Installing components (one time)...');
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) { say('npm install failed. Is Node.js installed? See README.'); process.exit(1); }
}

const base = parseJsonc(readFileSync(join(root, 'wrangler.jsonc'), 'utf8'));

// ---------------------------------------------------------------- dry run: just prove the bundle builds
if (dry) {
  step(1, 'Dry run: building the Worker bundle...');
  writeFileSync(CFG, JSON.stringify(base, null, 2));
  const r = wr(['deploy', '--dry-run', '--outdir', join(root, 'dist'), '-c', CFG]);
  say(r.stdout + r.stderr);
  process.exit(r.status ?? 1);
}

// ---------------------------------------------------------------- 1. account
step(1, 'Checking your Cloudflare login...');
let who = wr(['whoami']);
if (!/logged in|associated with the email/i.test(who.stdout + who.stderr)) {
  say('A browser window will open. Sign in (or create a free Cloudflare account, no card needed) and click "Allow".');
  const l = wr(['login'], { inherit: true });
  if (l.status !== 0) { say('Login did not finish. Run the deploy again when ready.'); process.exit(1); }
  who = wr(['whoami']);
}
say((who.stdout.match(/associated with the email ([^\s]+)/) || [])[0] || 'Logged in.');

// ---------------------------------------------------------------- 2. choices
step(2, 'A few quick questions (press Enter for the recommended answer)');
const name = (await ask('Name for your app (becomes part of the web address; letters/numbers/dashes):', 'nexora')).toLowerCase().replace(/[^a-z0-9-]/g, '') || 'nexora';
say('\nCloud locker = a private place to upload music files you own, synced to all your devices.\nIt uses Cloudflare R2 (10 GB free). Cloudflare may ask you to add a card to switch R2 on; it is not charged within the free limits.');
const wantR2 = await askYN('Switch on the cloud locker?', false);
say('\nAI tagging = a small free AI labels the language and mood of songs the catalogue agent finds (uses your free daily AI allowance).');
const wantAI = await askYN('Switch on AI tagging?', false);
const mode = await ask('Who can sign up? "approval" (anyone can ask, you approve each one), "invite" (friends need your link) or "open":', 'approval');

// ---------------------------------------------------------------- 3. database
step(3, 'Setting up your database...');
let dbId = null;
const list = wr(['d1', 'list', '--json']);
try { dbId = JSON.parse(list.stdout).find((d) => d.name === 'nexora')?.uuid || null; } catch { /* parse below */ }
if (!dbId) {
  const c = wr(['d1', 'create', 'nexora']);
  const out = c.stdout + c.stderr;
  dbId = (out.match(/"?database_id"?\s*[:=]\s*"([0-9a-f-]{36})"/i) || [])[1];
  if (!dbId) {
    try { dbId = JSON.parse(wr(['d1', 'list', '--json']).stdout).find((d) => d.name === 'nexora')?.uuid; } catch { /* handled below */ }
  }
  if (!dbId) { say(`Could not create the database:\n${out}`); process.exit(1); }
  say('Database created.');
} else say('Database already exists, reusing it.');

// ---------------------------------------------------------------- 4. write the deploy config
const cfg = { ...base, name, vars: { ...base.vars, SIGNUP_MODE: mode === 'open' ? 'open' : mode === 'invite' ? 'invite' : 'approval' } };
cfg.d1_databases = [{ ...base.d1_databases[0], database_id: dbId }];
if (wantR2) {
  const r = wr(['r2', 'bucket', 'create', 'nexora-files']);
  const out = r.stdout + r.stderr;
  if (r.status !== 0 && !/already exists/i.test(out)) {
    say(`R2 could not be enabled:\n${out}\nContinuing without the cloud locker (you can re-run this later).`);
    delete cfg.r2_buckets;
  }
} else delete cfg.r2_buckets;
if (wantAI) cfg.ai = { binding: 'AI' };
if (domain) cfg.routes = [{ pattern: domain, custom_domain: true }]; // Cloudflare creates the DNS record and the https certificate
writeFileSync(CFG, JSON.stringify(cfg, null, 2));

step(4, 'Creating tables in the cloud database...');
const mig = wr(['d1', 'migrations', 'apply', 'nexora', '--remote', '-c', CFG], { input: 'y\n', inherit: true });
if (mig.status !== 0) { say('Database setup failed. Scroll up for the reason.'); process.exit(1); }

// ---------------------------------------------------------------- 5. deploy
step(5, 'Publishing Nexora...');
const deployOut = await new Promise((resolve) => {
  const p = spawn(process.execPath, [wranglerJs, 'deploy', '-c', CFG], { cwd: root, stdio: ['inherit', 'pipe', 'pipe'] });
  let buf = '';
  const tee = (d) => { buf += d; process.stdout.write(d); };
  p.stdout.on('data', tee); p.stderr.on('data', tee);
  p.on('close', (code) => resolve({ code, buf }));
});
if (deployOut.code !== 0) { say('\nPublishing failed. Scroll up for the reason.'); process.exit(1); }
const url = (deployOut.buf.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i) || [])[0];

// ---------------------------------------------------------------- 6. secret (needs the Worker to exist)
step(6, 'Locking it with a private secret...');
const have = wr(['secret', 'list', '-c', CFG, '--format', 'json']);
if (/AUTH_SECRET/.test(have.stdout)) say('A secret already exists, keeping it (so nobody gets signed out).');
else {
  const put = wr(['secret', 'put', 'AUTH_SECRET', '-c', CFG], { input: randomBytes(48).toString('base64url') });
  if (put.status !== 0) { say(`Could not store the secret:\n${put.stdout}${put.stderr}`); process.exit(1); }
  say('Secret stored.');
}

rl.close();
say(`\n  [OK] Nexora is live${url ? `: ${url}` : ''}\n`);
say('  Next:');
say(`   1. Open ${url || 'the address above'}  and create the first account. That account is the OWNER.`);
say('   2. Settings -> Invite friends -> copy the invite link -> send it on WhatsApp / Telegram.');
say('   3. On every device, open the address and use "Install app" (see Settings -> Install).');
say('   4. Owner console -> "Run now" fills the catalogue (it also runs by itself every 2 minutes).');
say(`   5. Send friends ONE link: ${domain ? `https://${domain}` : (url || 'your address')}/install  (it shows the right install button for their device).\n`);
if (domain) { writeFileSync(DOMAIN_FILE, `${domain}\n`); say(`   Your own domain: https://${domain} (the certificate can take a few minutes to appear).\n`); }
if (url) writeFileSync(join(root, 'MY-NEXORA-ADDRESS.txt'), `${url}\n`);
process.exit(0);
