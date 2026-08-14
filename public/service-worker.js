'use strict';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    await self.registration.unregister();

    const windowClients = await self.clients.matchAll({ type: 'window' });
    await Promise.all(windowClients.map((client) => client.navigate(client.url)));
  })());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
