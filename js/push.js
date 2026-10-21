/**
 * Módulo de Notificaciones Web Push Nativas (W3C Push API + VAPID)
 * ¿Cómo Pago en Venezuela?
 * 
 * 100% Anónimo - Sin registros ni servicios de terceros.
 * Guarda preferencias en localStorage y sincroniza con el servidor.
 */

const STORAGE_KEYS = {
  ENABLED: 'como_pago_push_enabled',
  BCV: 'como_pago_push_bcv',
  USDT: 'como_pago_push_usdt',
  USDT_THRESHOLD: 'como_pago_push_usdt_threshold'
};

const API_PUSH_URL = './push/api.php';

let cachedVapidPublicKey = null;

/**
 * Traduce y contextualiza errores de registro Web Push
 */
function formatPushError(err) {
  const msg = err && err.message ? err.message : String(err);

  if (msg.includes('push service error') || msg.includes('Registration failed')) {
    const isBrave = navigator.userAgentData?.brands?.some(b => b.brand.toLowerCase().includes('brave')) ||
                    Boolean(navigator.brave && typeof navigator.brave.isBrave === 'function');
    const isLocal = window.location.hostname === '127.0.0.1';

    if (isBrave) {
      return 'Brave bloqueó el servicio Push. Ve a brave://settings/privacy y activa "Usar los servicios de Google para la mensajería push", luego reinicia.';
    }
    if (isLocal) {
      return 'El navegador no activó el servicio Push en 127.0.0.1. Abre la web como "http://localhost:5500" o prueba en un servidor HTTPS.';
    }
    return 'El servicio Push del navegador no respondió. Asegúrate de tener conexión a internet o prueba en un servidor HTTPS.';
  }

  return msg || 'No se pudo cambiar el estado de las alertas.';
}

/**
 * Convierte una clave pública Base64URL a un Uint8Array para pushManager
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Comprueba si el navegador actual soporta Web Push de forma nativa
 */
export function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Obtiene el estado actual de los permisos del navegador
 */
export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Carga las preferencias guardadas por el usuario en localStorage
 */
export function getLocalPreferences() {
  const enabled = localStorage.getItem(STORAGE_KEYS.ENABLED) === 'true';
  const bcv = localStorage.getItem(STORAGE_KEYS.BCV) !== 'false'; // true por defecto
  const usdt = localStorage.getItem(STORAGE_KEYS.USDT) !== 'false'; // true por defecto
  const thresholdVal = parseInt(localStorage.getItem(STORAGE_KEYS.USDT_THRESHOLD), 10);
  const validThresholds = [1, 2, 5, 10, 25];
  const usdtThreshold = validThresholds.includes(thresholdVal) ? thresholdVal : 2; // 2% por defecto

  return { enabled, bcv, usdt, usdtThreshold };
}

/**
 * Guarda las preferencias en localStorage
 */
export function saveLocalPreferences(prefs) {
  if (typeof prefs.enabled === 'boolean') {
    localStorage.setItem(STORAGE_KEYS.ENABLED, prefs.enabled ? 'true' : 'false');
  }
  if (typeof prefs.bcv === 'boolean') {
    localStorage.setItem(STORAGE_KEYS.BCV, prefs.bcv ? 'true' : 'false');
  }
  if (typeof prefs.usdt === 'boolean') {
    localStorage.setItem(STORAGE_KEYS.USDT, prefs.usdt ? 'true' : 'false');
  }
  if (typeof prefs.usdtThreshold === 'number') {
    localStorage.setItem(STORAGE_KEYS.USDT_THRESHOLD, prefs.usdtThreshold.toString());
  }
}

/**
 * Consulta la clave pública VAPID desde el servidor con fallback estático seguro
 */
export async function getVapidPublicKey() {
  if (cachedVapidPublicKey) return cachedVapidPublicKey;

  try {
    const res = await fetch(`${API_PUSH_URL}?action=public-key`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.publicKey) {
        cachedVapidPublicKey = data.publicKey;
        return cachedVapidPublicKey;
      }
    }
  } catch (err) {
    console.warn('[Push] No se pudo obtener clave VAPID desde api.php, usando clave de respaldo:', err);
  }

  // Clave pública VAPID oficial (P-256) generada para el dominio
  cachedVapidPublicKey = 'BI3zFfxcCwkauX35CZA8H-y_czOpHSqRMlFJGhxcz5hnkhCCnZS_8ri3vrWmiOBp75rFKZGEv7_HBDXUKz2J39U';
  return cachedVapidPublicKey;
}

/**
 * Suscribe al usuario al servicio Web Push del navegador y registra su suscripción en el servidor
 */
export async function subscribeToPush(preferences = {}) {
  if (!isPushSupported()) {
    throw new Error('Este navegador o dispositivo no soporta Notificaciones Web Push.');
  }

  // 1. Solicitar permiso al usuario si aún está en 'default'
  let perm = Notification.permission;
  if (perm === 'default') {
    perm = await Notification.requestPermission();
  }

  if (perm !== 'granted') {
    throw new Error(
      perm === 'denied'
        ? 'El permiso para notificaciones fue bloqueado en este navegador. Debes habilitarlo en los ajustes del sitio para recibir alertas.'
        : 'Se canceló la solicitud de permisos para notificaciones.'
    );
  }

  // 2. Esperar Service Worker activo
  const reg = await navigator.serviceWorker.ready;
  if (!reg) {
    throw new Error('El Service Worker no está listo para registrar la suscripción.');
  }

  // 3. Obtener clave VAPID y registrar suscripción en PushManager
  const vapidKey = await getVapidPublicKey();
  let sub = await reg.pushManager.getSubscription();

  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });
    } catch (subErr) {
      console.error('[Push] Error en reg.pushManager.subscribe:', subErr);
      throw new Error(formatPushError(subErr));
    }
  }

  const subJson = sub.toJSON();

  // 4. Enviar suscripción y preferencias al backend
  const localPrefs = getLocalPreferences();
  const payloadPrefs = {
    bcv: preferences.bcv !== undefined ? preferences.bcv : localPrefs.bcv,
    usdt: preferences.usdt !== undefined ? preferences.usdt : localPrefs.usdt,
    usdt_threshold: preferences.usdtThreshold !== undefined ? preferences.usdtThreshold : localPrefs.usdtThreshold
  };

  try {
    const response = await fetch(`${API_PUSH_URL}?action=subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subJson,
        preferences: payloadPrefs
      })
    });

    const resData = await response.json();
    if (!resData.success) {
      console.warn('[Push] Backend advirtió al guardar suscripción:', resData.error);
    }
  } catch (err) {
    console.warn('[Push] Servidor backend no disponible localmente para guardar suscripción:', err);
  }

  saveLocalPreferences({
    enabled: true,
    bcv: payloadPrefs.bcv,
    usdt: payloadPrefs.usdt,
    usdtThreshold: payloadPrefs.usdt_threshold
  });

  return sub;
}

/**
 * Desuscribe el dispositivo tanto en PushManager como en el backend
 */
export async function unsubscribeFromPush() {
  if (!isPushSupported()) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();

    if (sub) {
      const subJson = sub.toJSON();
      // Notificar al backend
      try {
        await fetch(`${API_PUSH_URL}?action=unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subJson.endpoint })
        });
      } catch (e) {
        console.warn('[Push] Error al desuscribir en backend:', e);
      }

      await sub.unsubscribe();
    }
  } catch (err) {
    console.warn('[Push] Error durante la desuscripción:', err);
  } finally {
    saveLocalPreferences({ enabled: false });
  }
}

/**
 * Sincroniza preferencias actualizadas con el backend
 */
export async function syncPreferences(newPreferences) {
  saveLocalPreferences(newPreferences);

  if (!isPushSupported()) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();

    if (sub) {
      await fetch(`${API_PUSH_URL}?action=preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          preferences: {
            bcv: newPreferences.bcv,
            usdt: newPreferences.usdt,
            usdt_threshold: newPreferences.usdtThreshold
          }
        })
      });
    }
  } catch (e) {
    console.warn('[Push] No se pudieron sincronizar las preferencias en el servidor:', e);
  }
}

/**
 * Envía una notificación push de prueba al dispositivo actual
 */
export async function sendTestPush() {
  if (!isPushSupported()) {
    throw new Error('Notificaciones no soportadas en este navegador.');
  }

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();

  if (!sub) {
    throw new Error('Primero debes activar las alertas para recibir una prueba.');
  }

  const res = await fetch(`${API_PUSH_URL}?action=test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() })
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Error al enviar notificación de prueba.');
  }
  return true;
}

/**
 * Inicializador de la interfaz de usuario de alertas
 */
export function initPushUI() {
  const btnOpen = document.getElementById('btnOpenAlerts');
  const modal = document.getElementById('alertsModal');
  const btnClose = document.getElementById('alertsModalClose');
  const btnDone = document.getElementById('alertsModalDone');
  const masterToggle = document.getElementById('pushMasterToggle');
  const bcvToggle = document.getElementById('pushBcvToggle');
  const usdtToggle = document.getElementById('pushUsdtToggle');
  const bcvOptionItem = document.getElementById('bcvOptionItem');
  const usdtOptionItem = document.getElementById('usdtOptionItem');
  const usdtThresholdSelector = document.getElementById('usdtThresholdSelector');
  const optionsPanel = document.getElementById('alertsOptionsPanel');
  const thresholdButtons = document.querySelectorAll('.threshold-pill');
  const btnTestPush = document.getElementById('btnTestPush');
  const pushStatusText = document.getElementById('pushStatusText');
  const alertsBadgeDot = document.getElementById('alertsBadgeDot');

  // Si no existen los elementos en el DOM, terminar
  if (!masterToggle || !modal) return;

  const supported = isPushSupported();
  const perm = getNotificationPermission();
  const prefs = getLocalPreferences();

  // Actualizar estado del badge en el encabezado
  function updateHeaderBadge() {
    if (alertsBadgeDot) {
      const isActivelySubscribed = prefs.enabled && perm === 'granted';
      alertsBadgeDot.classList.toggle('active', isActivelySubscribed);
      alertsBadgeDot.title = isActivelySubscribed ? 'Alertas activas' : 'Alertas desactivadas';
    }
  }

  // Refrescar controles del modal según el estado
  function refreshUI() {
    const isGranted = (Notification.permission === 'granted');
    const isEnabled = prefs.enabled && isGranted;

    masterToggle.checked = isEnabled;
    if (bcvToggle) {
      bcvToggle.checked = prefs.bcv;
      if (bcvOptionItem) bcvOptionItem.classList.toggle('disabled-option', !prefs.bcv);
    }
    if (usdtToggle) {
      usdtToggle.checked = prefs.usdt;
      if (usdtOptionItem) usdtOptionItem.classList.toggle('disabled-option', !prefs.usdt);
    }

    if (usdtThresholdSelector) {
      usdtThresholdSelector.classList.toggle('disabled-selector', !isEnabled || !prefs.usdt);
    }

    thresholdButtons.forEach((btn) => {
      const val = parseInt(btn.dataset.threshold, 10);
      btn.classList.toggle('active', val === prefs.usdtThreshold);
      btn.setAttribute('aria-pressed', val === prefs.usdtThreshold ? 'true' : 'false');
      btn.disabled = !isEnabled || !prefs.usdt;
    });

    if (optionsPanel) {
      optionsPanel.classList.toggle('disabled-panel', !isEnabled);
      // Deshabilitar o habilitar inputs internos
      optionsPanel.querySelectorAll('input, button').forEach(el => {
        if (el.id !== 'btnTestPush') {
          el.disabled = !isEnabled;
        } else {
          el.disabled = !isEnabled;
        }
      });
      // Restaurar estado de botones de umbral si está deshabilitado USDT
      if (isEnabled && !prefs.usdt) {
        thresholdButtons.forEach(btn => { btn.disabled = true; });
      }
    }

    if (pushStatusText) {
      if (!supported) {
        pushStatusText.innerHTML = '<span class="status-warning">⚠️ Tu navegador actual no soporta Web Push nativo.</span>';
      } else if (Notification.permission === 'denied') {
        pushStatusText.innerHTML = '<span class="status-error">🚫 Notificaciones bloqueadas en los permisos del navegador. Pulsa el icono en la barra de direcciones para permitirlas.</span>';
      } else if (isEnabled) {
        pushStatusText.innerHTML = '<span class="status-active">🟢 Alertas activas y sincronizadas con tu dispositivo.</span>';
      } else {
        pushStatusText.innerHTML = '<span class="status-idle">⚪ Alertas desactivadas. Activa el interruptor para recibir avisos instantáneos.</span>';
      }
    }

    updateHeaderBadge();
  }

  // Comprobar suscripción real en Service Worker
  if (supported) {
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (!sub && prefs.enabled) {
        // Estaba marcado en localStorage pero no hay suscripción activa en el navegador
        saveLocalPreferences({ enabled: false });
        prefs.enabled = false;
      } else if (sub && !prefs.enabled && Notification.permission === 'granted') {
        saveLocalPreferences({ enabled: true });
        prefs.enabled = true;
      }
      refreshUI();
    }).catch(e => {
      console.warn('[Push] Error al comprobar pushManager:', e);
      refreshUI();
    });
  } else {
    refreshUI();
  }

  // Abrir Modal
  function openModal() {
    refreshUI();
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  // Cerrar Modal
  function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (btnOpen) btnOpen.addEventListener('click', openModal);
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnDone) btnDone.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Switch Maestro de Alertas
  masterToggle.addEventListener('change', async () => {
    const shouldEnable = masterToggle.checked;
    masterToggle.disabled = true;

    try {
      if (shouldEnable) {
        if (pushStatusText) {
          pushStatusText.innerHTML = '<span class="status-loading">⏳ Conectando con el servicio de alertas...</span>';
        }
        await subscribeToPush(prefs);
        prefs.enabled = true;
        showToast('¡Alertas activadas! Recibirás avisos de nuevas cotizaciones.', 'success');
      } else {
        if (pushStatusText) {
          pushStatusText.innerHTML = '<span class="status-loading">⏳ Desactivando alertas...</span>';
        }
        await unsubscribeFromPush();
        prefs.enabled = false;
        showToast('Alertas desactivadas correctamente.', 'info');
      }
    } catch (err) {
      console.error('[Push] Error al alternar switch maestro:', err);
      masterToggle.checked = !shouldEnable;
      const friendlyMsg = formatPushError(err);
      if (pushStatusText) {
        pushStatusText.innerHTML = `<span class="status-error">⚠️ ${friendlyMsg}</span>`;
      }
      showToast(friendlyMsg, 'error');
    } finally {
      masterToggle.disabled = false;
      refreshUI();
    }
  });

  // Switch de Alerta BCV
  if (bcvToggle) {
    bcvToggle.addEventListener('change', async () => {
      prefs.bcv = bcvToggle.checked;
      await syncPreferences(prefs);
      showToast(prefs.bcv ? 'Alertas BCV habilitadas' : 'Alertas BCV deshabilitadas', 'info');
      refreshUI();
    });
  }

  // Switch de Alerta USDT
  if (usdtToggle) {
    usdtToggle.addEventListener('change', async () => {
      prefs.usdt = usdtToggle.checked;
      await syncPreferences(prefs);
      showToast(prefs.usdt ? 'Alertas USDT habilitadas' : 'Alertas USDT deshabilitadas', 'info');
      refreshUI();
    });
  }

  // Botones de Umbral USDT
  thresholdButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!prefs.enabled || !prefs.usdt) return;
      const val = parseInt(btn.dataset.threshold, 10);
      if (isNaN(val)) return;

      prefs.usdtThreshold = val;
      await syncPreferences(prefs);
      showToast(`Umbral USDT actualizado a ±${val}%`, 'info');
      refreshUI();
    });
  });

  // Botón de Alerta de Prueba
  if (btnTestPush) {
    btnTestPush.addEventListener('click', async () => {
      btnTestPush.disabled = true;
      const originalText = btnTestPush.innerHTML;
      btnTestPush.innerHTML = '<span>Enviando prueba...</span>';

      try {
        await sendTestPush();
        showToast('Notificación de prueba enviada a tu dispositivo 📲', 'success');
      } catch (err) {
        console.error('[Push] Fallo de prueba:', err);
        showToast(err.message || 'No se pudo enviar la alerta de prueba', 'error');
      } finally {
        btnTestPush.disabled = false;
        btnTestPush.innerHTML = originalText;
      }
    });
  }

  // Toast de feedback visual integrado
  function showToast(message, type = 'info') {
    const toast = document.getElementById('dateNoticeToast');
    const toastTitle = document.getElementById('dateToastTitle');
    const toastMsg = document.getElementById('dateToastMessage');
    const toastIconWrap = document.getElementById('dateToastIconWrap');

    if (!toast || !toastTitle || !toastMsg) return;

    toastTitle.textContent = type === 'success' ? 'Notificaciones' : (type === 'error' ? 'Aviso' : 'Información');
    toastMsg.textContent = message;

    if (toastIconWrap) {
      toastIconWrap.style.background = type === 'success' ? 'rgba(16, 185, 129, 0.15)' : (type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)');
      toastIconWrap.style.color = type === 'success' ? '#10b981' : (type === 'error' ? '#ef4444' : '#3b82f6');
    }

    toast.classList.remove('hidden');
    clearTimeout(window.__toastTimeout);
    window.__toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 5500);
  }
}
