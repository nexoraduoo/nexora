// Generates Nexora's app icons (PNG + SVG) with no dependencies: a tiny signed-distance-field rasteriser.
//   node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

// The mark: an "N" built from two bars and a slanted bar, plus an orbiting note dot.
// Coordinates are in a 100x100 box.
const A = [30, 27], B = [30, 73], C = [70, 27], D = [70, 73]; // N corners
const R = 7.5; // bar radius
const DOT = { c: [85, 17], r: 5 };

const C1 = [124, 92, 255]; // violet
const C2 = [0, 212, 255]; // cyan
const C3 = [255, 92, 170]; // pink

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function sdSeg(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h);
}
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r, qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function render(size, { maskable = false, rounded = true } = {}) {
  const px = new Uint8Array(size * size * 4);
  const SS = 3; // supersampling
  // maskable icons keep the mark inside the central 80% safe zone
  const scale = maskable ? 0.78 : 0.94;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size) * 100;
          const v = ((y + (sy + 0.5) / SS) / size) * 100;
          // background
          let bgA = 1;
          if (rounded && !maskable) bgA = sdRoundRect(u, v, 50, 50, 50, 50, 22) < 0 ? 1 : 0;
          if (!bgA) continue;
          const t = (u + v) / 200;
          let col = t < 0.55 ? mix(C1, C2, t / 0.55) : mix(C2, C3, (t - 0.55) / 0.45);
          col = mix(col, [11, 11, 18], 0.12); // slight depth
          // mark (scaled about the centre)
          const mu = (u - 50) / scale + 50, mv = (v - 50) / scale + 50;
          const d = Math.min(
            sdSeg(mu, mv, ...A, ...B) - R,
            sdSeg(mu, mv, ...C, ...D) - R,
            sdSeg(mu, mv, ...A, ...D) - R,
            Math.hypot(mu - DOT.c[0], mv - DOT.c[1]) - DOT.r
          );
          const cover = Math.max(0, Math.min(1, 0.5 - d * (size / 100) * scale));
          col = mix(col, [255, 255, 255], cover);
          r += col[0]; g += col[1]; b += col[2]; a += 1;
        }
      }
      const n = SS * SS, i = (y * size + x) * 4;
      if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; px[i + 3] = (a / n) * 255; }
    }
  }
  return px;
}

// ---- minimal PNG writer
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const files = {
  'icon-192.png': png(192, render(192)),
  'icon-512.png': png(512, render(512)),
  'icon-maskable-512.png': png(512, render(512, { maskable: true })),
  'apple-touch-icon.png': png(180, render(180, { maskable: true })), // iOS rounds the corners itself
  'favicon-32.png': png(32, render(32)),
};
for (const [name, buf] of Object.entries(files)) writeFileSync(join(out, name), buf);

// SVG version of the same mark (used as favicon + in the UI)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgb(${C1})"/><stop offset=".55" stop-color="rgb(${C2})"/><stop offset="1" stop-color="rgb(${C3})"/></linearGradient></defs>
  <rect width="100" height="100" rx="22" fill="url(#g)"/>
  <g stroke="#fff" stroke-width="${R * 2 * 0.94}" stroke-linecap="round" fill="none" transform="translate(50 50) scale(.94) translate(-50 -50)">
    <path d="M${A} L${B} M${C} L${D} M${A} L${D}"/>
  </g>
  <circle cx="${50 + (DOT.c[0] - 50) * 0.94}" cy="${50 + (DOT.c[1] - 50) * 0.94}" r="${DOT.r * 0.94}" fill="#fff"/>
</svg>
`;
writeFileSync(join(out, 'icon.svg'), svg);
console.log('icons written to', out);
