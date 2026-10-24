// Settings, friends and the owner's admin console.
import { html, cx, useState, useEffect, useStore, useAsync, fmtBytes, timeAgo, isStandalone } from '../lib.js';
import { Icon } from '../icons.js';
import { app, lib, nav, toast, setPrefs, applyTheme, isAdmin, player } from '../state.js';
import { Avatar, IconBtn, Empty, Spinner, Modal } from '../ui.js';
import { api, get, post, put, patch, del } from '../api.js';
import { UI_LANGS, setLanguage, t, nSongs } from '../i18n.js';
import { LANGUAGES } from '../shared/sources.js';
import { StudioPanel, DevicesPanel } from './player-ui.js';
import { Diagnostics, showTour } from './polish.js';
import * as offline from '../offline.js';
import { voiceSupported, startWake, stopWake, speak } from '../voice.js';
import { follow, refreshPeople } from '../library.js';
import { deriveKey } from '../shared/kdf.js';

const VOICE_LANGS = [['', 'Automatic (browser language)'], ['en-US', 'English (US)'], ['en-IN', 'English (India)'], ['en-GB', 'English (UK)'], ['hi-IN', 'हिन्दी'], ['te-IN', 'తెలుగు'], ['ta-IN', 'தமிழ்'], ['kn-IN', 'ಕನ್ನಡ'], ['ml-IN', 'മലയാളം'], ['bn-IN', 'বাংলা'], ['mr-IN', 'मराठी'], ['gu-IN', 'ગુજરાતી'], ['pa-IN', 'ਪੰਜਾਬੀ'], ['ur-PK', 'اردو'], ['es-ES', 'Español'], ['es-MX', 'Español (México)'], ['fr-FR', 'Français'], ['de-DE', 'Deutsch'], ['pt-BR', 'Português (Brasil)'], ['it-IT', 'Italiano'], ['ja-JP', '日本語'], ['ko-KR', '한국어'], ['zh-CN', '中文'], ['ar-SA', 'العربية'], ['ru-RU', 'Русский'], ['tr-TR', 'Türkçe'], ['id-ID', 'Bahasa Indonesia'], ['th-TH', 'ไทย'], ['vi-VN', 'Tiếng Việt']];
const REGIONS = ['', 'IN', 'US', 'GB', 'CA', 'AU', 'DE', 'FR', 'ES', 'IT', 'BR', 'MX', 'AR', 'JP', 'KR', 'CN', 'TW', 'SA', 'AE', 'EG', 'TR', 'RU', 'PK', 'BD', 'LK', 'NP', 'ID', 'TH', 'VN', 'PH', 'NG', 'ZA', 'KE', 'NL', 'SE', 'PL'];

function Section({ id, title, icon, children, hint }) {
  return html`<section class="set-sec" id=${`set-${id}`}><h2><${Icon} name=${icon} size=${20} /> ${title}</h2>${hint ? html`<p class="muted">${hint}</p>` : null}<div class="set-body">${children}</div></section>`;
}
const Row = ({ label, hint, children }) => html`<div class="set-row"><div><b>${label}</b>${hint ? html`<small>${hint}</small>` : null}</div><div class="set-ctl">${children}</div></div>`;
const Toggle = ({ checked, onChange }) => html`<label class="switch"><input type="checkbox" checked=${checked} onChange=${(e) => onChange(e.target.checked)} /><i></i></label>`;

function InstallCard() {
  const evt = useStore(app, (s) => s.installEvt);
  if (isStandalone()) return html`<${Row} label=${t('Installed')} hint=${t('You are using the installed Nexora app.')}><${Icon} name="check" size=${20} /><//>`;
  const link = `${location.origin}/install`;
  return html`<div class="install-card">
    <div class="note-card"><${Icon} name="share" size=${20} /><div><b>${t('One link for every device')}</b><p>${link}</p></div><button class="btn primary" onClick=${() => (navigator.share ? navigator.share({ title: 'Nexora', url: link }).catch(() => {}) : navigator.clipboard?.writeText(link).then(() => toast(t('Link copied'), { kind: 'ok' })))}>${t('Share')}</button></div>
    <a class="btn" href="/downloads/Nexora-Setup.exe" download><${Icon} name="download" size=${18} /> ${t('Windows installer (35 KB)')}</a>
    ${evt ? html`<button class="btn primary big" onClick=${async () => { evt.prompt(); await evt.userChoice; app.set({ installEvt: null }); }}><${Icon} name="download" size=${20} /> ${t('Install Nexora on this device')}</button>` : null}
    <ul class="install-steps">
      <li><b>Windows · Mac · Linux · Chromebook</b> ${t('Open Nexora in Chrome or Edge, click the install icon (⊕) at the right of the address bar, then “Install”.')}</li>
      <li><b>Android</b> ${t('Chrome menu (⋮) → “Install app”. It gets its own icon and keeps playing with the screen off.')}</li>
      <li><b>iPhone · iPad</b> ${t('Open in Safari → Share button → “Add to Home Screen”.')}</li>
      <li><b>Smart TV · Fire TV · Apple TV</b> ${t('Open your TV browser (or cast from your phone) and go to the same web address. Turn on “TV mode” in Appearance.')}</li>
      <li><b>Smartwatch</b> ${t('Start music on your phone; the lock-screen controls appear on Apple Watch and Wear OS automatically.')}</li>
    </ul>
  </div>`;
}

function ChangePassword({ onClose }) {
  const [f, setF] = useState({ old: '', next: '' });
  const [busy, setBusy] = useState(false);
  const user = app.get().user;
  return html`<${Modal} title=${t('Change password')} onClose=${onClose}>
    <form class="stack" onSubmit=${async (e) => {
      e.preventDefault();
      if (f.next.length < 8) return toast(t('Use at least 8 characters for your password.'), { kind: 'warn' });
      setBusy(true);
      try { await post('/api/auth/password', { oldKey: await deriveKey(user.username, f.old), newKey: await deriveKey(user.username, f.next) }); toast(t('Password changed. Other devices were signed out.'), { kind: 'ok' }); onClose(); } catch (err) { toast(err.message, { kind: 'error' }); } finally { setBusy(false); }
    }}>
      <input class="input" type="password" placeholder=${t('Current password')} autocomplete="current-password" value=${f.old} onInput=${(e) => setF({ ...f, old: e.target.value })} required />
      <input class="input" type="password" placeholder=${t('New password')} autocomplete="new-password" value=${f.next} onInput=${(e) => setF({ ...f, next: e.target.value })} required />
      <button class="btn primary" disabled=${busy}>${busy ? html`<${Spinner} size=${16} />` : null} ${t('Change password')}</button>
    </form><//>`;
}

function Invites() {
  const d = useAsync(() => get('/api/invites').catch(() => ({ invites: [] })), []);
  const [days, setDays] = useState(14);
  const [uses, setUses] = useState(1);
  const make = async () => { await post('/api/invites', { days, maxUses: uses }); d.reload(); };
  const link = (code) => `${location.origin}/#/join/${code}`;
  return html`<div>
    <div class="row gap wrap"><label class="field inline"><span>${t('Valid for')}</span><select class="select" value=${days} onChange=${(e) => setDays(+e.target.value)}>${[1, 7, 14, 30, 90].map((n) => html`<option value=${n}>${n} ${t('days')}</option>`)}</select></label>
      <label class="field inline"><span>${t('Number of friends')}</span><select class="select" value=${uses} onChange=${(e) => setUses(+e.target.value)}>${[1, 2, 5, 10, 25].map((n) => html`<option value=${n}>${n}</option>`)}</select></label>
      <button class="btn primary" onClick=${make}><${Icon} name="plus" size=${18} /> ${t('Create invite link')}</button></div>
    ${(d.data?.invites || []).map((i) => html`<div class="invite">
      <div><b class="mono">${i.code}</b><small>${i.uses}/${i.max_uses} ${t('used')} · ${i.expires_at ? `${t('expires')} ${new Date(i.expires_at).toLocaleDateString()}` : ''}</small></div>
      <button class="btn sm" onClick=${async () => { try { await navigator.clipboard.writeText(link(i.code)); toast(t('Invite link copied. Send it to your friend!'), { kind: 'ok' }); } catch { prompt(t('Copy this link'), link(i.code)); } }}><${Icon} name="link" size=${14} /> ${t('Copy link')}</button>
      ${navigator.share ? html`<button class="btn sm ghost" onClick=${() => navigator.share({ title: 'Join me on Nexora', text: 'Ad-free music for our circle. Join with this link:', url: link(i.code) }).catch(() => {})}>${t('Share')}</button>` : null}
      <${IconBtn} icon="trash" label=${t('Delete')} size=${16} onClick=${async () => { await del(`/api/invites/${i.code}`); d.reload(); }} />
    </div>`)}
    ${!d.data?.invites?.length ? html`<p class="muted">${t('No invites yet. Create one and send the link to a friend; they open it, choose a username and password, and they are in.')}</p>` : null}
  </div>`;
}

export function SettingsView({ route }) {
  const prefs = useStore(app, (s) => s.prefs);
  const user = useStore(app, (s) => s.user);
  const cfg = useStore(app, (s) => s.config);
  const [pw, setPw] = useState(false);
  const [diag, setDiag] = useState(false);
  const dl = useStore(lib, (s) => s.downloads);
  const [storage, setStorage] = useState(null);
  const [name, setName] = useState(user?.displayName || '');
  useEffect(() => { navigator.storage?.estimate?.().then(setStorage).catch(() => {}); }, [dl.size]);
  useEffect(() => { const s = route.parts[1]; if (s) setTimeout(() => document.getElementById(`set-${s}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); }, [route.parts[1]]);
  const set = (p) => { setPrefs(p); if (p.theme !== undefined || p.tv !== undefined) applyTheme(); };
  const canInvite = isAdmin() || cfg.membersCanInvite;

  return html`<div class="view-pad settings">
    <h1 class="page-title">${t('Settings')}</h1>
    <div class="set-layout">
      <nav class="set-nav">${[['account', 'user', 'Account'], ['install', 'download', 'Install'], ['sound', 'sliders', 'Sound'], ['voice', 'mic', 'Voice'], ['language', 'globe', 'Language'], ['devices', 'devices', 'Devices'], ['downloads', 'offline', 'Offline'], ['invite', 'users', 'Invite friends'], ['look', 'sun', 'Appearance'], ['about', 'info', 'About']].map(([k, i, l]) => html`<a href=${`#/settings/${k}`}><${Icon} name=${i} size=${18} /> ${t(l)}</a>`)}</nav>
      <div class="set-main">
        <${Section} id="account" title=${t('Account')} icon="user">
          <div class="profile"><${Avatar} user=${user} size=${64} /><div><b>${user.displayName}</b><small>@${user.username} · ${user.role === 'admin' ? t('Owner') : t('Member')}</small></div></div>
          <${Row} label=${t('Display name')}><div class="row-form"><input class="input" value=${name} onInput=${(e) => setName(e.target.value)} maxlength="40" /><button class="btn" disabled=${!name.trim() || name === user.displayName} onClick=${async () => { const r = await patch('/api/me', { displayName: name.trim() }); app.set({ user: { ...user, ...r.user } }); toast(t('Saved'), { kind: 'ok' }); }}>${t('Save')}</button></div><//>
          <${Row} label=${t('Colour')}><input type="range" min="0" max="359" value=${user.hue} class="hue" onChange=${async (e) => { const r = await patch('/api/me', { hue: +e.target.value }); app.set({ user: { ...user, ...r.user } }); }} /><//>
          <${Row} label=${t('Share what I am listening to')} hint=${t('Friends you follow can see your current song.')}><${Toggle} checked=${user.shareActivity} onChange=${async (v) => { const r = await patch('/api/me', { shareActivity: v }); app.set({ user: { ...user, ...r.user } }); }} /><//>
          <${Row} label=${t('Password')}><button class="btn" onClick=${() => setPw(true)}>${t('Change password')}</button><//>
          <${Row} label=${t('Sign out')} hint=${t('Only on this device.')}><button class="btn ghost" onClick=${() => window.dispatchEvent(new Event('nexora:logout'))}><${Icon} name="logout" size=${16} /> ${t('Sign out')}</button><//>
          ${isAdmin() ? html`<${Row} label=${t('Owner console')} hint=${t('Users, catalogue agent, sign-up rules.')}><button class="btn" onClick=${() => nav('/admin')}>${t('Open')}</button><//>` : null}
        <//>

        <${Section} id="install" title=${t('Install on every device')} icon="download" hint=${t('Nexora is a web app that installs like a native one: no store, no download file, one tap.')}><${InstallCard} /><//>

        <${Section} id="sound" title=${t('Sound')} icon="sliders"><${StudioPanel} />
          <${Row} label=${t('Autoplay similar songs')} hint=${t('When your queue ends, Nexora keeps going with songs like the last one.')}><${Toggle} checked=${prefs.autoplay !== false} onChange=${(v) => setPrefs({ autoplay: v })} /><//>
          ${!cfg.youtube ? html`<${Row} label=${t('Show 30-second previews')} hint=${t('Nexora is full songs only. Hit songs from the big labels are only available as 30-second previews; switch this on to see them too.')}><${Toggle} checked=${!!prefs.previews} onChange=${(v) => setPrefs({ previews: v })} /><//>` : null}
          ${cfg.youtube ? html`<${Row} label=${t('Full songs from YouTube automatically')} hint=${t('When a song is only a 30-second preview, play the full song in YouTube’s own player instead. YouTube may show its own ads, and phones may pause it when the screen is off.')}><${Toggle} checked=${!!prefs.ytAuto} onChange=${(v) => setPrefs({ ytAuto: v })} /><//>` : null}
          <${Row} label=${t('Hide explicit songs')}><${Toggle} checked=${!!prefs.hideExplicit} onChange=${(v) => setPrefs({ hideExplicit: v })} /><//>
        <//>

        <${Section} id="voice" title=${t('Voice assistant')} icon="mic" hint=${voiceSupported ? t('Tap the mic anywhere and speak naturally. Your browser turns speech into text; Nexora never receives audio.') : t('This browser has no speech recognition (Firefox). Use Chrome, Edge or Safari for voice, or type commands in the assistant box.')}>
          <${Row} label=${t('Speak to Nexora in')}><select class="select" value=${prefs.voiceLang} onChange=${(e) => setPrefs({ voiceLang: e.target.value })}>${VOICE_LANGS.map(([c, n]) => html`<option value=${c}>${n}</option>`)}</select><//>
          <${Row} label=${t('Spoken replies')} hint=${t('Nexora answers out loud, e.g. “Playing Blinding Lights”.')}><${Toggle} checked=${prefs.voiceReplies} onChange=${(v) => { setPrefs({ voiceReplies: v }); if (v) speak(t('Spoken replies are on.')); }} /><//>
          <${Row} label=${t('Hey Nexora (hands-free)')} hint=${t('Listens for the wake word while Nexora is open on screen. Uses the microphone continuously.')}><${Toggle} checked=${!!prefs.wake} onChange=${(v) => { setPrefs({ wake: v }); v ? startWake() : stopWake(); }} /><//>
        <//>

        <${Section} id="language" title=${t('Language & region')} icon="globe">
          <${Row} label=${t('App language')}><select class="select" value=${prefs.lang} onChange=${async (e) => { await setLanguage(e.target.value); setPrefs({ lang: e.target.value }); app.set({ route: { ...route } }); }}>${UI_LANGS.map(([c, n]) => html`<option value=${c}>${n}</option>`)}</select><//>
          <${Row} label=${t('Region for charts')} hint=${t('Decides which country’s charts you see first.')}><select class="select" value=${prefs.country} onChange=${(e) => setPrefs({ country: e.target.value })}>${REGIONS.map((c) => html`<option value=${c}>${c || t('Automatic')}</option>`)}</select><//>
          <${Row} label=${t('Music languages I follow')} hint=${t('These get their own shelves on Home.')}><div class="chips">${LANGUAGES.map(([c, n, native]) => html`<button class=${cx('chip', (prefs.contentLangs || []).includes(c) && 'on')} onClick=${() => setPrefs({ contentLangs: (prefs.contentLangs || []).includes(c) ? prefs.contentLangs.filter((x) => x !== c) : [...(prefs.contentLangs || []), c] })}>${native}</button>`)}</div><//>
        <//>

        <${Section} id="devices" title=${t('Your devices')} icon="devices"><${DevicesPanel} /><//>

        <${Section} id="downloads" title=${t('Offline & storage')} icon="offline">
          <${Row} label=${t('Downloaded songs')} hint=${`${nSongs(dl.size)} · ${fmtBytes(offline.totalBytes())}${storage?.quota ? ` · ${fmtBytes(storage.usage)} / ${fmtBytes(storage.quota)} ${t('browser storage used')}` : ''}`}><button class="btn" onClick=${() => nav('/library/downloads')}>${t('Manage')}</button><//>
          <${Row} label=${t('Clear everything on this device')} hint=${t('Removes downloads and the saved queue. Your account and playlists stay safe in the cloud.')}><button class="btn ghost danger" onClick=${async () => { if (!confirm(t('Remove all downloads and local data from this device?'))) return; await offline.clearAll(); try { localStorage.removeItem('nx.queue'); localStorage.removeItem('nx.recent'); } catch { /* ignore */ } const regs = await navigator.serviceWorker?.getRegistrations?.(); for (const r of regs || []) await r.unregister(); const keys = await caches?.keys?.(); for (const k of keys || []) await caches.delete(k); toast(t('Cleared'), { kind: 'ok' }); }}>${t('Clear')}</button><//>
        <//>

        ${canInvite ? html`<${Section} id="invite" title=${t('Invite friends')} icon="users" hint=${t('Nexora is a private circle. Friends need an invite link to join.')}><${Invites} /><//>` : null}

        <${Section} id="look" title=${t('Appearance')} icon="sun">
          <${Row} label=${t('Theme')}><div class="seg">${[['dark', 'Dark'], ['light', 'Light'], ['system', 'System']].map(([k, l]) => html`<button class=${cx(prefs.theme === k && 'on')} onClick=${() => set({ theme: k })}>${t(l)}</button>`)}</div><//>
          <${Row} label=${t('TV mode')} hint=${t('Bigger text and controls for TVs and across-the-room use. Navigate with the arrow keys or a remote.')}><${Toggle} checked=${!!prefs.tv} onChange=${(v) => set({ tv: v })} /><//>
        <//>

        <${Section} id="about" title=${t('About Nexora')} icon="info">
          <${Row} label=${t('Check this device')} hint=${t('Finds out why something (sound, microphone, offline, install) may not work here.')}><button class="btn" onClick=${() => setDiag(true)}>${t('Run check')}</button><//>
          <${Row} label=${t('Quick tour')}><button class="btn ghost" onClick=${showTour}>${t('Show again')}</button><//>
          <p class="muted">${t('Nexora streams full songs only from sources that allow it (artist-uploaded music, Creative Commons and public-domain recordings, public radio) and 30-second previews from Apple for discovery. It never copies music from services that don’t permit it.')}</p>
          <p class="muted tiny">Audius · Jamendo · Internet Archive · Radio Browser · LRCLIB · Apple iTunes Search API</p>
        <//>
      </div>
    </div>
    ${pw ? html`<${ChangePassword} onClose=${() => setPw(false)} />` : null}
    ${diag ? html`<${Diagnostics} onClose=${() => setDiag(false)} />` : null}
  </div>`;
}

// ------------------------------------------------------------------ friends
export function FriendsView() {
  const people = useStore(lib, (s) => s.people);
  useEffect(() => { refreshPeople(); const iv = setInterval(refreshPeople, 30000); return () => clearInterval(iv); }, []);
  const cfg = useStore(app, (s) => s.config);
  const live = people.filter((p) => p.nowPlaying);
  return html`<div class="view-pad narrow">
    <h1 class="page-title">${t('Your circle')}</h1>
    ${isAdmin() || cfg.membersCanInvite ? html`<div class="note-card"><${Icon} name="users" size=${20} /><div><b>${t('Invite more friends')}</b><p>${t('Create an invite link and send it on WhatsApp, Telegram or text.')}</p></div><button class="btn primary" onClick=${() => nav('/settings/invite')}>${t('Invite')}</button></div>` : null}
    ${live.length ? html`<h2 class="sec">${t('Listening now')}</h2>${live.map((p) => html`<div class="person"><${Avatar} user=${{ displayName: p.displayName, hue: p.hue }} size=${48} /><div class="grow"><b>${p.displayName}</b><small class="np-line"><${Icon} name="wave" size=${13} /> ${p.nowPlaying.title} · ${p.nowPlaying.artist}</small></div></div>`)}` : null}
    <div class="note-card"><${Icon} name="users" size=${20} /><div><b>${t('Listen together')}</b><p>${t('Start a room and hear the same songs at the same time as a friend.')}</p></div><button class="btn primary" onClick=${() => ui.set({ panel: 'together' })}>${t('Open')}</button></div>
    <h2 class="sec">${t('Everyone')}</h2>
    ${people.length ? people.map((p) => html`<div class="person"><${Avatar} user=${{ displayName: p.displayName, hue: p.hue }} size=${48} /><div class="grow"><b>${p.displayName}</b><small>@${p.username}</small></div>
      <button class=${cx('btn sm', p.following ? 'ghost' : 'primary')} onClick=${() => follow(p)}>${p.following ? t('Following') : t('Follow')}</button></div>`)
      : html`<${Empty} icon="users" title=${t('It is just you for now')} text=${t('Invite your friends and you will see what everyone is playing.')} />`}
  </div>`;
}

// ------------------------------------------------------------------ owner console
/** Replace the audio behind a recording (or fix its details, or withdraw it) without breaking playlists, likes or history. */
/** Sign-in requests: people who asked for access wait here until you approve them. */
function Requests({ count, onChange }) {
  const d = useAsync(() => get('/api/admin/requests'), [count]);
  const act = async (r, what) => {
    try { await post(`/api/admin/requests/${r.id}/${what}`, {}); toast(what === 'approve' ? `${r.display_name} can now sign in` : `Declined ${r.display_name}`, { kind: 'ok' }); d.reload(); onChange(); } catch (e) { toast(e.message, { kind: 'error' }); }
  };
  const list = d.data?.requests || [];
  return html`<section class="set-sec" id="requests"><h2><${Icon} name="users" size=${20} /> ${t('Sign-in requests')}${list.length ? html` <span class="chip sm on">${list.length}</span>` : null}</h2>
    ${!list.length ? html`<p class="muted">${t('Nobody is waiting. When someone asks for access, you get a ticket here (and a phone alert if you set one up below).')}</p>` : null}
    ${list.map((r) => html`<div class="person"><${Avatar} user=${{ displayName: r.display_name, hue: r.hue }} size=${44} /><div class="grow"><b>${r.display_name}</b> <small>@${r.username} · ${timeAgo(r.created_at)}</small>${r.message ? html`<small>“${r.message}”</small>` : null}</div>
      <button class="btn sm primary" onClick=${() => act(r, 'approve')}>${t('Approve')}</button><button class="btn sm ghost danger" onClick=${() => act(r, 'reject')}>${t('Decline')}</button></div>`)}
  </section>`;
}

function AssetUpdates() {
  const log = useAsync(() => get('/api/admin/assets'), []);
  const [f, setF] = useState({ action: 'UpdateAsset', ref: '', audioUrl: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });
  const submit = async (e) => {
    e.preventDefault();
    const ref = f.ref.trim();
    const body = { action: f.action, ...(/^[a-z]+:/i.test(ref) ? { id: ref } : { isrc: ref }), audioUrl: f.audioUrl.trim(), reason: f.reason.trim() };
    setBusy(true);
    try { const r = await post('/api/admin/assets', body); toast(`${f.action}: ${r.updated.map((u) => `${u.id} → v${u.rev}`).join(', ')}`, { kind: 'ok' }); setF({ ...f, ref: '', audioUrl: '', reason: '' }); log.reload(); } catch (err) { toast(err.message, { kind: 'error' }); } finally { setBusy(false); }
  };
  return html`<section class="set-sec"><h2><${Icon} name="disc" size=${20} /> ${t('Asset updates')}</h2>
    <p class="muted">${t('Every recording keeps one permanent id (and its ISRC when known). When its audio is replaced, the id stays, the version number goes up, playlists and likes keep working, and devices that saved an older copy refresh it.')}</p>
    <form class="stack" onSubmit=${submit}>
      <div class="row gap wrap">
        <select class="select" value=${f.action} onChange=${(e) => set('action', e.target.value)}>
          <option value="UpdateAsset">${t('Replace the audio (UpdateAsset)')}</option><option value="TakeDown">${t('Withdraw the recording (TakeDown)')}</option>
        </select>
        <input class="input mono grow" placeholder=${t('Track id (audius:123…) or ISRC (USUM71500001)')} value=${f.ref} onInput=${(e) => set('ref', e.target.value)} />
      </div>
      ${f.action === 'UpdateAsset' ? html`<input class="input mono" placeholder="https://… new audio file" value=${f.audioUrl} onInput=${(e) => set('audioUrl', e.target.value)} />` : html`<input class="input" placeholder=${t('Reason (optional)')} value=${f.reason} onInput=${(e) => set('reason', e.target.value)} />`}
      <div><button class="btn primary" type="submit" disabled=${busy || !f.ref.trim() || (f.action === 'UpdateAsset' && !f.audioUrl.trim())}>${busy ? html`<${Spinner} size=${16} />` : null} ${t('Send update')}</button></div>
    </form>
    <div class="table"><div class="tr head"><span>${t('When')}</span><span>${t('Action')}</span><span>${t('Track')}</span><span>ISRC</span><span>${t('Version')}</span></div>
      ${(log.data?.log || []).map((r) => html`<div class="tr"><span>${timeAgo(r.at)}</span><span>${r.action}</span><span title=${r.detail}>${r.title ? `${r.title} · ${r.artist}` : r.track_id}</span><span>${r.isrc || '–'}</span><span>v${r.rev}</span></div>`)}
      ${log.data && !log.data.log.length ? html`<p class="muted pad">${t('No updates yet.')}</p>` : null}</div>
  </section>`;
}

export function AdminView() {
  const d = useAsync(() => get('/api/admin/overview'), []);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(null);
  const [ytKey, setYtKey] = useState(null);
  const [topic, setTopic] = useState(null);
  if (!isAdmin()) return html`<${Empty} icon="lock" title=${t('Owner only')} />`;
  if (d.loading) return html`<div class="view-pad center"><${Spinner} size=${28} /></div>`;
  if (d.error) return html`<div class="view-pad"><${Empty} icon="info" title=${d.error.message} /></div>`;
  const o = d.data;
  const run = async (count) => { setBusy(true); try { const r = await post('/api/admin/ingest', { count }); toast(r.runs.map((x) => `${x.task}: +${x.accepted}`).join(' · '), { kind: 'ok' }); d.reload(); } catch (e) { toast(e.message, { kind: 'error' }); } finally { setBusy(false); } };
  const save = async (body) => { await put('/api/admin/settings', body); toast(t('Saved'), { kind: 'ok' }); d.reload(); };
  return html`<div class="view-pad">
    <h1 class="page-title">${t('Owner console')}</h1>
    <div class="stats">
      <div class="stat"><b>${o.users}</b><small>${t('people')}</small></div>
      <div class="stat"><b>${o.verified}</b><small>${t('verified tracks')}</small></div>
      <div class="stat"><b>${o.tracks}</b><small>${t('tracks known')}</small></div>
      <div class="stat"><b>${fmtBytes(o.uploadBytes)}</b><small>${t('in lockers')}</small></div>
    </div>

    <section class="set-sec"><h2><${Icon} name="sparkle" size=${20} /> ${t('Catalogue agent')}</h2>
      <p class="muted">${t('Every 2 minutes Nexora pulls the best, the newest and the oldest full-length music from licensed and open sources, checks each track (licence, secure stream, duration, spam patterns), tags language and mood, and adds it to your database. Nothing to do: it keeps itself up to date.')} ${o.settings.ai ? t('AI tagging is on.') : t('AI tagging is off (optional, see README).')}</p>
      <div class="row gap"><button class="btn primary" disabled=${busy} onClick=${() => run(1)}>${busy ? html`<${Spinner} size=${16} />` : html`<${Icon} name="bolt" size=${16} />`} ${t('Run now')}</button><button class="btn ghost" disabled=${busy} onClick=${() => run(3)}>${t('Run 3 tasks')}</button></div>
      <div class="table"><div class="tr head"><span>${t('When')}</span><span>${t('Task')}</span><span>${t('Found')}</span><span>${t('Accepted')}</span><span>${t('Rejected')}</span></div>
        ${o.runs.map((r) => html`<div class="tr"><span>${timeAgo(r.started_at)}</span><span>${r.task}</span><span>${r.fetched}</span><span>${r.accepted}</span><span title=${r.note}>${r.rejected}${r.note ? ' ⓘ' : ''}</span></div>`)}
        ${!o.runs.length ? html`<p class="muted pad">${t('Nothing yet. Press Run now.')}</p>` : null}</div>
    </section>

    <${Requests} count=${o.requests} onChange=${() => { d.reload(); app.set({ pending: Math.max(0, (app.get().pending || 1) - 1) }); }} />

    <${AssetUpdates} />

    <section class="set-sec"><h2><${Icon} name="lock" size=${20} /> ${t('Sign-up & sources')}</h2>
      <${Row} label=${t('Who can join')} hint=${t('“Ask first” lets anyone request access; you approve each person. Invite links always let a friend straight in.')}><div class="seg">${[['approval', 'Ask first'], ['invite', 'Invite only'], ['open', 'Anyone']].map(([k, l]) => html`<button class=${cx(o.settings.signupMode === k && 'on')} onClick=${() => save({ signupMode: k })}>${t(l)}</button>`)}</div><//>
      <${Row} label=${t('Phone alert for new requests')} hint=${t('Free, no account: install the “ntfy” app, subscribe to this name, and every request pops up on your phone.')}>
        <div class="row-form"><input class="input mono" value=${topic ?? o.settings.notifyTopic} onInput=${(e) => setTopic(e.target.value)} placeholder="nexora-${'x'.repeat(12)}" />
          <button class="btn" onClick=${() => setTopic(`nexora-${[...crypto.getRandomValues(new Uint8Array(12))].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('')}`)}>${t('Make one')}</button>
          <button class="btn" disabled=${topic === null} onClick=${async () => { await save({ notifyTopic: (topic || '').trim() }); setTopic(null); }}>${t('Save')}</button>
          <button class="btn ghost" disabled=${!o.settings.notifyTopic} onClick=${async () => { try { await post('/api/admin/notify-test', {}); toast(t('Test alert sent'), { kind: 'ok' }); } catch (e) { toast(e.message, { kind: 'error' }); } }}>${t('Send test')}</button></div><//>
      <${Row} label=${t('Members can invite')}><label class="switch"><input type="checkbox" checked=${o.settings.membersCanInvite} onChange=${(e) => save({ membersCanInvite: e.target.checked })} /><i></i></label><//>
      <${Row} label="Jamendo client ID" hint=${t('Optional and free. Adds ~600k Creative-Commons songs. Get one at devportal.jamendo.com.')}>
        <div class="row-form"><input class="input mono" value=${key ?? o.settings.jamendoKey} onInput=${(e) => setKey(e.target.value)} placeholder="a1b2c3d4" /><button class="btn" onClick=${() => save({ jamendoKey: (key ?? o.settings.jamendoKey).trim() })}>${t('Save')}</button></div><//>
      <${Row} label="YouTube API key" hint=${t('Optional and free. Lets people play the full version of a preview song inside YouTube’s own player (YouTube may show ads). Create the key in the Google Cloud console and enable “YouTube Data API v3”.')}>
        <div class="row-form"><input class="input mono" type="password" value=${ytKey ?? ''} onInput=${(e) => setYtKey(e.target.value)} placeholder=${o.settings.youtube ? t('A key is saved. Paste a new one to replace it.') : 'AIza...'} autocomplete="off" />
          <button class="btn" disabled=${ytKey === null} onClick=${async () => { await save({ youtubeKey: ytKey.trim() }); setYtKey(null); }}>${t('Save')}</button>
          ${o.settings.youtube ? html`<button class="btn ghost" onClick=${() => save({ youtubeKey: '' })}>${t('Remove')}</button>` : null}</div><//>
      <${Row} label=${t('Cloud locker (R2)')}><span class=${cx('chip sm', o.settings.locker && 'on')}>${o.settings.locker ? t('On') : t('Off')}</span><//>
    </section>

    <section class="set-sec"><h2><${Icon} name="users" size=${20} /> ${t('People')}</h2>
      ${o.people.map((p) => html`<div class="person"><${Avatar} user=${{ displayName: p.display_name }} size=${40} /><div class="grow"><b>${p.display_name}</b> ${p.role === 'admin' ? html`<span class="chip sm">${t('Owner')}</span>` : null}<small>@${p.username} · ${p.devices} ${t('devices')} · ${t('joined')} ${timeAgo(p.created_at)}</small></div>
        ${p.role !== 'admin' ? html`<button class="btn sm ghost" onClick=${async () => { const r = await post(`/api/admin/users/${p.id}/reset`); prompt(`${t('Give this one-time code to')} ${p.display_name} (${t('valid 24 hours')}). ${t('They tap “Forgot password?” on the sign-in screen.')}`, r.code); }}>${t('Reset password')}</button><button class="btn sm ghost danger" onClick=${async () => { if (confirm(`${t('Remove')} ${p.display_name} ${t('and all their data?')}`)) { await del(`/api/admin/users/${p.id}`); d.reload(); } }}>${t('Remove')}</button>` : null}</div>`)}
    </section>
  </div>`;
}

const Row2 = Row;
