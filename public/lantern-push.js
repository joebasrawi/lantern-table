/* This worker handles notifications only; it never caches game or account requests. */
self.addEventListener('push', (event) => {
  // Every accepted push must display a visible notification. Never render story data.
  const data = (() => {
    try {
      return event.data?.json() || {};
    } catch {
      return {};
    }
  })();
  const campaign =
    typeof data.campaignId === 'string' &&
    /^[a-zA-Z0-9-]{1,80}$/.test(data.campaignId)
      ? data.campaignId
      : null;
  event.waitUntil(
    self.registration.showNotification('Lantern Table', {
      body: 'Your adventure needs you. Open the game to see what is next.',
      tag: campaign ? 'lantern-' + campaign : 'lantern-turn',
      renotify: false,
      data: { url: '/' },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const existing = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    })(),
  );
});
