# Nexora guide: decisions, assumptions, pros & cons

This is the "tell me everything" document. Short version first, details after.

## 1. What you asked for, and what you got

| You asked for | What Nexora does | Honest note |
|---|---|---|
| Login and sign-up first, then Home like Apple Music / Spotify | Done. Invite-only sign-up (first account = owner), then Home, Search, Browse, Library, Radio, Friends, Settings. | Passwords never leave the device unscrambled (see section 5). |
| All the common features of both apps | Playlists (collaborative, shareable), liked songs, queue, shuffle/repeat, lyrics (synced), equaliser, sleep timer, speed, charts, radio, artist/album pages, history, friend activity, offline, background play, lock-screen controls. | **Not included:** podcasts, video, paid-catalogue streaming, social feeds beyond "listening now". |
| Voice assistant, accurate and flexible | Browser speech-to-text + a command parser that understands polite phrasing, numbers, moods, languages, device names and Hindi / Telugu / Tamil / Spanish / French / German / Portuguese command words. 113 phrase tests pass. | Needs Chrome, Edge or Safari. Accuracy of the *listening* part is the browser's; Nexora's part (understanding) is tested. |
| An AI in the background grabbing verified uploads | The **Catalogue agent**: every 2 min it takes the next job (best of all time / new this week or month / old recordings / radio, one list at a time, paging deeper every cycle), verifies each track (licence, secure stream, duration, spam, audiobooks, duplicates, **never a preview**), tidies the title, tags language and mood, and stores it. Optional free Workers-AI tagging. | It *only* ingests sources that allow it. It does **not** download from YouTube, Spotify or similar. See section 4. |
| Clean database + load balancer | Cloudflare D1 (SQLite) with 7-day point-in-time recovery, proper tables, full-text search, indexes. Cloudflare's network is the load balancer: requests are served from the nearest data centre and scale automatically. | You cannot (and need not) run your own load balancer on the free plan. |
| Every device, one-click install, no extra steps | Installable web app (PWA): one tap on Android, desktop, iPhone/iPad (Add to Home Screen), TVs via browser. | A *single file* that installs on every OS does not exist: `.exe`, `.apk`, `.ipa` are different formats. The web address is the one thing that works everywhere. Native wrappers are a next step. |
| All languages | 34 languages to browse, live radio in all of them, interface in 8 languages (English, हिन्दी, తెలుగు, தமிழ், Español, Français, Deutsch, Português). | Catalogue depth varies by language. Long help paragraphs are still English in the other 7 (run `npm run i18n` to see what's missing). |
| Ad-free, downloadable to MP3, offline, background play | Yes. Downloads/export only for tracks whose licence or artist allows it; previews and radio never. | Mainstream hits are previews unless you own the file. |
| Same account on many devices, play simultaneously, manage all from one | Nexora Connect: live device list, remote control, "move music here", "play here too". Verified with two separately signed-in browsers (not yet with physical phones). | |
| €0, real domain (not localhost) | Cloudflare free plan, address like `https://nexora.<you>.workers.dev`. | A *custom* name like nexora.com costs ~EUR 10/year. |
| App name that includes Nexora | **Nexora**. Alternatives below. | Check trademark availability before going public. |

## 2. Name ideas (all contain "Nexora")

Nexora **Pulse** · Nexora **Waves** · Nexora **Echo** · Nexora **Sonic** · Nexora **Aura** · Nexora **Beats** ·
Nexora **Vibe** · Nexora **Orbit** · Nexora **Harmony** · Nexora **Tunes** · Nexora **Radio** · Nexora **Circle**.
To rename: change `APP_NAME` in `wrangler.jsonc`, the `<title>` and `manifest.webmanifest`, and `public/icons`
(`npm run icons` regenerates the logo).

## 3. Cost: what "free" really covers

Cloudflare's own documentation (checked October 2026) lists these free-plan limits:

| Part | Free allowance | What it means for a circle of friends |
|---|---|---|
| App files (pages, scripts, images) | free and unlimited | The player itself never costs anything |
| Server requests (accounts, library, sync) | 100,000 / day | Roughly dozens of daily-active friends comfortably |
| Database (D1) | 5 M reads, 100 k writes / day, 5 GB | Tens of thousands of tracks and playlists |
| Realtime hub (Durable Objects) | 100 k requests / day, hibernating sockets are not billed for idle time | All your devices stay connected for free |
| Cloud locker (R2) | 10 GB, free egress | Optional. Cloudflare may ask for a card to switch it on; nothing is charged inside the limits |
| AI tagging (Workers AI) | 10,000 neurons / day | Optional |
| Scheduled agent | 5 cron triggers, **10 ms CPU per run** | The agent does one small task per run on purpose |

If you ever outgrow it, the paid plan is about USD 5 / month for everything and needs no code change.
**Everything else is free:** Audius, Jamendo, Internet Archive, Radio Browser, LRCLIB, and Apple's public search/preview API.

## 4. Music, legality and the "AI that grabs songs" idea

* Taking songs from YouTube/Spotify/Apple (ripping, scraping, "downloaders") breaks those services' terms and
  copyright law. It also gets domains and accounts banned, so it would break the app for you and your friends.
  Nexora deliberately does **not** do that.
* What *is* legal and free: music its owner chose to share (Audius artists, Creative-Commons), public-domain
  recordings, public radio, previews offered by Apple for promotion, and **your own files**.
* The catalogue agent applies the same rule: a track is stored as "verified" only if it came from one of those
  sources, has licence info, a secure stream URL and a sane length, and is not spam. Previews stay previews.
* To get *a specific song you own* into Nexora: upload it (Library → My files) or play it straight from the device.
* To bring playlists from Spotify / Apple Music / YouTube Music: export a list with a free tool (Exportify,
  TuneMyMusic), then Library → Import. Nexora finds whatever exists in its legal catalogue and tells you what it could not find.

### What is in the catalogue (and what is not)

| Shelf | Where it comes from |
|---|---|
| **New** | Audius (artists' newest uploads, week and month, per genre), Internet Archive (newest uploads), ccMixter (newest), Jamendo (newest, with key) |
| **Best of all time** | Audius all-time most played, Internet Archive most downloaded, ccMixter top-rated, Jamendo most popular (with key); shown one source at a time in turn, never more than 2 songs per artist |
| **Classics and oldest** | Internet Archive recordings dated before 1990 that carry a Creative-Commons or public-domain licence: 1920s jazz, 78rpm records, classical, folk |
| **Genres, moods, languages** | the same stored songs, tagged by the agent |

**Honest limit:** this is independent, open and old music. Today's major-label hits are not free to stream in full anywhere, so they are
not in this catalogue. The only legal way to play them in full is YouTube's own player (below), which can show ads.

### Growing the catalogue (two optional, free upgrades)

1. **Jamendo key (recommended)**: adds ~600,000 Creative-Commons full songs.
   Sign up free at <https://devportal.jamendo.com> → create an application → copy the **Client ID** →
   Owner console → *Sign-up & sources* → **Jamendo client ID** → Save → press **Run now** a few times.
2. **YouTube full-song button (optional)**: for a 30-second preview, "Play full song (YouTube)" plays the full version
   inside **YouTube's own embedded player**. Nothing is downloaded or extracted; YouTube's rules apply, so it may show
   its own ads, the video box must stay visible, and phones may pause it when the screen is off. It needs a free key:
   Google Cloud console → new project → *APIs & Services → Library* → enable **YouTube Data API v3** →
   *Credentials → Create credentials → API key* → paste it in Owner console → **YouTube API key**.
   Free quota is 10,000 units a day (one lookup costs 100, so about 100 new songs a day; every result is remembered).
   Settings → Sound has "Full songs from YouTube automatically" (off by default).

## 5. How it is built (plain English)

```
 phone / laptop / TV                      Cloudflare (free)
 ┌───────────────────┐   HTTPS   ┌──────────────────────────────────────────┐
 │ Nexora web app    │ ────────► │ Worker: accounts, playlists, agent       │
 │ player, voice,    │           │ D1 database (SQLite)                     │
 │ offline (IndexedDB)│ ◄──────► │ Durable Object per user = "Connect" hub  │
 └─────────┬─────────┘ WebSocket │ R2 locker (optional)                     │
           │                     └──────────────────────────────────────────┘
           └─ music streams straight from Audius / Archive / radio / Apple (not through your server)
```

* **No build step.** The app is plain files; the interface library (Preact) is bundled in `public/vendor`.
* **Passwords:** the browser stretches your password with PBKDF2 (600,000 rounds) and sends only the result; the
  server stores a keyed hash of that. (Cloudflare's free plan only allows 10 ms of server CPU, too little to hash
  passwords on the server safely, so the heavy work happens on your device.) Sessions are HttpOnly cookies; every
  state-changing request carries an `x-nexora` header (CSRF guard); sockets reject other websites; sign-in and
  sign-up are rate limited; unsafe URLs are stripped from anything a friend can see.
* **Streams go direct** from the music source to the listener, which keeps your free quota for what matters.

## 6. Pros and cons (the honest version)

**Pros**
* No ads, no subscription, no tracking beyond your own circle's listening history.
* Free to run: €0/month for a friends-sized group, no server to maintain, automatic scale.
* One codebase for every device; installs in one tap; updates reach everyone instantly.
* Real multi-device control (play on several at once, or take over another device).
* Voice assistant, lyrics, EQ, visualiser, offline, sleep timer, TV mode, 8-language interface.
* Private and invite-only; owner can reset passwords and remove people.
* You own the code and the data; Cloudflare also keeps 7 days of point-in-time database recovery.

**Cons / limits you should know**
* **Catalogue:** the biggest hits are 30-second previews. Independent, open and radio music is full length.
  No legal free app can offer every commercial song ad-free; this one is honest about it.
* **No single installer file** for all OSes (it is a web app). Store packages need extra tools and, for iOS, an Apple developer account (USD 99/year).
* **iPhone:** Apple limits web apps: the equaliser can interfere with lock-screen audio (so it is off by default), and speech recognition may not work in the home-screen app (it works in Safari).
* **Voice:** needs an internet connection and a supporting browser (Chrome / Edge / Safari; not Firefox). "Hey Nexora" listens only while the app is open.
* **Offline:** only tracks that may be downloaded; browsers can clear storage on low-space phones.
* **Free-plan ceilings:** very large groups would need the paid plan. Apple's search API allows about 20 requests/minute per person, so playlist import runs at ~18 songs/minute.
* **Smartwatch / TV:** no dedicated watch app; TVs use the browser.
* Source terms (Audius, Jamendo, Apple's API) are for personal/non-commercial use; read them before opening Nexora to the public.

## 7. What has and has not been tested

Tested here, automatically or by hand:
* 170 unit checks (voice parser, catalogue adapters, validators, service-worker logic, podcasts, daily mixes) and 87
  end-to-end API checks (accounts, invites, playlists, sharing, friends, locker uploads with seeking, agent, realtime hub,
  listening rooms, security guards). Real-device items are listed in `docs/TESTING.md`.
* In a real browser against live music sources: sign-up, Home, search across all sources, playback, Now Playing,
  lyrics, voice commands (typed), offline download, EQ + visualiser, two-device remote control / transfer / pull-back,
  catalogue agent from the owner console, phone and desktop layouts, light theme, TV mode, Telugu interface.
* `deploy --dry-run` builds the production bundle with all bindings.

**Not** tested (no way to here), so treat as "should work, please try":
* The actual Cloudflare deployment (needs your account and login), including the 2-minute scheduled agent under the 10 ms CPU limit.
* Installing as an app and the offline service worker in a real browser (its logic is unit-tested; the preview browser used here blocks service workers).
* Real microphone input, "Hey Nexora" wake word, spoken replies.
* Real iPhone / Android / TV devices; lock-screen controls.

## 8. Next steps (ideas)

* Android `.aab` / iOS project from the same address with PWABuilder (the Windows `.exe` already exists: see `docs/APPS.md`).
* Passkey (fingerprint / face) sign-in; collaborative "Blend".
* Jamendo key (free, see Owner console) for ~600,000 more Creative-Commons songs.
* Workers-AI voice transcription as a fallback for browsers without speech recognition.
