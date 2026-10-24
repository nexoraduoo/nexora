// Tiny router: routes are [METHOD, "/api/path/:param", handler, { auth: true|false }].

export function compile(list) {
  return list.map(([method, path, handler, opts = {}]) => {
    const keys = [];
    const re = new RegExp(
      '^' + path.replace(/:([a-zA-Z]+)\*?/g, (m, k) => { keys.push(k); return m.endsWith('*') ? '(.+)' : '([^/]+)'; }) + '/?$'
    );
    return { method, re, keys, handler, auth: opts.auth !== false };
  });
}

export function match(table, method, pathname) {
  for (const r of table) {
    if (r.method !== method) continue;
    const m = r.re.exec(pathname);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    return { route: r, params };
  }
  return null;
}
