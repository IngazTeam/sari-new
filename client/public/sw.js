// Notification-only worker. It neither intercepts requests nor manages app caches.
const dashboard = '/merchant/dashboard';
function notificationUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 500 || /[\u0000-\u0020\u007f\\]/.test(raw)) return new URL(dashboard, self.location.origin).href;
  try {
    const url = new URL(raw, self.location.origin);
    if (url.origin === self.location.origin && !url.username && !url.password && !url.hash
      && /^\/merchant(?:\/[a-z0-9_-]+)*\/?$/.test(url.pathname)) return url.href;
  } catch {}
  return new URL(dashboard, self.location.origin).href;
}
const shortText = (value, fallback, limit) => typeof value === 'string' && value.trim()
  ? value.slice(0, limit) : fallback;
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {};
  try {
    const parsed = event.data?.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
  } catch {
    try { data.body = event.data.text(); } catch {}
  }
  const english = data.lang === 'en';
  event.waitUntil(self.registration.showNotification(shortText(data.title, 'ساري | Sary', 150), {
    body: shortText(data.body, english ? 'You have a new notification' : 'لديك إشعار جديد', 1000),
    // Notification assets cannot make third-party requests using untrusted payload URLs.
    icon: '/favicon.png', badge: '/favicon.png',
    tag: shortText(data.tag, 'sari-notification', 100),
    lang: english ? 'en' : 'ar', dir: english ? 'ltr' : 'rtl',
    requireInteraction: data.requireInteraction === true,
    data: { url: notificationUrl(data.url) },
    actions: [
      { action: 'open', title: english ? 'Open' : 'فتح' },
      { action: 'close', title: english ? 'Dismiss' : 'إغلاق' },
    ],
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action && event.action !== 'open') return;
  const url = notificationUrl(event.notification.data?.url);
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async list => {
    for (const client of list) {
      if (client.url === url && typeof client.focus === 'function') {
        try { return await client.focus(); } catch { /* Try another window or open one. */ }
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});
self.addEventListener('message', event => {
  // Ignore messages from a foreign client and never log notification contents.
  try {
    const source = new URL(event.source?.url);
    if (source.origin === self.location.origin && /^\/merchant(?:\/|$)/.test(source.pathname)
      && event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  } catch {}
});
