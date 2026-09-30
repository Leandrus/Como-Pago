/**
 * Service Worker para Soporte Offline y PWA
 * ¿Cómo Pago en Venezuela?
 * Versión 1.0.0
 */

const CACHE_NAME = 'como-pago-v1.0.0';

const STATIC_ASSETS = [
  './',
  './index.html',
  './css/main.css',
  './css/consent.css',
  './css/legal.css',
  './js/app.js',
  './js/api.js',
  './js/calculator.js',
  './js/consent.js',
  './js/pwa.js',
  './manifest.json',
  './site.webmanifest',
  './icons/favicon.png',
  './icons/favico.svg',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './legal/terminos.html',
  './legal/privacidad.html',
  './legal/cookies.html',
  './legal/aviso-legal.html'
];

// Instalación: Pre-caché de recursos estáticos críticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaché de activos estáticos completado');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activación: Limpieza de versiones obsoletas de caché
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Eliminando caché antiguo:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia de Fetch:
// - Para API (api-dolar.leandrus.net): Network-First con fallback a caché
// - Para Recursos Estáticos: Stale-While-Revalidate o Cache-First
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Peticiones a la API de tasas
  if (requestUrl.hostname.includes('api-dolar.leandrus.net')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Fuentes de Google Fonts
  if (requestUrl.hostname.includes('fonts.googleapis.com') || requestUrl.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return networkResponse;
        });
      })
    );
    return;
  }

  // Activos locales estáticos (Cache-First con actualización en fondo)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => {
        // En caso de caída de red si no está en caché
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });

      return cached || fetchPromise;
    })
  );
});
