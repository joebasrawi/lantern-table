/* This worker handles notifications only; it never caches game or account requests. */
function campaignId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value)
    ? value
    : null;
}
self.addEventListener('push', (event) => {
  // Every accepted push must display a visible notification. Never render story data.
  const data = (() => {
    try {
      return event.data?.json() || {};
    } catch {
      return {};
    }
  })();
  const campaign = campaignId(data.campaignId);
  event.waitUntil(
    self.registration.showNotification('Lantern Table', {
      body: 'Your adventure needs you. Open the game to see what is next.',
      tag: campaign ? 'lantern-' + campaign : 'lantern-turn',
      renotify: false,
      data: { campaignId: campaign },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const campaign = campaignId(event.notification.data?.campaignId);
  const path = campaign ? '/?campaign=' + campaign : '/';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const sameOrigin = windows.filter((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });
      const existing =
        sameOrigin.find((client) => client.url === target) || sameOrigin[0];
      if (existing) {
        try {
          // Navigation reloads committed state, even if this campaign is already open.
          // The game's normal authenticated loader still checks current membership.
          const navigated = await existing.navigate(target);
          if (navigated) return await navigated.focus();
        } catch {
          // A tab can close between enumeration and navigation; use a new one.
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
