# Nexora

**Ad-free music for you and your circle. Every language, every device, one account.**
Open source (MIT). Try it: https://nexora.nexora-duoo.workers.dev  ·  Contact: nexora.duoo@gmail.com

Nexora is a music app you own. You run it for yourself, invite your friends with a link, and everyone
gets the same clean player on their phone, laptop, tablet or TV. There are no ads, ever.

It looks and feels like Spotify / Apple Music (home, search, library, playlists, queue, lyrics, full-screen
player, offline downloads, background play, lock-screen controls) and adds a few things of its own:

| | |
|---|---|
| **Voice assistant** | Say *"Hey Nexora, play something relaxing"* or *"play Tum Hi Ho"*, *"next"*, *"add this to my gym playlist"*, *"play on my phone"* in many languages. |
| **Nexora Connect** | Sign in on several devices. Play different music on each at the same time, **or** control one device from another, **or** move your music between them. |
| **Self-updating catalogue** | A background agent that, every 2 minutes and with nothing for you to do, collects the **best of all time**, the **newest** and the **oldest** full-length songs from licensed / artist-approved sources, checks them, tags language and mood, and keeps them in your own database. **Full songs only, no previews.** |
| **Listen together** | Start a room, send the link, and you and your friends hear the same song at the same moment. Anyone in the room can play, pause, skip or add songs. |
| **Daily mixes** | "Made for you" mixes built from what you play and like, refreshed every day. |
| **Podcasts** | Search millions of free shows, follow them, and Nexora remembers where you stopped. |
| **World catalogue** | Search every recording ever catalogued (tens of millions, with their **ISRC**), see what just came out on every platform. Free, from open databases. Audio: the full song when the open catalogue has it, else a 30-second preview, else links to the stores (see `docs/ARCHITECTURE.md`). |
| **Tickets for new people** | Anyone can ask for access from your public link; you approve each one (phone alert included). Friends with your invite link skip the queue (see `docs/SHARING.md`). |
| **One link to install** | `/install` shows each device its own big button: Windows gets a 35 KB `Nexora-Setup.exe`; Android a one-tap install; iPhone, Mac, Linux and TV the right steps. |
| **Filters and versions** | Filter any list by genre, artist, album or mood. Every recording keeps one permanent id (and its ISRC); when its audio is replaced, playlists keep working and saved copies refresh themselves (see `docs/ARCHITECTURE.md`). |
| **Your circle** | Invite-only sign-up, see what friends are listening to, share and co-edit playlists. |
| **Every language** | Browse by language (Hindi, Telugu, Tamil, Kannada, Malayalam, Korean, Spanish... 34 of them), plus live radio from all over the world. The app itself speaks 8 languages. |
| **Offline** | Save songs to a device and play them with no internet. Export them as `.mp3` where the artist allows it. |

---

## The 3 things you can do (no coding)

### 1. Try it on this computer (2 minutes)

Double-click **`start-nexora.cmd`** (Windows) or run `bash start-nexora.sh` (Mac / Linux).
Your browser opens Nexora. The first account you create becomes the **owner**.

> The first time it needs *Node.js* (a free tool that runs the app). On this PC a private copy is already in the
> `.tools` folder, so it just works. On another computer, install the **LTS** version from <https://nodejs.org>.

### 2. Put it online for free, so friends can use it

Double-click **`deploy.cmd`** (or `bash deploy.sh`). It will:

1. open a browser so you can sign in to **Cloudflare** (create a free account; no card needed),
2. create your database and publish the app,
3. print your address, something like **`https://nexora.yourname.workers.dev`**.

That address is a real internet domain (not `localhost`) and it costs **€0**. Cloudflare serves it from
data centres near each listener, so there is no server of yours to keep running and no load balancer to set up.

> Want `nexora.com`? A custom domain is the only thing that is not free (about €10 a year). Nexora works the
> same either way; you can add one later in the Cloudflare dashboard without changing anything here.

### 3. Get your friends in

1. Open your address and sign in. Go to **Settings → Invite friends → Create invite link**.
2. Send the link on WhatsApp / Telegram / SMS.
3. Your friend opens it, picks a username and password, and they are in.
4. On every device: **Settings → Install**. One tap and Nexora has its own icon and window, like a normal app.

You do **not** need to send anyone a folder or a file. An installable web app has no `.exe` / `.apk` to
download: the "installer" is the address. That is also why it works the same on Windows, Mac, Linux,
Android, iPhone, iPad, Chromebook and smart TVs.

---

## Install on every device

| Device | How |
|---|---|
| Windows / Mac / Linux / Chromebook | Open in Chrome or Edge → click the install icon at the right end of the address bar → **Install** |
| Android | Chrome menu ⋮ → **Install app** (keeps playing with the screen off) |
| iPhone / iPad | Safari → Share → **Add to Home Screen** |
| Windows app | `desktop/dist/Nexora-Windows.zip` (made by double-clicking `desktop/build-windows-app.cmd`, see `docs/APPS.md`): unzip, double-click `Nexora.exe`. Own window, tray icon, media keys |
| Smart TV / Fire TV / Apple TV | Open the address in the TV browser (or cast from a phone) and switch on **Settings → TV mode** |
| Smartwatch | Start music on the phone; the lock-screen controls appear on Apple Watch and Wear OS automatically |

If you later want real store packages (`.exe`, `.apk`, App Store), free tools like <https://pwabuilder.com> can
wrap this same address. See `docs/APPS.md` for the Windows app and Android/iPhone packages.

---

## Where the music comes from (and what it cannot do)

Nexora only plays music it is **allowed** to:

* **Full songs, free, legal:** artist-uploaded music on Audius, Creative-Commons music (Jamendo, Internet Archive), and public radio stations.
* **30-second previews:** hit songs from Apple's public catalogue. Great for discovery; each one has a "find the full song on Apple Music / YouTube Music / Spotify" shortcut.
* **Your own files:** play files from any device, or keep them in your private cloud locker.
* **Optional YouTube button:** with a free YouTube key (Owner console), a preview song gets a "Play full song (YouTube)"
  option that uses YouTube's own embedded player (YouTube may show ads; see `docs/GUIDE.md`).

It does **not** copy music from YouTube, Spotify or any service that forbids it. That would be piracy, could get your
address banned, and is not something this project does. The honest result: independent and open music is
fully playable; chart hits from the big labels play as previews unless you own the file. `docs/GUIDE.md` explains the trade-offs.

---

## What is "GitHub", and do I need it?

A *repository* ("repo") is just a project folder with a history of every change, stored online (GitHub is the
most popular website for that). You **don't** need it to use Nexora. It is useful if you want a backup, or to
let a developer friend help. Whenever you want it: create a free account at github.com, make an empty repository,
then in this folder run:

```
git init
git add .
git commit -m "Nexora"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/nexora.git
git push -u origin main
```

Secrets (`.dev.vars`), the 700 MB of tools (`node_modules`, `.tools`) and your data are already excluded by `.gitignore`.
To send the project to someone without GitHub, double-click **`make-share-zip.cmd`**: it creates a small
`share/nexora-share.zip` (about 250 KB).

---

## What is in this folder

```
nexora/
  start-nexora.cmd / .sh   run on this computer
  deploy.cmd / .sh         publish online for free
  make-share-zip.cmd       pack the project (250 KB) to send
  public/                  the app itself: pages, styles, player, voice, offline (no build step)
  src/                     the server (a Cloudflare Worker): accounts, library, realtime hub, catalogue agent
  migrations/              the database tables
  scripts/                 helper tools used by the files above
  tests/                   automatic checks (npm test)
  docs/GUIDE.md            assumptions, pros & cons, name ideas, roadmap
```

## Everyday commands (optional)

```
npm run dev        start locally
npm test           130 unit checks + 39 end-to-end API checks
npm run test:api   only the API checks (spins up a temporary server)
npm run i18n       show which interface texts still need translating
npm run deploy     same as deploy.cmd
```

## Troubleshooting

* **"Node.js is required"**: install the LTS version from <https://nodejs.org>, then run the script again.
* **Songs from "Top charts" are only 30 seconds**: expected, see "Where the music comes from".
* **Voice does nothing**: voice needs Chrome, Edge or Safari and microphone permission. Firefox has no speech recognition; type in the assistant box instead.
* **Forgot a password**: the owner opens **Owner console → People → Reset password** and gives the friend the one-time code; the friend taps *Forgot password?*.
* **Cloud locker is off**: it needs Cloudflare R2 (free up to 10 GB; Cloudflare may ask for a card to switch it on). Run `deploy.cmd` again and say yes to the locker.
* **Port already in use**: close the other Nexora window, or run with `PORT=8788`.
