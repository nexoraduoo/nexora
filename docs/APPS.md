# Nexora on every device

Nexora is one web app. Every "app" below shows the same thing, so your account, playlists and downloads follow you.
Nothing here costs money, except the two optional store accounts noted at the end.

| Device | Easiest way | Takes |
| --- | --- | --- |
| Windows | `Nexora-Windows.zip` → unzip → `Nexora.exe` (see below), or install from Edge/Chrome | 1 minute |
| Android | Chrome → ⋮ → **Install app** | 10 seconds |
| iPhone / iPad | Safari → Share → **Add to Home Screen** | 10 seconds |
| Mac / Linux / Chromebook | Chrome or Edge → install icon (⊕) in the address bar; Linux app script in `desktop/build-linux-app.sh` | 10 seconds |
| Smart TV / Fire TV / Apple TV | Open the TV browser, go to your Nexora address, Settings → **TV mode** | 1 minute |
| Watch | Start music on the phone; the lock-screen controls appear on the watch | nothing |

## Windows app (the .exe)

The Windows app is the website in its own window, with:

* its own icon, taskbar button and tray icon (closing the window keeps the music playing; right-click the tray icon for Play/Pause, Next, Quit)
* keyboard media keys (play/pause, next, previous)
* one copy only (opening it again brings the first one forward)
* a friendly "Can't reach Nexora" page with a **Try again** button when there is no internet

**Using it:** unzip `Nexora-Windows.zip` (150 MB; about 350 MB once unzipped) anywhere, open the folder and double-click `Nexora.exe`. No installer, no admin rights. Right-click `Nexora.exe` → Send to → Desktop (create shortcut) for a desktop icon. To remove it, delete the folder.
Windows SmartScreen may say "Windows protected your PC" because the file is not code-signed (signing costs money).
Click **More info → Run anyway**. It is safe: you built it from the files in this folder.

**Limits, honestly:**

* The voice assistant's *listening* does not work inside this window (Electron has no speech service). You can still type commands in the voice window. In Chrome/Edge as an installed web app, voice works.
* It needs internet for new music; downloaded songs play offline.

**Building it again** (only if you change `desktop/` or the address): double-click `desktop\build-windows-app.cmd`. It copies Electron's ready-made runtime and our few files into `desktop\dist\Nexora-Windows` and zips it. The exe carries Electron's default icon (changing it needs an extra tool); the taskbar and tray show the Nexora icon while it runs.
The address it opens is in `desktop\config.json`. If you ever move Nexora to a custom domain, change that one line and rebuild.

## Android app

Chrome → ⋮ → **Install app** gives an app icon, full-screen window, lock-screen controls and background playback. For most people this is all you need.

If you want it in the Play Store as a real `.apk`/`.aab`:

1. Go to <https://www.pwabuilder.com>, paste your Nexora address, press **Start**.
2. Choose **Android → Generate package**. You get a signed package and a short guide.
3. Uploading to the Play Store needs a Google Play developer account (one-time US$25). Sharing the `.apk` directly with friends is free.

## iPhone / iPad

Safari → Share → **Add to Home Screen**. Notes: iOS only allows installed web apps from Safari, and background audio works best when installed this way.
A real App Store app needs a Mac and Apple's yearly developer fee (about US$99); PWABuilder can generate the Xcode project.

## Linux

Easiest: Chrome, Chromium or Edge → the install icon in the address bar. Nexora then appears in your app menu and updates itself.
(Firefox on Linux does not install web apps; just keep the tab open or use the app below.)

An app of its own: on a Linux computer run `bash desktop/build-linux-app.sh` (needs Node.js; first run downloads Electron). It makes `desktop/dist/Nexora-Linux/nexora`
and a `.tar.gz` to share. This script is written but has not been run on a real Linux machine, so treat it as "should work".

## Mac

Safari 17+ → File → **Add to Dock**, or Chrome/Edge → install icon in the address bar. A `.dmg` needs a Mac to build it, and Apple warns about unsigned apps, so the browser install is the recommended way.

## TVs and streaming boxes

* **Samsung (Tizen), LG (webOS), Android TV / Google TV, Fire TV, Hisense, Philips:** open the TV's web browser and type your Nexora address.
  Nexora recognises a TV browser and switches on **TV mode** by itself (big text, remote-friendly). The remote's arrow keys move around, **OK** presses,
  **Back** goes back, and the play / pause / skip keys work.
* **Models from before about 2021** have a browser too old for modern web apps and will show "Please update your browser". Use your phone instead:
  open Nexora on the phone, tap **Connect**, choose the TV (if it runs Nexora) or cast the phone's sound with the TV's own AirPlay/Chromecast/Bluetooth.
* **Apple TV** has no web browser at all. Play on your iPhone and use **AirPlay** to send the sound to the Apple TV.
* **Chromecast:** open Nexora on a phone/laptop in Chrome and use Chrome's **Cast** menu, or just use Bluetooth/AirPlay.
* **Game consoles:** the built-in browser of PlayStation / Xbox may work; not tested.

## Oldest versions that work (tested by feature checks, not on every device)

| System | Minimum |
| --- | --- |
| iPhone / iPad | iOS 15 (older iPhones such as the 6s and 7 can update to it). On iOS 15 to 16.1 some soft colours and glows fall back to plainer ones |
| Android | Chrome 84 or newer (Android 7+ with Play updates) |
| Windows / Mac / Linux | any current Chrome, Edge, Firefox or Safari 15+ |
| TV | about 2021 or newer |
