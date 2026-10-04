// Kept at the original URL so browsers with the v2 worker can update and recover.
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('tripwire-')) await caches.delete(key);
    }
    await self.registration.unregister();
    // Refresh controlled windows once, including the old cached offline page.
    const windows = await self.clients.matchAll({ type: 'window' });
    await Promise.all(windows.map(window => window.navigate(window.url)));
  })());
});
