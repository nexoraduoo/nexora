# Sharing Nexora with friends (no .bat file, no PC left on)

Nexora lives on Cloudflare's servers, not on your computer. **You never need to run `start-nexora.cmd` for anyone else.** Your PC can be off.
(`start-nexora.cmd` is only for testing changes on your own computer.)

## The one link

Send this single link to anyone, on any device:

```
https://nexora.nexora-duoo.workers.dev/install
```

That page works out the device and shows the right button:

| Their device | What they see |
| --- | --- |
| Windows | **Download Nexora-Setup.exe** (35 KB). Open it: it installs, adds Desktop and Start-menu icons, and opens Nexora. Windows may warn "protected your PC": **More info → Run anyway** (the file is not code-signed because certificates cost money). |
| Android | **Install Nexora** button (one tap). |
| iPhone / iPad | Three steps with Safari (Apple allows nothing else). |
| Mac | Safari "Add to Dock" or Chrome/Edge install icon. |
| Linux | Install icon in Chrome/Chromium/Edge, or one command (`install-linux.sh`). |
| TV | Opens in TV mode by itself. |

**Why not one single file for every device?** A Windows `.exe` cannot run on a phone, and an iPhone app cannot be a file you send: Apple and Google only install apps from their stores or from the browser. The `/install` link is the nearest thing to "one file for everyone", and it is free.

## Who gets in: tickets you approve

Default mode is **Ask first**:

1. A friend opens the link, taps **New here? Ask for access**, picks a username and password, and may write a short note ("Hi, I'm Ravi from college").
2. They see "Request sent". Nothing works for them yet.
3. **You get a ticket**: a red number next to your name in Nexora, and a phone alert if you set one up (below).
4. Owner console → **Sign-in requests** → **Approve** or **Decline**.
5. After approval they sign in with the same username and password.

Friends who have your **invite link** (Settings → Invite friends) skip the ticket: that link is your approval in advance.
You can change this any time in Owner console → **Who can join**: *Ask first*, *Invite only*, *Anyone*.

### Phone alerts (free, 2 minutes)

1. Owner console → **Phone alert for new requests** → **Make one** → **Save**. It creates a private alert name.
2. On your phone install the free **ntfy** app (Play Store / App Store), tap **+**, and subscribe to that name.
3. Press **Send test**. Now every request pops up on your phone; tap it to open the console.

(ntfy is an open, free notification service. Anyone who knows your alert name could read the alerts, so keep the name private; it contains only "X asked to join".)

## A domain name

You already have a public, https, always-on address: `https://nexora.nexora-duoo.workers.dev`. It is free and fully public.

**Prettier free options**
- Change the account part: Cloudflare dashboard → Workers & Pages → the "nexora-duoo" subdomain can be renamed (e.g. `sai-music`), giving `nexora.sai-music.workers.dev`.
- Re-run `deploy.cmd` and answer a different app name when asked to get `othername.<account>.workers.dev`.

**Your own name (e.g. `music.yourname.com`)**: this needs a domain you own. Domains are sold by registrars (about US$1–12 a year; Cloudflare Registrar sells at cost). There is no way to get a real `.com` completely free. When you have one:

1. Add the domain to your Cloudflare account (dashboard → Add a site → Free plan) and follow the "change nameservers" step at your registrar.
2. Run: `deploy.cmd --domain=music.yourname.com`
3. Cloudflare creates the DNS record and the https certificate by itself. The domain is remembered in `MY-NEXORA-DOMAIN.txt` for later deploys.
4. The installer file and `/install` page keep working on the old address too. To make the Windows installer open the new domain, run `powershell -File desktop\make-installer.ps1 -Url https://music.yourname.com`, then deploy again.

(This custom-domain step is written but could not be tested without a domain of your own.)
