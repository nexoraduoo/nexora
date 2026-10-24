// Packs the project into one neat zip you can send to anyone (no huge folders, no secrets).
//   node scripts/pack.mjs   ->  ../nexora-share.zip
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { join, relative, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
mkdirSync(join(root, 'share'), { recursive: true });
const out = join(root, 'share', 'nexora-share.zip');
const SKIP_DIRS = new Set(['node_modules', '.tools', '.wrangler', '.git', 'dist', 'share']);
const SKIP_FILES = new Set(['.dev.vars', 'wrangler.deploy.jsonc', 'MY-NEXORA-ADDRESS.txt']);

const files = [];
(function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(n)) walk(p); } else if (!SKIP_FILES.has(n) && !n.endsWith('.log')) files.push({ p, st });
  }
})(root);

const table = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = table[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const dos = (d) => ({ time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() });

const chunks = [], central = [];
let offset = 0;
for (const { p, st } of files) {
  const name = Buffer.from(`nexora/${relative(root, p).split(sep).join('/')}`);
  const data = readFileSync(p);
  const comp = deflateRawSync(data, { level: 9 });
  const { time, date } = dos(st.mtime);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
  local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  chunks.push(local, name, comp);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8); cd.writeUInt16LE(8, 10);
  cd.writeUInt16LE(time, 12); cd.writeUInt16LE(date, 14); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(0x81a40000, 38); cd.writeUInt32LE(offset, 42);
  central.push(cd, name);
  offset += local.length + name.length + comp.length;
}
const cdBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
writeFileSync(out, Buffer.concat([...chunks, cdBuf, end]));
console.log(`Packed ${files.length} files -> ${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`);
console.log(`Send "${basename(out)}" to a friend who wants to run their own copy. For your circle you do not need to send anything: share the web address.`);
