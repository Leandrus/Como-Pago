/**
 * Módulo de API para Tasas de Cambio
 * Fuente Oficial: https://api-dolar.leandrus.net
 */

const API_CONFIG = {
  endpoint: 'https://api-dolar.leandrus.net/v1/dolares',
  cacheKey: 'como_pago_api_rates_cache',
  cacheTtlMs: 5 * 60 * 1000, // 5 minutos de validez para caché en memoria
  timeoutMs: 8000,
  maxRetries: 3
};

/**
 * Realiza una petición con timeout y reintentos automáticos
 */
async function fetchWithRetry(url, options = {}, retries = API_CONFIG.maxRetries) {
  let delay = 1000;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeoutMs);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          ...(options.headers || {})
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      const isLastAttempt = attempt === retries;
      
      if (isLastAttempt) {
        throw err;
      }
      
      // Espera exponencial antes del siguiente intento
      await new Promise(res => setTimeout(res, delay));
      delay *= 2;
    }
  }
}

/**
 * Obtiene las tasas actuales desde api-dolar.leandrus.net o desde el caché local si falla
 */
export async function getDollarRates() {
  try {
    const rawData = await fetchWithRetry(API_CONFIG.endpoint);
    
    if (!Array.isArray(rawData)) {
      throw new Error('Formato de respuesta inválido de la API');
    }

    const oficialData = rawData.find(item => item.fuente === 'oficial') || {};
    const paraleloData = rawData.find(item => item.fuente === 'paralelo') || {};

    const bcvRate = parseFloat(oficialData.promedio) || 0;
    const usdtRate = parseFloat(paraleloData.promedio) || 0;
    const updatedAt = paraleloData.fechaActualizacion || oficialData.fechaActualizacion || new Date().toISOString();

    const result = {
      success: true,
      bcv: bcvRate,
      usdt: usdtRate,
      updatedAt: updatedAt,
      source: 'api-dolar.leandrus.net',
      isCached: false
    };

    // Guardar en caché local para soporte offline
    try {
      localStorage.setItem(API_CONFIG.cacheKey, JSON.stringify({
        ...result,
        cachedAt: Date.now()
      }));
    } catch (e) {
      console.warn('No se pudo guardar la tasa en caché local:', e);
    }

    return result;
  } catch (err) {
    console.warn('Fallo al obtener tasas en vivo. Intentando cargar desde caché local...', err);
    
    // Intentar recuperar del caché local
    try {
      const cached = localStorage.getItem(API_CONFIG.cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          ...parsed,
          isCached: true,
          error: err.message
        };
      }
    } catch (cacheErr) {
      console.error('Error al leer caché local:', cacheErr);
    }

    // Fallback por defecto si no hay conexión ni caché previo
    return {
      success: false,
      bcv: 0,
      usdt: 0,
      updatedAt: null,
      source: 'offline_fallback',
      isCached: false,
      error: err.message
    };
  }
}

/**
 * Formatea una fecha ISO a formato local venezolano comprensible
 */
export function formatRateDate(isoDateString) {
  if (!isoDateString) return 'Sin fecha disponible';
  
  try {
    const date = new Date(isoDateString);
    if (isNaN(date.getTime())) return 'Fecha inválida';
    
    return date.toLocaleString('es-VE', {
      timeZone: 'America/Caracas',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return 'Fecha no disponible';
  }
}
