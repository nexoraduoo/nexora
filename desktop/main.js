// Nexora for Windows: the same app as the website, in its own window with media keys and a tray icon.
// Everything (accounts, library, devices) lives on your Nexora server; this window just shows it.
const { app, BrowserWindow, Menu, Tray, nativeImage, shell, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const config = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch { return {}; } })();
const START_URL = process.env.NEXORA_URL || config.url || 'https://nexora.nexora-duoo.workers.dev';
const ORIGIN = new URL(START_URL).origin;

// keep playing when the window is hidden, and let songs start without an extra click
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('enable-features', 'HardwareMediaKeyHandling,MediaSessionService');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null;
let tray = null;
let quitting = false;

function icon() { return nativeImage.createFromPath(path.join(__dirname, 'icon.png')); }

function show() {
  if (!win) return create();
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

function create() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 380, minHeight: 560,
    title: 'Nexora', icon: icon(), backgroundColor: '#0b0b12', autoHideMenuBar: true,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.setMenuBarVisibility(false);
  win.loadURL(START_URL);

  // links to other sites open in the normal browser, never inside the player
  const external = (url) => { try { return new URL(url).origin !== ORIGIN; } catch { return true; } };
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (external(url) && !url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });

  // no internet or server down: show a friendly page with a Retry button instead of a blank window
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (!isMain || code === -3) return;
    win.loadFile(path.join(__dirname, 'offline.html'), { query: { to: url || START_URL } });
  });

  // closing the window keeps the music going from the tray
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; });
}

function makeTray() {
  tray = new Tray(icon().resize({ width: 16, height: 16 }));
  tray.setToolTip('Nexora');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Nexora', click: show },
    { label: 'Play / Pause', click: () => win?.webContents.executeJavaScript('window.nexora && window.nexora.ctl.toggle()').catch(() => {}) },
    { label: 'Next song', click: () => win?.webContents.executeJavaScript('window.nexora && window.nexora.ctl.next()').catch(() => {}) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', show);
}

app.on('second-instance', show);
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* stay in the tray */ });

app.whenReady().then(() => {
  // the microphone (voice assistant) is allowed for Nexora only
  const ses = session.defaultSession;
  const mine = (wc) => { try { return new URL(wc.getURL()).origin === ORIGIN; } catch { return false; } };
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(mine(wc) && ['media', 'microphone', 'audioCapture', 'notifications', 'fullscreen', 'clipboard-sanitized-write'].includes(permission)));
  ses.setPermissionCheckHandler((wc, permission) => !!wc && mine(wc) && ['media', 'microphone', 'audioCapture', 'notifications', 'fullscreen'].includes(permission));
  ipcMain.handle('nexora:version', () => app.getVersion());
  create();
  makeTray();
});
