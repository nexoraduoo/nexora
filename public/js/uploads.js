// Your own music: upload to your private cloud locker, or just play files from this device.
import { readTags } from './id3.js';
import { toast } from './state.js';
import { ctl } from './ctl.js';

export const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus';

export function uploadFile(file, onProgress) {
  return readTags(file).then((tags) => new Promise((resolve, reject) => {
    const q = new URLSearchParams({ name: file.name, title: tags.title, artist: tags.artist, album: tags.album, duration: String(tags.duration || 0) });
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/uploads?${q}`);
    xhr.setRequestHeader('x-nexora', '1');
    xhr.setRequestHeader('content-type', file.type || 'audio/mpeg');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data?.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    xhr.send(file);
  }));
}

/** Play files straight from this device without uploading anything. */
export async function playLocalFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i.test(f.name));
  if (!list.length) { toast('Choose audio files (mp3, m4a, flac, wav, ogg).', { kind: 'warn' }); return; }
  const tracks = [];
  for (const f of list) {
    const tags = await readTags(f);
    tracks.push({
      id: `local:${f.name}-${f.size}`, source: 'local', kind: 'track', title: tags.title, artist: tags.artist || 'This device', album: tags.album || 'Local files',
      duration: tags.duration, artwork: tags.picture ? URL.createObjectURL(tags.picture) : null, url: URL.createObjectURL(f), preview: false, license: 'Your own file', downloadable: false,
    });
  }
  await ctl.playTracks(tracks, 0, { context: 'This device' });
  toast(`Playing ${tracks.length} file${tracks.length > 1 ? 's' : ''} from this device`, { kind: 'ok' });
}
