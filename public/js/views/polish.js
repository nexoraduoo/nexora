// Friendly extras: first-run tour, "Check this device", error screen, offline bar.
import { html, cx, Component, useState, useEffect, useStore, isIOS, isTV, isStandalone } from '../lib.js';
import { Icon } from '../icons.js';
import { app, nav, toast } from '../state.js';
import { Modal, Spinner } from '../ui.js';
import { t } from '../i18n.js';
import { report } from '../diagnose.js';

// ------------------------------------------------------------------ first-run tour
const TOUR_KEY = 'nx.tour';
export const tourSeen = () => { try { return localStorage.getItem(TOUR_KEY) === '1'; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* ignore */ } };

const STEPS = [
  { icon: 'music', title: 'Welcome to Nexora', text: 'Full songs, no ads, no limits. Everything here is free to play: artist uploads, Creative Commons, classics and live radio.' },
  { icon: 'mic', title: 'Just say it', text: 'Tap the microphone and say “play something old in Telugu” or “play the latest Hindi songs”. You can also type it.' },
  { icon: 'devices', title: 'One account, every device', text: 'Sign in on your phone, laptop and TV. Pick a device in the Connect menu and your phone becomes its remote.' },
  { icon: 'users', title: 'Listen together', text: 'Start a room, send the link, and you and your friends hear the same song at the same moment.' },
  { icon: 'offline', title: 'Take it with you', text: 'Tap the download arrow on any song or playlist. It keeps playing with no internet, even with the screen off.' },
];

export function Tour() {
  const user = useStore(app, (s) => s.user);
  const [open, setOpen] = useState(() => !tourSeen());
  const [i, setI] = useState(0);
  useEffect(() => { if (user) setOpen(!tourSeen()); }, [user?.id]);
  if (!user || !open) return null;
  const s = STEPS[i];
  const done = () => { markSeen(); setOpen(false); };
  return html`<${Modal} title=${t('Quick tour')} onClose=${done}>
    <div class="tour">
      <div class="tour-ic"><${Icon} name=${s.icon} size=${42} /></div>
      <h2>${t(s.title)}</h2>
      <p>${t(s.text)}</p>
      <div class="tour-dots">${STEPS.map((_, k) => html`<i class=${cx(k === i && 'on')}></i>`)}</div>
      <div class="row gap between">
        <button class="btn ghost" onClick=${done}>${t('Skip')}</button>
        <div class="row gap">
          ${i > 0 ? html`<button class="btn" onClick=${() => setI(i - 1)}>${t('Back')}</button>` : null}
          <button class="btn primary" onClick=${() => (i < STEPS.length - 1 ? setI(i + 1) : done())}>${i < STEPS.length - 1 ? t('Next') : t('Start listening')}</button>
        </div>
      </div>
    </div>
  <//>`;
}
export const showTour = () => { try { localStorage.removeItem(TOUR_KEY); } catch { /* ignore */ } location.reload(); };

// ------------------------------------------------------------------ check this device
export function Diagnostics({ onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { report().then(setD); }, []);
  const icon = { ok: 'check', warn: 'info', bad: 'x' };
  return html`<${Modal} title=${t('Check this device')} onClose=${onClose} wide>
    ${!d ? html`<div class="center pad"><${Spinner} size=${26} /></div>` : html`
      <div class="diag">
        ${d.checks.map((c) => html`<div class=${cx('diag-row', c.state)}><span class="diag-ic"><${Icon} name=${icon[c.state]} size=${16} /></span><div><b>${t(c.label)}</b><small>${c.detail}</small>${c.fix ? html`<small class="fix">${c.fix}</small>` : null}</div></div>`)}
      </div>
      <div class="row gap wrap" style="margin-top:14px">
        <button class="btn" onClick=${async () => { try { await navigator.clipboard.writeText(d.text); toast(t('Report copied'), { kind: 'ok' }); } catch { prompt(t('Copy this report'), d.text); } }}><${Icon} name="link" size=${14} /> ${t('Copy report')}</button>
        <button class="btn ghost" onClick=${() => { setD(null); report().then(setD); }}>${t('Check again')}</button>
      </div>`}
  <//>`;
}

// ------------------------------------------------------------------ error screen: a crash in one page never blanks the app
export class ErrorFence extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('[nexora] view crashed:', error); }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return html`<div class="view-pad"><div class="empty"><div class="empty-ic"><${Icon} name="info" size=${34} /></div>
      <h3>${t('Something went wrong on this page')}</h3>
      <p>${t('Your music keeps playing. Try again, or go back to Home.')}</p>
      <div class="row gap center"><button class="btn primary" onClick=${() => this.setState({ error: null })}>${t('Try again')}</button><button class="btn" onClick=${() => { this.setState({ error: null }); nav('/home'); }}>${t('Home')}</button></div>
      <small class="muted tiny">${String(this.state.error?.message || this.state.error).slice(0, 160)}</small></div></div>`;
  }
}

// ------------------------------------------------------------------ offline bar
export function OfflineBar() {
  const online = useStore(app, (s) => s.online);
  if (online) return null;
  return html`<div class="banner offline-bar"><span><${Icon} name="offline" size=${15} /> ${t('You are offline. Downloaded songs still play.')}</span><button class="btn sm" onClick=${() => nav('/library/downloads')}>${t('Open downloads')}</button></div>`;
}

// ------------------------------------------------------------------ install hint (Android/desktop one-tap, iPhone steps)
const HINT_KEY = 'nx.installHint';
const hintDismissed = () => { try { return Date.now() - Number(localStorage.getItem(HINT_KEY) || 0) < 30 * 864e5; } catch { return true; } };

export function InstallHint() {
  const evt = useStore(app, (s) => s.installEvt);
  const [gone, setGone] = useState(hintDismissed);
  if (gone || isStandalone() || isTV || (!evt && !isIOS)) return null;
  const close = () => { try { localStorage.setItem(HINT_KEY, String(Date.now())); } catch { /* ignore */ } setGone(true); };
  return html`<div class="banner install-hint">
    <span><${Icon} name="download" size=${15} /> ${evt ? t('Install Nexora for background play and a home-screen icon.') : t('On iPhone: tap Share, then “Add to Home Screen”, so music keeps playing with the screen off.')}</span>
    <span class="row gap">
      ${evt ? html`<button class="btn sm primary" onClick=${async () => { evt.prompt(); try { await evt.userChoice; } catch { /* ignore */ } app.set({ installEvt: null }); close(); }}>${t('Install')}</button>` : null}
      <button class="btn sm ghost" onClick=${close}>${t('Not now')}</button>
    </span>
  </div>`;
}
