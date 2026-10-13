// SABA service worker: web push only. No fetch handler or offline cache — the app needs the network.

const ICON = '/pwa-icon/192';
const BADGE = '/pwa-icon/badge'; // transparent glyph, so Android's monochrome badge isn't a blank square

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Payload is PushPayload from src/server/push.ts: { title, body, url?, actions?: { action, title, token }[] }.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data.json() || {};
  } catch {
    // No payload or not JSON: Chrome still expects a notification, so fall back to a generic one.
  }
  const title = data.title || 'SABA';
  const actions = Array.isArray(data.actions) ? data.actions : [];
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: ICON,
      badge: BADGE,
      // Same title (a re-sent reminder, the next brief) replaces the old one; renotify still alerts.
      tag: title,
      renotify: true,
      data: { url: data.url || '/chat', actions },
      actions: actions.map(({ action, title }) => ({ action, title })),
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url = '/chat', actions = [] } = event.notification.data || {};
  const picked = event.action && actions.find((a) => a.action === event.action);
  event.waitUntil(picked ? act(picked) : focusOrOpen(url));
});

// Done / Snooze buttons: the signed token is the auth, same endpoint as the email buttons.
async function act({ action, token }) {
  const res = await fetch('/api/tasks/act', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ token }),
  }).catch(() => null);
  // Never confirm what didn't happen: a silently failed snooze is a missed reminder.
  const title = !res?.ok
    ? "Couldn't update the reminder — tap to open SABA"
    : action === 'snooze' ? '💤 Snoozed 15 min' : '✓ Done';
  return self.registration.showNotification(title, { icon: ICON, badge: BADGE, tag: 'saba-ack' });
}

// matchAll only returns same-origin windows, so any match is an app window.
async function focusOrOpen(url) {
  const [win] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (!win) return self.clients.openWindow(url);
  await win.focus();
  // navigate() reloads the page and the open chat lives in memory, so only when it's elsewhere.
  // It rejects for uncontrolled windows; focusing is then all we can do.
  if (win.url !== new URL(url, self.location.origin).href) await win.navigate(url).catch(() => {});
}
