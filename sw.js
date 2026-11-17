// Web push only (STEP 10). No caching of /api (live data, token-bound). Push payload = {title, body, url}.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = {body: e.data && e.data.text()}; }
  e.waitUntil(self.registration.showNotification(d.title || 'Grok Bot · now', {body: d.body || '', icon: 'icons/icon-192.png', data: {url: d.url}}));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.notification.data && e.notification.data.url) e.waitUntil(self.clients.openWindow(e.notification.data.url));
});
