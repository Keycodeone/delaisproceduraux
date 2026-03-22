/* ===================================================
   DÉLAIS PROCÉDURAUX — service-worker.js
   Stratégie : Cache-First + Network Update en fond
   =================================================== */

'use strict';

const CACHE_NAME    = 'delais-proc-v1.0.0';
const OFFLINE_PAGE  = './index.html';

/* Ressources à précacher lors de l'installation */
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './webmanifest.json',
  './icons/icon_192px.png',
  './icons/icon_512px.png',
  './icons/balance_50px.png',
];

/* ─── INSTALL ─── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => {
      // Activer immédiatement sans attendre la fermeture des onglets existants
      return self.skipWaiting();
    })
  );
});

/* ─── ACTIVATE ─── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // Prendre le contrôle des pages déjà ouvertes
      return self.clients.claim();
    })
  );
});

/* ─── FETCH : Cache-First + Network Update ─── */
self.addEventListener('fetch', (event) => {
  // Ne gérer que les requêtes GET sur le même origin
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // Ne pas intercepter les CDN externes (jsPDF, Google Fonts)
  if (url.origin !== self.location.origin) return;

  event.respondWith(cacheFirstWithUpdate(event.request));
});

/**
 * Cache-First avec mise à jour silencieuse en arrière-plan.
 * 1. Retourner immédiatement depuis le cache (fast)
 * 2. Parallèlement, requête réseau → si succès, mettre à jour le cache
 * 3. Si pas de cache ET réseau indisponible → page offline
 */
async function cacheFirstWithUpdate(request) {
  const cache    = await caches.open(CACHE_NAME);
  const cached   = await cache.match(request);

  // Lancer la mise à jour réseau en arrière-plan (sans attendre)
  const networkPromise = fetch(request).then((networkResponse) => {
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => null);

  if (cached) {
    // Retourner le cache immédiatement
    return cached;
  }

  // Pas de cache : attendre le réseau
  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  // Offline fallback : retourner la page principale
  const fallback = await cache.match(OFFLINE_PAGE);
  return fallback || new Response('Hors ligne — veuillez relancer l\'application.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/* ─── MESSAGE : forcer une mise à jour ─── */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
