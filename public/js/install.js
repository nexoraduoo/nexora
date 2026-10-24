// The install page (/install): works out the device, shows the one right button, and a link to share.
(function () {
  var ua = navigator.userAgent || '';
  var touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  var os = /Tizen|Web0S|webOS|SMART-TV|SmartTV|BRAVIA|AFTB|AFTT|AFTM|AFTS|Android TV|GoogleTV|HbbTV|NetCast|VIDAA|Hisense|PHILIPS-AOC/i.test(ua) ? 'tv'
    : /iPhone|iPad|iPod/.test(ua) || touchMac ? 'ios'
      : /Android/i.test(ua) ? 'android'
        : /Windows/i.test(ua) ? 'windows'
          : /Mac OS X|Macintosh/i.test(ua) ? 'mac'
            : /Linux|X11|CrOS/i.test(ua) ? 'linux' : 'other';
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/.test(ua);
  var names = { android: 'an Android device', ios: 'an iPhone or iPad', windows: 'a Windows computer', mac: 'a Mac', linux: 'a Linux computer', tv: 'a TV', other: 'this device' };

  var primary = document.getElementById('primary');
  var detected = document.getElementById('detected');
  var deferred = null;

  function card(title, body) { primary.innerHTML = '<h2></h2>' + body; primary.firstChild.textContent = title; primary.hidden = false; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function render() {
    detected.textContent = standalone ? 'Nexora is already installed on this device.' : 'You are on ' + names[os] + '. Here is the quickest way:';
    if (standalone) { card('All set', '<p>You are using the installed app.</p><a class="btn" href="/">Open Nexora</a>'); return; }
    if (os === 'windows') {
      card('Install on Windows', '<p>One small file. No admin rights, no setup wizard.</p><a class="btn" href="/downloads/Nexora-Setup.exe" download>Download Nexora-Setup.exe</a>'
        + '<p class="tiny">Open it. If Windows says "protected your PC": <b>More info → Run anyway</b>.</p>'
        + (deferred ? '<button class="btn ghost" id="pwa">Or install from this browser</button>' : ''));
    } else if (os === 'android') {
      card('Install on Android', deferred
        ? '<p>One tap. Nexora gets its own icon and keeps playing with the screen off.</p><button class="btn" id="pwa">Install Nexora</button>'
        : '<ol><li>Open this page in <b>Chrome</b>.</li><li>Tap the menu <b>⋮</b> → <b>Install app</b> (or <b>Add to Home screen</b>).</li></ol><p class="tiny">The big Install button appears here as soon as Chrome allows it.</p>');
    } else if (os === 'ios') {
      card('Install on iPhone / iPad', safari
        ? '<ol><li>Tap the <b>Share</b> button at the bottom (square with an arrow).</li><li>Scroll and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>. Open Nexora from your home screen.</li></ol><p class="tiny">Apple only allows this from Safari.</p>'
        : '<p>On iPhone, apps can only be added from <b>Safari</b>. Open this same link in Safari, then tap Share → Add to Home Screen.</p>');
    } else if (os === 'mac') {
      card('Install on Mac', '<ol><li><b>Safari:</b> menu <b>File → Add to Dock</b>.</li><li><b>Chrome / Edge:</b> click the install icon at the right of the address bar.</li></ol>' + (deferred ? '<button class="btn" id="pwa">Install Nexora</button>' : ''));
    } else if (os === 'linux') {
      card('Install on Linux', (deferred ? '<button class="btn" id="pwa">Install Nexora</button>' : '') + '<p>Chrome, Chromium or Edge: click the install icon in the address bar. Or run this in a terminal:</p><code>curl -fsSL ' + esc(location.origin) + '/downloads/install-linux.sh | sh</code>');
    } else if (os === 'tv') {
      card('Nexora on your TV', '<p>You are already here. Nexora has switched to TV mode: arrow keys move, OK presses, Back goes back.</p><a class="btn" href="/">Open Nexora</a>');
    } else {
      card('Install Nexora', '<p>Open this page in Chrome, Edge or Safari and look for "Install" or "Add to Home Screen".</p><a class="btn" href="/">Open Nexora</a>');
    }
    var pwa = document.getElementById('pwa');
    if (pwa && deferred) pwa.addEventListener('click', function () {
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; render(); }, function () {});
    });
  }

  // open the block of the matching device in the list below
  var mine = document.querySelector('details[data-os="' + os + '"]');
  if (mine) mine.parentNode.insertBefore(mine, mine.parentNode.firstChild);

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; render(); });
  window.addEventListener('appinstalled', function () { standalone = true; render(); });
  render();

  // the link to send to friends
  var link = document.getElementById('link');
  link.value = location.origin + '/install';
  document.getElementById('copy').addEventListener('click', function () {
    var done = function () { document.getElementById('copy').textContent = 'Copied'; setTimeout(function () { document.getElementById('copy').textContent = 'Copy'; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(link.value).then(done, function () { link.select(); });
    else { link.select(); try { document.execCommand('copy'); done(); } catch (e) { /* select is enough */ } }
  });
  if (navigator.share) {
    var s = document.getElementById('share');
    s.hidden = false;
    s.addEventListener('click', function () { navigator.share({ title: 'Nexora: free music', text: 'Install Nexora, free ad-free music:', url: link.value }).catch(function () {}); });
  }
})();
