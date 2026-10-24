// Sign in / sign up / reset password.
import { html, useState, useEffect } from '../lib.js';
import { Icon } from '../icons.js';
import { app, local } from '../state.js';
import { api } from '../api.js';
import { deriveKey } from '../shared/kdf.js';
import { t } from '../i18n.js';
import { Spinner } from '../ui.js';
import { UI_LANGS, setLanguage } from '../i18n.js';
import { setPrefs } from '../state.js';

const deviceHint = () => ({
  deviceId: local.read('nx.device', '') || undefined,
  kind: matchMedia('(pointer:coarse)').matches && innerWidth < 700 ? 'phone' : matchMedia('(pointer:coarse)').matches && innerWidth < 1100 ? 'tablet' : undefined,
});

export function AuthView({ route, onDone }) {
  const [cfg, setCfg] = useState(null);
  const inviteFromLink = route.parts[0] === 'join' ? (route.parts[1] || '').toUpperCase() : '';
  const [mode, setMode] = useState(inviteFromLink ? 'signup' : 'login');
  const [f, setF] = useState({ username: '', password: '', display: '', invite: inviteFromLink, code: '', message: '' });
  const [sent, setSent] = useState(null); // set once a request for access has been sent
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [show, setShow] = useState(false);

  useEffect(() => { api('GET', '/api/config').then((c) => { setCfg(c); if (c.firstRun) setMode('signup'); }).catch(() => setCfg({ error: true })); }, []);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const username = f.username.trim().toLowerCase();
    if (mode === 'signup' && !/^[a-z0-9_.]{3,24}$/.test(username)) return setErr(t('Pick a username with 3-24 letters, numbers, dots or underscores.'));
    if (f.password.length < (mode === 'login' ? 1 : 8)) return setErr(t('Use at least 8 characters for your password.'));
    setBusy(true);
    try {
      const key = await deriveKey(username, f.password);
      const device = deviceHint();
      let r;
      if (mode === 'login') r = await api('POST', '/api/auth/login', { username, key, device, deviceId: device.deviceId });
      else if (mode === 'signup') r = await api('POST', '/api/auth/signup', { username, key, displayName: f.display.trim() || username, invite: f.invite.trim(), message: f.message.trim(), device });
      else r = await api('POST', '/api/auth/reset', { username, key, code: f.code.trim(), device });
      if (r.pending) { setSent({ username }); return; }
      local.write('nx.device', r.deviceId);
      await onDone(r.user);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const first = cfg?.firstRun;
  const needInvite = mode === 'signup' && cfg && !first && cfg.signupMode === 'invite';
  const asking = mode === 'signup' && cfg && !first && cfg.signupMode === 'approval' && !f.invite; // no invite: this becomes a request the owner approves
  const title = mode === 'login' ? t('Welcome back') : mode === 'signup' ? (first ? t('Set up Nexora') : t('Create your account')) : t('Reset your password');
  const sub = mode === 'login' ? t('Sign in to pick up your music, playlists and devices.')
    : mode === 'signup' ? (first ? t('You are the first one here, so you will be the owner and can invite your friends.') : t('Join your friends on Nexora. Free, ad-free, every language.'))
      : t('Ask the owner for a one-time reset code, then choose a new password.');

  return html`<div class="auth">
    <section class="auth-hero">
      <div class="auth-brand"><img src="/icons/icon.svg" alt="" width="44" height="44" /><span>NEXORA</span></div>
      <h1>${t('Your music.')}<br /><span class="grad">${t('Every language. Zero ads.')}</span></h1>
      <ul class="auth-points">
        <li><${Icon} name="shield" size=${18} /> ${t('No ads, ever. Full songs from artists and open licences.')}</li>
        <li><${Icon} name="devices" size=${18} /> ${t('One account on every device. Play on all, or move music between them.')}</li>
        <li><${Icon} name="mic" size=${18} /> ${t('Say “Hey Nexora, play something Telugu” and it just happens.')}</li>
        <li><${Icon} name="download" size=${18} /> ${t('Save songs for offline listening and keep playing in the background.')}</li>
      </ul>
      <div class="orbs"><i></i><i></i><i></i></div>
    </section>
    <section class="auth-card">
      ${sent ? html`<div class="auth-sent"><${Icon} name="check" size=${40} /><h2>${t('Request sent')}</h2>
        <p class="muted">${t('The owner has been told. You can sign in as soon as they approve you: use the same username and password.')}</p>
        <button class="btn primary wide" onClick=${() => { setSent(null); setMode('login'); setErr(''); }}>${t('Back to sign in')}</button></div>` : html`<form onSubmit=${submit} autocomplete="on">
        <h2>${title}</h2>
        <p class="muted">${sub}</p>
        ${cfg?.error ? html`<div class="alert">${t('Cannot reach the Nexora server right now.')}</div>` : null}
        ${mode === 'signup' ? html`<label class="field"><span>${t('Your name')}</span><input class="input" value=${f.display} onInput=${set('display')} placeholder="Sai" maxlength="40" autocomplete="name" /></label>` : null}
        <label class="field"><span>${t('Username')}</span><input class="input" value=${f.username} onInput=${set('username')} placeholder="sai_pramod" autocomplete="username" autocapitalize="none" spellcheck="false" required /></label>
        <label class="field"><span>${mode === 'reset' ? t('New password') : t('Password')}</span>
          <div class="pw"><input class="input" type=${show ? 'text' : 'password'} value=${f.password} onInput=${set('password')} autocomplete=${mode === 'login' ? 'current-password' : 'new-password'} required />
            <button type="button" class="iconbtn sm" onClick=${() => setShow(!show)} aria-label=${t('Show password')}><${Icon} name=${show ? 'eyeOff' : 'eye'} size=${16} /></button></div>
        </label>
        ${asking ? html`<label class="field"><span>${t('A short note for the owner (who are you?)')}</span><input class="input" value=${f.message} onInput=${set('message')} placeholder=${t('Hi, I am Ravi from college')} maxlength="200" /></label>` : null}
        ${needInvite ? html`<label class="field"><span>${t('Invite code')}</span><input class="input mono" value=${f.invite} onInput=${(e) => setF((s) => ({ ...s, invite: e.target.value.toUpperCase() }))} placeholder="ABCDE-FGHJK" required /></label>` : null}
        ${mode === 'reset' ? html`<label class="field"><span>${t('Reset code')}</span><input class="input mono" value=${f.code} onInput=${(e) => setF((s) => ({ ...s, code: e.target.value.toUpperCase() }))} placeholder="ABCDE-FGHJK" required /></label>` : null}
        ${err ? html`<div class="alert" role="alert">${err}</div>` : null}
        <button class="btn primary wide" type="submit" disabled=${busy || !cfg}>${busy ? html`<${Spinner} size=${18} /> ${t('Securing your password…')}` : mode === 'login' ? t('Sign in') : mode === 'signup' ? (first ? t('Create owner account') : asking ? t('Ask for access') : t('Create account')) : t('Set new password')}</button>
        <div class="auth-links">
          ${mode !== 'login' ? html`<button type="button" class="link" onClick=${() => { setMode('login'); setErr(''); }}>${t('I already have an account')}</button>` : null}
          ${mode === 'login' && !first ? html`<button type="button" class="link" onClick=${() => { setMode('signup'); setErr(''); }}>${cfg?.signupMode === 'approval' ? t('New here? Ask for access') : t('Join with an invite')}</button>` : null}
          ${mode === 'login' ? html`<button type="button" class="link" onClick=${() => { setMode('reset'); setErr(''); }}>${t('Forgot password?')}</button>` : null}
        </div>
        <p class="tiny muted"><a class="link" href="/install">${t('Install the app on this device')}</a></p>
        <p class="tiny muted"><${Icon} name="lock" size=${12} /> ${t('Your password is scrambled on this device before it is sent; Nexora never sees it.')}</p>
      </form>`}
      <div class="auth-lang"><${Icon} name="globe" size=${16} />
        <select class="select sm" value=${app.get().prefs.lang} onChange=${async (e) => { await setLanguage(e.target.value); setPrefs({ lang: e.target.value }, { sync: false }); app.set({ route: { ...route } }); }}>
          ${UI_LANGS.map(([c, n]) => html`<option value=${c}>${n}</option>`)}
        </select></div>
    </section>
  </div>`;
}
