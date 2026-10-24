// Runs before first paint: applies the saved theme and TV/large-text mode so the page never flashes.
(function () {
  try {
    var theme = localStorage.getItem('nx.theme') || 'dark';
    if (theme === 'system') theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f5f5fa' : '#0b0b12');
    var tvPref = localStorage.getItem('nx.tv');
    if (tvPref === '1' || (tvPref === null && /Tizen|Web0S|webOS|SMART-TV|SmartTV|BRAVIA|AFTB|AFTT|AFTM|AFTS|AFTN|AFTK|Android TV|GoogleTV|CrKey|HbbTV|NetCast|VIDAA|Hisense|PHILIPS-AOC/i.test(navigator.userAgent))) document.documentElement.classList.add('tv');
    var lang = localStorage.getItem('nx.lang');
    if (lang) {
      document.documentElement.lang = lang;
      if (/^(ar|he|fa|ur)/.test(lang)) document.documentElement.dir = 'rtl';
    }
  } catch (e) { /* storage blocked: defaults are fine */ }
})();

// A browser that is too old for the app gets a clear message instead of a stuck splash screen.
// (No eval here: the page's security policy forbids it. A script that fails to parse fires "error" on its tag.)
(function () {
  function show() {
    var el = document.getElementById('app');
    if (el && !document.querySelector('.app')) el.innerHTML = '<div style="padding:2rem;max-width:30rem;margin:12vh auto;font:16px/1.5 sans-serif;color:#f4f4fa;text-align:center"><h2>Please update your browser</h2><p>Nexora needs a newer browser than this one. Chrome, Edge, Firefox or Safari from the last few years all work (iPhone: iOS 15 or newer; Android: Chrome; TV: a 2021 or newer model, or watch on your phone and use Connect to play on the TV).</p></div>';
  }
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'SCRIPT' && /app\.js/.test(t.src || '')) show();
  }, true);
  if (!window.Promise || !window.fetch || !('noModule' in HTMLScriptElement.prototype)) document.addEventListener('DOMContentLoaded', show);
})();

// Safety net: if the app has not appeared after a long wait (a half-updated cache, a very slow network), say so and offer a reset.
setTimeout(function () {
  var el = document.getElementById('app');
  if (!el || !el.querySelector('.splash')) return;
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:0;right:0;bottom:8vh;text-align:center;font:16px/1.5 sans-serif;color:#f4f4fa;padding:0 1.5rem';
  box.innerHTML = '<p>Nexora is taking longer than usual to start.</p>';
  function btn(label, fn) {
    var b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'margin:6px;padding:12px 22px;border:0;border-radius:999px;font:600 15px sans-serif;color:#fff;background:#7c5cff;cursor:pointer';
    b.addEventListener('click', fn);
    box.appendChild(b);
  }
  btn('Reload', function () { location.reload(); });
  btn('Reset the app and reload', function () {
    var jobs = [];
    try { if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); })); } catch (e) { /* ignore */ }
    try { if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })); } catch (e) { /* ignore */ }
    Promise.all(jobs).then(function () { location.reload(); }, function () { location.reload(); });
  });
  el.appendChild(box);
}, 15000);
