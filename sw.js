/**
 * Service Worker para Soporte Offline, PWA y Web Push Nativo
 * ¿Cómo Pago en Venezuela?
 * Versión 1.3.2
 */

const CACHE_NAME = 'como-pago-v1.3.2';

const STATIC_ASSETS = [
  './',
  './index.html?v=1.3.2',
  './css/main.css?v=1.3.2',
  './css/consent.css?v=1.1.0',
  './css/legal.css?v=1.2.0',
  './js/app.js?v=1.3.1',
  './js/api.js?v=1.3.0',
  './js/push.js?v=1.3.1',
  './js/calculator.js?v=1.1.0',
  './js/consent.js?v=1.1.0',
  './js/history.js?v=1.3.0',
  './js/pwa.js?v=1.3.0',
  './data/rates-history.json',
  './manifest.json',
  './site.webmanifest',
  './icons/favicon.png',
  './icons/favico.svg',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './legal/terminos.html?v=1.2.0',
  './legal/privacidad.html?v=1.2.0',
  './legal/cookies.html?v=1.2.0',
  './legal/aviso-legal.html?v=1.2.0'
];

// Instalación: Precaché forzado y activación inmediata
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaché v1.3.0 completado');
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

// ==============================================================================
// GESTOR DE NOTIFICACIONES WEB PUSH NATIVAS
// ==============================================================================

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = {
        title: '¿Cómo Pago en Venezuela?',
        body: event.data.text()
      };
    }
  }

  const title = data.title || '¿Cómo Pago en Venezuela?';
  const options = {
    body: data.body || 'Nueva actualización de cotizaciones disponible.',
    icon: data.icon || './icons/icon-192x192.png',
    badge: data.badge || './icons/icon-192x192.png',
    tag: data.tag || ('como-pago-' + Date.now()),
    renotify: true,
    data: {
      url: data.url || './',
      timestamp: Date.now()
    },
    vibrate: [200, 100, 200]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ==============================================================================
// ESTRATEGIA DE FETCH
// ==============================================================================

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  // 1. API Push interna: Siempre Network directo sin caché
  if (requestUrl.pathname.includes('/push/api.php') || requestUrl.pathname.endsWith('api.php')) {
    event.respondWith(fetch(request));
    return;
  }

  // 2. Peticiones a api-dolar.leandrus.net
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

  // 3. Fuentes Google Fonts: Cache-First
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

  // 4. Archivos CSS, JS y Documentos HTML: Network-First (fuerza descarga fresca siempre que haya red)
  const isCodeOrDoc = 
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'document' ||
    requestUrl.pathname.endsWith('.css') ||
    requestUrl.pathname.endsWith('.js') ||
    requestUrl.pathname.endsWith('.json') ||
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
              return caches.match('./index.html?v=1.3.2') || caches.match('./');
            }
          });
        })
    );
    return;
  }

  // 5. Resto de activos (imágenes, iconos): Cache-First
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
