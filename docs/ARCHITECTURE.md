# How Nexora is built (and how it compares to Spotify / Apple Music)

## Your brief, point by point

| You asked for | What Nexora does |
| --- | --- |
| One app for iOS, Android, Windows, macOS, Linux, web | A **PWA** (installable web app) plus a Windows wrapper. See `docs/APPS.md`. A PWA was chosen over React Native / Flutter because one codebase runs everywhere with no store accounts and updates itself. |
| Responsive layout, phone to desktop | One layout system (`public/css/app.css`): desktop sidebar → phone bottom bar (Home, Search, Library, Playlists), tablet in between, TV mode for big screens. |
| Persistent, collapsible player bar | Mini player on every screen; tap it for the full-screen **Now Playing** (artwork, lyrics, queue, devices, equaliser). |
| Dark / light, glass look, quick tiles, carousels | Theme toggle in Settings → Appearance. Frosted-glass panels (sidebar, player, menus), big album art, quick-access tiles on Home, smooth snap-scrolling shelves. |
| Free music source with real playback | **Audius, Jamendo (with your free key), Internet Archive, ccMixter, Radio Browser**, plus podcasts. Napster's API needs a paid key and licences, so it is not used. Play, pause, skip, seek, volume, queue, shuffle, repeat, crossfade, sleep timer, equaliser. |
| Playlists, Liked Songs, history | Create / rename / delete / share / collaborate; Liked Songs; Recently played. |
| Filter by genre, artist, album, mood | A filter bar on Liked Songs, Recently played, Downloads and every playlist (plus quick text filter). Genres and moods are also browsable from Search. |
| Persistence across reloads | Queue, position and settings are saved on the device; likes, playlists and history are saved in your account (cloud database), so they follow you to every device. |
| Zustand / Redux | Nexora uses a tiny built-in store (`createStore` in `public/js/lib.js`), the same idea as Zustand, without a build step. |
| Tailwind | Plain CSS with design tokens (colours, radii) in `:root`; no build step. |

## The recording ID (ISRC) and updating a song's audio

How the big services do it:

1. Every recording has one permanent **ISRC**. A remaster or fixed mix is delivered with the *same* ISRC, so playlists, play counts and recommendations stay intact.
2. Labels deliver a **DDEX** package: metadata XML plus the new audio, with an instruction such as *UpdateAsset for ISRC X*.
3. The service transcodes it and **hot-swaps the pointer** from the old file to the new one.
4. The **CDN is purged** so the new file reaches every region.
5. Devices that cached the old file keep playing it until their cache expires or is refreshed.

What Nexora does with the same idea (all of it works and is tested):

| Step | In Nexora |
| --- | --- |
| Permanent identity | Each track has a permanent id (`audius:…`, `ia:…`) and, when the source supplies one, an **ISRC** (stored, validated, and used to avoid adding the same recording twice). |
| Update command | Owner console → **Asset updates**: *Replace the audio (UpdateAsset)* or *Withdraw the recording (TakeDown)* by track id **or ISRC**, with an `https://` address. API: `POST /api/admin/assets` with `{ "action": "UpdateAsset", "isrc": "USUM71500001", "audioUrl": "https://…" }`. `UpdateMetadata` fixes title, artist, album, genre, mood or artwork. |
| Hot-swap | The row keeps its id; the audio address changes and the **revision** goes up (v1 → v2). Playlists, likes and history point at the id, so nothing breaks. An old copy inside someone's playlist can never overwrite the new audio. |
| Automatic detection | The catalogue agent compares what a source serves now with what is stored. If a track's length changed by 2 seconds or more it is treated as a replaced master: revision +1, logged as *AutoUpdate*. |
| Cache refresh on devices | When the app opens (and at most every 6 hours), it asks which revisions are live. **Downloaded songs are downloaded again** if a newer revision exists, and the saved queue gets the new address. Withdrawn recordings are removed from the device. |
| Change log | The Owner console lists every update (who, when, which ISRC, which version). |
| CDN purge | Streaming comes straight from the artist's host (Audius, Internet Archive…), so the *source* controls caching. Nexora's own pages revalidate on every load (`Cache-Control: no-cache`), so a new app version reaches devices at the next open. |

What Nexora **cannot** do, honestly: receive DDEX packages from record labels (that needs a distributor agreement), or transcode masters into AAC/Ogg itself. For your own uploads (My files), the file you upload is what plays. If a label or artist ever wants to deliver audio to you directly, the Asset updates form is the doorway; a full DDEX XML reader could be added on top of the same API.

## Where things live

```
public/            the app (no build step)
  js/app.js          start-up, routes, keyboard + TV remote
  js/player.js       playback engine (queue, shuffle, offline, equaliser, lock screen)
  js/assets.js       keeps saved songs current when audio is replaced
  js/views/…         screens: home, search, library, playlists, now playing, settings
  css/app.css        the whole design system
src/               the server (Cloudflare Worker)
  ingest.js          the catalogue agent
  routes/assets.js   ISRC / asset-update API
  room.js            "Listen together"
migrations/        database changes, applied in order
desktop/           Windows (and Linux) wrapper
tests/             unit tests + API tests
```

## The world catalogue: every song, with ISRC, free

What you asked for: "all songs, from the beginning to today, updated in real time as soon as they reach the streaming platforms, with ISRC, completely free." Here is exactly what that means in practice.

**What is possible for free, and is built in:**

| Part | Source | What you get |
| --- | --- | --- |
| Every recording ever catalogued, with ISRC | **MusicBrainz** (the open music encyclopedia: tens of millions of recordings) | Search any song, artist or album in Search → "Every recording in the world". Type an ISRC to look it up. Each result keeps its ISRC. |
| What just came out, everywhere | **ListenBrainz** "fresh releases" (fed by the same open database, which imports new releases from the stores) | The Home shelf **New everywhere**, refreshed by the 2-minute agent, newest first, biggest first. Tap a release for its tracklist with every ISRC. |
| Artwork | **Cover Art Archive** | Cover images for those releases. |
| Hearing it | Open catalogue first, then Apple | Press play on any world entry: the **full song** if the open catalogue has that recording (matched by ISRC, or title + artist), otherwise Apple's **30-second preview**, otherwise "Open on Spotify / Apple Music / YouTube Music / Deezer / Amazon" from the ⋯ menu. If you added a YouTube key in the Owner console, the full song plays through YouTube's own player. |

**What is not possible for free, by law and by physics, and is not built:**

- **The audio of commercial songs.** Spotify, Apple Music and the labels do not give music away; every service pays licences. No free source has the full audio of recent hits. So for those songs Nexora gives you the *entry, the ISRC, the cover and a preview*, and points to where the full song lives. The free, legal full-length audio (Audius, Jamendo, Internet Archive, ccMixter, radio, podcasts) keeps growing by itself every 2 minutes.
- **Real time from the distributors.** Distributors send their deliveries (DDEX files) privately to the stores, not to the public. The open databases pick new releases up from the stores, usually within hours to a day. That is the nearest "real time" that exists without a business agreement, and it is what Nexora uses.
- **The whole database copied into Nexora.** MusicBrainz is tens of gigabytes; the free Cloudflare database is far smaller. Nexora therefore asks MusicBrainz live (and keeps answers for a day) instead of copying it. This also keeps results current.

**Limits to know:** MusicBrainz asks for about one request per second for everyone using it; Nexora caches and limits searches to protect that. Some recordings have no ISRC in the database (it is community-filled), in which case the ISRC line is simply missing.

## YouTube Music

YouTube Music has no public programme for apps to read its library, and its audio may only be played inside YouTube's own player. Nexora therefore uses YouTube the official way, once you add a free YouTube Data API key (Owner console → *YouTube API key*; steps in `docs/GUIDE.md`):

- **Every song plays in full.** For any entry that has only a preview or no free audio, Nexora finds the official video and plays it through YouTube's embedded player (YouTube may show its own ads there).
- **Import your YouTube Music playlists.** Library → Import a playlist → paste a public or unlisted playlist link → *Fetch*. Nexora turns it into a Nexora playlist, matching each song to the best available version.

Without a key these two features are off; everything else works.

## Speed of the catalogue

The agent runs **every 2 minutes** (the fastest the free database allows), and every other run only looks at the *newest uploads* of each source, so a song released on Audius, the Internet Archive, ccMixter or Jamendo reaches Nexora within minutes. The world catalogue ("New everywhere") refreshes every 4 minutes from the open databases.
