// Reads title / artist / album / cover art from audio files (MP3 ID3v2, M4A/MP4, FLAC) with no libraries.

const dec = (enc, bytes) => {
  try {
    if (enc === 1) {
      const le = bytes[0] === 0xff && bytes[1] === 0xfe;
      const body = bytes[0] === 0xff || bytes[0] === 0xfe ? bytes.subarray(2) : bytes;
      return new TextDecoder(le || bytes[0] !== 0xfe ? 'utf-16le' : 'utf-16be').decode(body);
    }
    if (enc === 2) return new TextDecoder('utf-16be').decode(bytes);
    if (enc === 3) return new TextDecoder('utf-8').decode(bytes);
    return new TextDecoder('windows-1252').decode(bytes);
  } catch { return ''; }
};
const clean = (s) => s.replace(/\u0000+$/g, '').replace(/\u0000/g, ' ').trim();
const synch = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const str4 = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

function id3v2(b) {
  const out = {};
  if (b.length < 10 || String.fromCharCode(b[0], b[1], b[2]) !== 'ID3') return null;
  const ver = b[3];
  const size = synch(b, 6);
  let o = 10;
  const end = Math.min(b.length, 10 + size);
  while (o + 10 < end) {
    const id = str4(b, o);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const fs = ver === 4 ? synch(b, o + 4) : u32(b, o + 4);
    const body = b.subarray(o + 10, o + 10 + fs);
    if (fs <= 0 || o + 10 + fs > b.length) break;
    if (id === 'TIT2') out.title = clean(dec(body[0], body.subarray(1)));
    else if (id === 'TPE1') out.artist = clean(dec(body[0], body.subarray(1)));
    else if (id === 'TALB') out.album = clean(dec(body[0], body.subarray(1)));
    else if (id === 'APIC' && !out.picture) {
      const enc = body[0];
      let i = 1;
      while (i < body.length && body[i] !== 0) i++;
      const mime = String.fromCharCode(...body.subarray(1, i)) || 'image/jpeg';
      i += 2; // null + picture type
      if (enc === 1 || enc === 2) { while (i + 1 < body.length && !(body[i] === 0 && body[i + 1] === 0)) i += 2; i += 2; } else { while (i < body.length && body[i] !== 0) i++; i += 1; }
      out.picture = new Blob([body.subarray(i)], { type: mime.includes('/') ? mime : 'image/jpeg' });
    }
    o += 10 + fs;
  }
  return out;
}

function mp4(b) {
  const out = {};
  const walk = (start, end, depth) => {
    let o = start;
    while (o + 8 <= end) {
      let size = u32(b, o);
      const type = str4(b, o + 4);
      let hdr = 8;
      if (size === 1) { size = u32(b, o + 12); hdr = 16; }
      if (size < 8 || o + size > end + 8) break;
      const inner = o + hdr;
      if (['moov', 'udta', 'ilst'].includes(type)) walk(inner, o + size, depth + 1);
      else if (type === 'meta') walk(inner + 4, o + size, depth + 1);
      else if (['©nam', '©ART', '©alb', 'covr'].includes(type)) {
        // child "data" atom: 8 header + 4 type + 4 locale
        const d = inner + 16;
        const bytes = b.subarray(d, o + size);
        if (type === 'covr') out.picture = out.picture || new Blob([bytes], { type: bytes[0] === 0x89 ? 'image/png' : 'image/jpeg' });
        else { const v = clean(new TextDecoder().decode(bytes)); if (type === '©nam') out.title = v; else if (type === '©ART') out.artist = v; else out.album = v; }
      }
      o += size;
    }
  };
  walk(0, b.length, 0);
  return out;
}

function flac(b) {
  if (String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'fLaC') return null;
  const out = {};
  let o = 4;
  for (;;) {
    if (o + 4 > b.length) break;
    const last = b[o] & 0x80;
    const type = b[o] & 0x7f;
    const len = (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
    const body = b.subarray(o + 4, o + 4 + len);
    if (type === 4) {
      const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
      let p = 4 + dv.getUint32(0, true);
      const n = dv.getUint32(p, true); p += 4;
      for (let i = 0; i < n; i++) {
        const l = dv.getUint32(p, true); p += 4;
        const [k, ...rest] = new TextDecoder().decode(body.subarray(p, p + l)).split('=');
        const v = rest.join('=');
        if (/^title$/i.test(k)) out.title = v; else if (/^artist$/i.test(k)) out.artist = v; else if (/^album$/i.test(k)) out.album = v;
        p += l;
      }
    } else if (type === 6 && !out.picture) {
      const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
      let p = 4;
      const ml = dv.getUint32(p); p += 4;
      const mime = new TextDecoder().decode(body.subarray(p, p + ml)); p += ml;
      const descLen = dv.getUint32(p); p += 4 + descLen + 16; // description + width/height/depth/colours
      const dataLen = dv.getUint32(p); p += 4;
      out.picture = new Blob([body.subarray(p, p + dataLen)], { type: mime || 'image/jpeg' });
    }
    o += 4 + len;
    if (last) break;
  }
  return out;
}

/** -> { title, artist, album, picture: Blob|null, duration } */
export async function readTags(file) {
  const base = file.name.replace(/\.[^.]+$/, '');
  const guess = /^(.+?)\s+-\s+(.+)$/.exec(base);
  const result = { title: guess ? guess[2] : base, artist: guess ? guess[1] : '', album: '', picture: null, duration: 0 };
  try {
    const head = new Uint8Array(await file.slice(0, Math.min(file.size, 1.5 * 1024 * 1024)).arrayBuffer());
    const tags = id3v2(head) || flac(head) || (/\.(m4a|mp4|aac)$/i.test(file.name) ? mp4(head) : null) || {};
    if (tags.title) result.title = tags.title;
    if (tags.artist) result.artist = tags.artist;
    if (tags.album) result.album = tags.album;
    if (tags.picture) result.picture = tags.picture;
  } catch { /* filename fallback is fine */ }
  result.duration = await new Promise((resolve) => {
    const a = new Audio();
    const u = URL.createObjectURL(file);
    a.preload = 'metadata';
    a.onloadedmetadata = () => { resolve(Number.isFinite(a.duration) ? Math.round(a.duration) : 0); URL.revokeObjectURL(u); };
    a.onerror = () => { resolve(0); URL.revokeObjectURL(u); };
    a.src = u;
    setTimeout(() => resolve(0), 6000);
  });
  return result;
}
