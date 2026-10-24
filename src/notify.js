// Phone alerts for the owner, free and with no account: ntfy.sh. The owner installs the free "ntfy" app, subscribes to a
// private topic name (made in the Owner console), and every sign-in request pops up as a notification.

import { getSetting } from './auth.js';

export const TOPIC_RE = /^[A-Za-z0-9_-]{16,64}$/;

export async function notifyOwner(c, title, body) {
  const topic = await getSetting(c.env, 'notify_topic');
  if (!topic || !TOPIC_RE.test(topic)) return false;
  const send = fetch(`https://ntfy.sh/${topic}`, {
    method: 'POST',
    headers: { Title: title.slice(0, 120), Priority: 'high', Tags: 'bell', Click: `${c.url.origin}/#/admin` },
    body: body.slice(0, 400),
  }).catch(() => {});
  if (c.ctx?.waitUntil) c.ctx.waitUntil(send); else await send;
  return true;
}
