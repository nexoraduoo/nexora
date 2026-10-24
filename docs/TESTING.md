# Testing Nexora on real devices

Everything below was checked automatically or in a desktop browser. These items **need a real phone, TV or microphone**, so
nobody (including the builder) could check them without the device. It takes about 15 minutes. Tick them off, and tell
the owner what fails. In the app, **Settings → About → Check this device** shows what each browser supports; use
**Copy report** and send it with your message.

## Your phone (Android)

- [ ] Open the address in Chrome, then ⋮ → **Install app**. An icon appears and the app opens full screen.
- [ ] Play a song, lock the screen. Music keeps playing; the lock screen shows title, art and buttons.
- [ ] Turn on airplane mode. The app still opens and shows "You are offline". A downloaded song still plays.
- [ ] Tap the microphone, allow it, say "play something relaxing". It starts a song.
- [ ] Sign in on a second device. In **Connect**, pick the phone from the laptop: pause/next/seek works.

## iPhone / iPad

- [ ] Safari → Share → **Add to Home Screen**, open from the icon.
- [ ] Play a song, lock the screen. It keeps playing (Apple may stop it after a long pause).
- [ ] Voice: Safari supports it, Chrome on iPhone does not.
- [ ] The equaliser may be limited by Apple; that is expected.

## Listen together (needs two accounts, two devices)

- [ ] Device A: **Listen together → Start a listening room → Copy invite link**; send it to device B.
- [ ] Device B opens the link, taps **Join the room**. Both show "Listening together · 2".
- [ ] A plays a song: B starts the same song within a few seconds. B presses pause: A pauses too.
- [ ] B adds a song to the queue: it appears on both.
- [ ] A taps **End for everyone**: B sees "The host ended the listening room".

## Windows app (.exe)

- [ ] Unzip `Nexora-Windows.zip`, double-click `Nexora.exe`, click **More info → Run anyway** if SmartScreen appears.
- [ ] Sign in, play a song, press your keyboard's play/pause key: it pauses.
- [ ] Close the window (X): music keeps playing and the tray icon stays. Tray → **Quit** really stops it.
- [ ] Disconnect internet and reopen: you see "Can't reach Nexora" with **Try again**.

## Older phones / TVs

- [ ] On an iPhone 6s/7/8 (iOS 15): Home, Search and playback work; no sideways scrolling; tapping a field does not zoom the page.
- [ ] On a 2021+ TV browser the app opens in TV mode by itself; arrow keys, OK, Back and the play/pause keys all work.
- [ ] On an older TV you get "Please update your browser" instead of a blank screen.

## TV

- [ ] TV browser → address → **Settings → TV mode**. The remote's arrow keys move the highlight, OK presses.
- [ ] Or play on your phone and **Connect** → the TV, with the phone as a remote.

## The 2-minute catalogue agent (production only)

- [ ] Sign in as owner → **Owner console → Catalogue agent**. Note "tracks known".
- [ ] Wait 20 minutes without touching anything. The number grows and new rows appear in the agent table.

## Automatic checks (for the builder)

```
node --test tests/*.test.mjs     # unit tests
node scripts/test-api.mjs        # whole API against a throwaway server
node scripts/i18n-check.mjs      # which texts are missing in which language
```
