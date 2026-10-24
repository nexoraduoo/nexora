// Listen together: the room panel (start / join / members) and the invite-link landing page.
import { html, useState, useStore, useAsync } from '../lib.js';
import { Icon } from '../icons.js';
import { app, nav, toast, ui } from '../state.js';
import { api } from '../api.js';
import { Avatar, Empty, Spinner } from '../ui.js';
import * as together from '../together.js';
import { t } from '../i18n.js';

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast(t('Link copied'), { kind: 'ok' }); } catch { prompt(t('Copy this link'), text); }
}

export function TogetherPanel() {
  const r = useStore(together.room);
  const user = useStore(app, (s) => s.user);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { toast(e.message, { kind: 'error' }); } finally { setBusy(false); } };

  if (!r.code) {
    return html`<div class="together">
      <div class="together-hero"><${Icon} name="users" size=${30} /><h3>${t('Listen together')}</h3>
        <p class="muted">${t('Start a room and send the link to a friend. You both hear the same song at the same moment, and anyone in the room can pick what plays next.')}</p></div>
      <button class="btn primary wide" disabled=${busy} onClick=${() => run(() => together.start())}>${busy ? html`<${Spinner} size=${16} />` : html`<${Icon} name="plus" size=${18} />`} ${t('Start a listening room')}</button>
      <form class="row-form" onSubmit=${(e) => { e.preventDefault(); run(() => together.join(code)); }}>
        <input class="input mono" placeholder=${t('Room code')} value=${code} maxlength="6" onInput=${(e) => setCode(e.target.value.toUpperCase())} />
        <button class="btn" type="submit" disabled=${busy || code.length < 6}>${t('Join')}</button>
      </form>
    </div>`;
  }

  return html`<div class="together">
    <div class="together-code">
      <small>${r.connected ? t('Listening together') : t('Reconnecting…')}</small>
      <b class="mono">${r.code}</b>
      <div class="row gap wrap center">
        <button class="btn sm" onClick=${() => copy(together.roomLink())}><${Icon} name="link" size=${14} /> ${t('Copy invite link')}</button>
        ${navigator.share ? html`<button class="btn sm ghost" onClick=${() => navigator.share({ title: 'Listen with me on Nexora', url: together.roomLink() }).catch(() => {})}>${t('Share')}</button>` : null}
      </div>
    </div>
    <h4 class="muted">${t('In the room')} · ${r.members.length}</h4>
    ${r.members.map((m) => html`<div class="person"><${Avatar} user=${{ displayName: m.name, hue: m.hue }} size=${36} /><div class="grow"><b>${m.name}${m.id === user?.id ? ` (${t('you')})` : ''}</b>${m.host ? html`<small>${t('Host')}</small>` : null}</div></div>`)}
    <p class="muted tiny">${t('Everyone can play, pause, skip and add songs. Your own volume stays yours.')}</p>
    <div class="row gap wrap">
      <button class="btn ghost" onClick=${() => together.leave()}>${t('Leave room')}</button>
      ${r.host ? html`<button class="btn ghost danger" onClick=${() => run(() => together.end())}>${t('End for everyone')}</button>` : null}
    </div>
  </div>`;
}

/** Landing page for an invite link: #/together/ABC123 */
export function JoinRoomView({ route }) {
  const code = (route.parts[1] || '').toUpperCase();
  const d = useAsync(() => api('GET', `/api/rooms/${code}`), [code]);
  const [busy, setBusy] = useState(false);
  if (d.loading) return html`<div class="view-pad center"><${Spinner} size=${28} /></div>`;
  if (d.error) return html`<div class="view-pad"><${Empty} icon="users" title=${t('This room has ended')} text=${d.error.message}><button class="btn primary" onClick=${() => nav('/home')}>${t('Back to Home')}</button><//></div>`;
  const go = async () => {
    setBusy(true);
    try { await together.join(code); nav('/home', true); ui.set({ panel: 'together' }); } catch (e) { toast(e.message, { kind: 'error' }); } finally { setBusy(false); }
  };
  return html`<div class="view-pad narrow"><${Empty} icon="users" title=${`${d.data.host} ${t('invited you to listen together')}`} text=${t('You will hear the same songs at the same time. You can leave whenever you like.')}>
    <button class="btn primary big" disabled=${busy} onClick=${go}>${busy ? html`<${Spinner} size=${18} />` : null} ${t('Join the room')}</button><//></div>`;
}
