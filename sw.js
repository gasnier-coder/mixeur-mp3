// Service Worker minimal pour autoriser l'installation PWA
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Laisse passer toutes les requêtes normalement
  event.respondWith(fetch(event.request));
});