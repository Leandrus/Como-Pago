/**
 * Service Worker para Soporte Offline y PWA
 * ¿Cómo Pago en Venezuela?
 * Versión 1.0.5
 */

const CACHE_NAME = 'como-pago-v1.0.5';

const STATIC_ASSETS = [
  './',
  './index.html?v=1.0.5',
  './css/main.css?v=1.0.5',
  './css/consent.css?v=1.0.5',
  './css/legal.css?v=1.0.5',
  './js/app.js?v=1.0.5',
  './js/api.js?v=1.0.5',
  './js/calculator.js?v=1.0.5',
  './js/consent.js?v=1.0.5',
  './js/pwa.js?v=1.0.5',
  './manifest.json',
  './site.webmanifest',
  './icons/favicon.png',
  './icons/favico.svg',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './legal/terminos.html?v=1.0.5',
  './legal/privacidad.html?v=1.0.5',
  './legal/cookies.html?v=1.0.5',
  './legal/aviso-legal.html?v=1.0.5'
];

// Instalación: Precaché forzado y activación inmediata
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaché v1.0.2 completado');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Activación: Purga inmediata de todos los cachés antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Purgando caché antiguo para forzar actualización:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Escucha de mensajes para forzar actualización
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Estrategia de Fetch:
// 1. API: Network-First con fallback a caché
// 2. CSS, JS, HTML: Network-First para garantizar que cualquier cambio se vea de inmediato
// 3. Imágenes y fuentes: Cache-First
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  // Peticiones a api-dolar.leandrus.net
  if (requestUrl.hostname.includes('api-dolar.leandrus.net')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Fuentes Google Fonts: Cache-First
  if (requestUrl.hostname.includes('fonts.googleapis.com') || requestUrl.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return networkResponse;
        });
      })
    );
    return;
  }

  // Archivos CSS, JS y Documentos HTML: Network-First (fuerza descarga fresca siempre que haya red)
  const isCodeOrDoc = 
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'document' ||
    requestUrl.pathname.endsWith('.css') ||
    requestUrl.pathname.endsWith('.js') ||
    requestUrl.pathname.endsWith('.html');

  if (isCodeOrDoc) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (request.destination === 'document') {
              return caches.match('./index.html?v=1.0.5') || caches.match('./');
            }
          });
        })
    );
    return;
  }

  // Resto de activos (imágenes, iconos): Cache-First
  event.respondWith(
    caches.match(request).then((cached) => {
      return cached || fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      });
    })
  );
});
