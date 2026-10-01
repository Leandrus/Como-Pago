/**
 * Gestor de Progressive Web App (PWA)
 * Registro de Service Worker, forzado de actualización y soporte Offline
 * ¿Cómo Pago en Venezuela?
 */

const SW_VERSION = '1.1.0';

export function initPWA() {
  if ('serviceWorker' in navigator) {
    // Escucha cuando el nuevo Service Worker toma el control y recarga para aplicar CSS/JS frescos
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        console.log('[PWA] Nueva versión de Service Worker activa. Recargando activos...');
        window.location.reload();
      }
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`sw.js?v=${SW_VERSION}`)
        .then((registration) => {
          console.log('[PWA] Service Worker registrado:', registration.scope);
          
          // Forzar chequeo de actualización en cada carga
          registration.update();

          // Detección de actualizaciones del Service Worker
          registration.addEventListener('updatefound', () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.addEventListener('statechange', () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[PWA] Nueva versión instalada. Activando inmediatamente...');
                  installingWorker.postMessage({ action: 'skipWaiting' });
                }
              });
            }
          });
        })
        .catch((error) => {
          console.warn('[PWA] Fallo en registro de Service Worker:', error);
        });
    });
  }

  // Monitoreo de estado de conectividad online/offline
  window.addEventListener('online', () => {
    updateOnlineStatus(true);
  });

  window.addEventListener('offline', () => {
    updateOnlineStatus(false);
  });
}

function updateOnlineStatus(isOnline) {
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.getElementById('liveStatusText');
  
  if (statusDot) {
    statusDot.style.backgroundColor = isOnline ? 'var(--color-bcv)' : '#ef4444';
    statusDot.style.boxShadow = isOnline ? '0 0 8px var(--color-bcv)' : '0 0 8px #ef4444';
  }
  
  if (statusText) {
    statusText.textContent = isOnline ? 'Tasas en Vivo' : 'Modo Offline (Caché)';
  }
}
