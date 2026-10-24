// Calls to the Nexora server.
import { app, nav } from './state.js';

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export async function api(method, path, body, { signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      signal,
      headers: { 'x-nexora': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'offline', 'You appear to be offline.');
  }
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/') && app.get().user) {
      app.set({ user: null });
      nav('/login', true);
    }
    throw new ApiError(res.status, data?.error || 'error', data?.message || `Request failed (${res.status})`);
  }
  return data;
}

export const get = (p, o) => api('GET', p, undefined, o);
export const post = (p, b = {}) => api('POST', p, b);
export const put = (p, b = {}) => api('PUT', p, b);
export const patch = (p, b = {}) => api('PATCH', p, b);
export const del = (p) => api('DELETE', p);
