// Client-side password stretching. See src/auth.js for why the server never sees the real password.

const enc = new TextEncoder();
export const KDF_ROUNDS = 600_000;

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** username + password -> 43-char key that is sent to the server instead of the password */
export async function deriveKey(username, password, rounds = KDF_ROUNDS) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('This browser blocks secure sign-in on insecure (http) pages. Open Nexora over https.');
  }
  const base = await crypto.subtle.importKey('raw', enc.encode(String(password).normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`nexora:v1:${String(username).trim().toLowerCase()}`), iterations: rounds },
    base,
    256
  );
  return b64url(new Uint8Array(bits));
}
