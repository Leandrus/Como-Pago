/**
 * Gestor de Progressive Web App (PWA)
 * Registro de Service Worker y soporte Offline
 * ¿Cómo Pago en Venezuela?
 */

export function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then((registration) => {
          console.log('[PWA] Service Worker registrado exitosamente:', registration.scope);
          
          // Detección de actualizaciones del Service Worker
          registration.addEventListener('updatefound', () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.addEventListener('statechange', () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[PWA] Nueva versión disponible. Se actualizará en la próxima recarga.');
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
    statusText.textContent = isOnline ? 'En Línea' : 'Modo Offline (Caché)';
  }
}
