/**
 * Módulo de Historial y Visualización Gráfica de Fluctuación
 * ¿Cómo Pago en Venezuela?
 * 
 * Carga de datos históricos propios, sincronización con tasas en vivo
 * y renderizado de gráfico interactivo nativo SVG de alto rendimiento.
 */

const HISTORY_CONFIG = {
  endpoint: './data/rates-history.json',
  cacheKey: 'como_pago_history_cache',
  cacheTtlMs: 30 * 60 * 1000 // 30 minutos de validez para el JSON en LocalStorage
};

let cachedHistoryData = null;
let currentPeriod = '1M'; // '1S', '1M', '3M', '1A'
let liveRatePoint = null; // Punto inyectado en vivo desde la API hoy

/**
 * Obtiene el historial consolidado desde el archivo JSON propio o caché local
 */
export async function loadRatesHistory() {
  // Intentar cargar de memoria
  if (cachedHistoryData && Array.isArray(cachedHistoryData.rates)) {
    return cachedHistoryData;
  }

  // Intentar cargar de LocalStorage si está fresco
  try {
    const local = localStorage.getItem(HISTORY_CONFIG.cacheKey);
    if (local) {
      const parsed = JSON.parse(local);
      if (parsed && parsed.timestamp && (Date.now() - parsed.timestamp < HISTORY_CONFIG.cacheTtlMs)) {
        cachedHistoryData = parsed.data;
        return cachedHistoryData;
      }
    }
  } catch (e) {
    console.warn('[History] No se pudo leer caché local:', e);
  }

  // Descargar el archivo propio data/rates-history.json
  try {
    const res = await fetch(`${HISTORY_CONFIG.endpoint}?t=${Date.now()}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    if (data && Array.isArray(data.rates)) {
      cachedHistoryData = data;
      try {
        localStorage.setItem(HISTORY_CONFIG.cacheKey, JSON.stringify({
          timestamp: Date.now(),
          data: data
        }));
      } catch (e) {
        console.warn('[History] Error al escribir en caché:', e);
      }
      return data;
    }
    throw new Error('Estructura de historial no válida');
  } catch (err) {
    console.warn('[History] Error cargando data/rates-history.json, intentando fallback de caché:', err);
    try {
      const fallback = localStorage.getItem(HISTORY_CONFIG.cacheKey);
      if (fallback) {
        const parsed = JSON.parse(fallback);
        cachedHistoryData = parsed.data;
        return cachedHistoryData;
      }
    } catch (_) {}
    return { rates: [] };
  }
}

/**
 * Inyecta o actualiza la tasa en vivo obtenida hoy en la sesión activa
 */
export function updateLiveRatePoint(bcv, usdt, dateIso) {
  if (!bcv || !usdt) return;
  const todayStr = dateIso ? dateIso.substring(0, 10) : new Date().toISOString().substring(0, 10);
  liveRatePoint = {
    date: todayStr,
    bcv: parseFloat(bcv),
    usdt: parseFloat(usdt),
    isLive: true
  };
}

/**
 * Combina el historial con la tasa en vivo actual
 */
function getMergedRates(historyRates) {
  if (!Array.isArray(historyRates)) return [];
  const list = [...historyRates];
  if (!liveRatePoint) return list;

  const lastIdx = list.findIndex(r => r.date === liveRatePoint.date);
  if (lastIdx >= 0) {
    list[lastIdx] = { ...list[lastIdx], bcv: liveRatePoint.bcv, usdt: liveRatePoint.usdt };
  } else {
    list.push(liveRatePoint);
    list.sort((a, b) => a.date.localeCompare(b.date));
  }
  return list;
}

/**
 * Filtra registros según el período seleccionado
 */
export function filterRatesByPeriod(rates, period) {
  if (!rates || rates.length === 0) return [];
  
  const now = new Date();
  let days = 30;
  if (period === '1S') days = 7;
  else if (period === '1M') days = 30;
  else if (period === '3M') days = 90;
  else if (period === '1A') days = 365;

  const cutoff = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
  const cutoffStr = cutoff.toISOString().substring(0, 10);

  const filtered = rates.filter(item => item.date >= cutoffStr && (item.bcv !== null || item.usdt !== null));
  
  // Si por alguna razón hay pocos registros en el rango, asegurarse de devolver al menos los últimos N
  if (filtered.length < 3 && rates.length >= 3) {
    return rates.slice(-Math.min(rates.length, days));
  }
  return filtered;
}

/**
 * Calcula estadísticas de variación porcentual y brecha
 */
export function calculateMetrics(rates) {
  if (!rates || rates.length < 2) {
    return {
      bcvChange: 0,
      usdtChange: 0,
      currentSpread: 0,
      avgSpread: 0,
      firstBcv: 0,
      lastBcv: 0,
      firstUsdt: 0,
      lastUsdt: 0
    };
  }

  // Encontrar primer y último registro con valores válidos
  const bcvValid = rates.filter(r => typeof r.bcv === 'number' && r.bcv > 0);
  const usdtValid = rates.filter(r => typeof r.usdt === 'number' && r.usdt > 0);

  const firstBcv = bcvValid.length > 0 ? bcvValid[0].bcv : 0;
  const lastBcv = bcvValid.length > 0 ? bcvValid[bcvValid.length - 1].bcv : 0;
  const bcvChange = firstBcv > 0 ? ((lastBcv - firstBcv) / firstBcv) * 100 : 0;

  const firstUsdt = usdtValid.length > 0 ? usdtValid[0].usdt : 0;
  const lastUsdt = usdtValid.length > 0 ? usdtValid[usdtValid.length - 1].usdt : 0;
  const usdtChange = firstUsdt > 0 ? ((lastUsdt - firstUsdt) / firstUsdt) * 100 : 0;

  // Brechas
  let spreadSum = 0;
  let spreadCount = 0;
  let currentSpread = 0;

  for (let i = 0; i < rates.length; i++) {
    const r = rates[i];
    if (r.bcv > 0 && r.usdt > 0) {
      const spread = ((r.usdt - r.bcv) / r.bcv) * 100;
      spreadSum += spread;
      spreadCount++;
      currentSpread = spread;
    }
  }

  const avgSpread = spreadCount > 0 ? spreadSum / spreadCount : 0;

  return {
    bcvChange,
    usdtChange,
    currentSpread,
    avgSpread,
    firstBcv,
    lastBcv,
    firstUsdt,
    lastUsdt
  };
}

/**
 * Renderiza el gráfico interactivo nativo en formato SVG
 */
export function renderHistoryChart(containerEl, rates, period) {
  if (!containerEl) return;
  if (!rates || rates.length < 2) {
    containerEl.innerHTML = `
      <div class="chart-empty-state">
        <p>No hay suficientes datos registrados para el período seleccionado.</p>
      </div>
    `;
    return;
  }

  // Dimensiones del canvas virtual SVG
  const width = 600;
  const height = 280;
  const padding = { top: 25, right: 20, bottom: 40, left: 55 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Determinar valores min y max para escala Y
  let minY = Infinity;
  let maxY = -Infinity;

  rates.forEach(r => {
    if (r.bcv > 0) {
      if (r.bcv < minY) minY = r.bcv;
      if (r.bcv > maxY) maxY = r.bcv;
    }
    if (r.usdt > 0) {
      if (r.usdt < minY) minY = r.usdt;
      if (r.usdt > maxY) maxY = r.usdt;
    }
  });

  if (minY === Infinity || maxY === -Infinity || minY === maxY) {
    minY = Math.max(0, minY - 10);
    maxY = maxY + 10;
  } else {
    // Margen del 5% superior e inferior para que las líneas respiren
    const range = maxY - minY;
    minY = Math.max(0, minY - range * 0.08);
    maxY = maxY + range * 0.08;
  }

  const n = rates.length;
  const getX = (idx) => padding.left + (idx / (n - 1)) * chartW;
  const getY = (val) => padding.top + chartH - ((val - minY) / (maxY - minY)) * chartH;

  // Construir puntos para BCV y Paralelo
  const pointsBcv = [];
  const pointsUsdt = [];

  for (let i = 0; i < n; i++) {
    const r = rates[i];
    const x = getX(i);
    if (r.bcv > 0) pointsBcv.push({ x, y: getY(r.bcv), val: r.bcv, idx: i });
    if (r.usdt > 0) pointsUsdt.push({ x, y: getY(r.usdt), val: r.usdt, idx: i });
  }

  // Crear trazados SVG (path)
  const pathD = (pts) => {
    if (pts.length === 0) return '';
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  };

  const bcvPath = pathD(pointsBcv);
  const usdtPath = pathD(pointsUsdt);

  // Crear área de sombreado entre ambas curvas (spread gap)
  let spreadAreaPath = '';
  if (pointsBcv.length > 0 && pointsUsdt.length > 0) {
    const paired = [];
    for (let i = 0; i < n; i++) {
      const b = pointsBcv.find(p => p.idx === i);
      const u = pointsUsdt.find(p => p.idx === i);
      if (b && u) paired.push({ b, u });
    }
    if (paired.length >= 2) {
      const topEdge = paired.map(p => `${p.u.x.toFixed(1)},${p.u.y.toFixed(1)}`);
      const bottomEdge = paired.slice().reverse().map(p => `${p.b.x.toFixed(1)},${p.b.y.toFixed(1)}`);
      spreadAreaPath = `M ${topEdge[0]} L ${topEdge.slice(1).join(' L ')} L ${bottomEdge.join(' L ')} Z`;
    }
  }

  // Líneas de cuadrícula horizontal (3 líneas)
  const gridSteps = 4;
  let gridLinesSvg = '';
  for (let i = 0; i <= gridSteps; i++) {
    const yVal = minY + (i / gridSteps) * (maxY - minY);
    const yPos = getY(yVal);
    gridLinesSvg += `
      <line x1="${padding.left}" y1="${yPos.toFixed(1)}" x2="${width - padding.right}" y2="${yPos.toFixed(1)}" stroke="rgba(255, 255, 255, 0.07)" stroke-dasharray="3,3" />
      <text x="${padding.left - 8}" y="${(yPos + 4).toFixed(1)}" fill="#94a3b8" font-size="11" text-anchor="end" font-family="Inter, sans-serif">Bs. ${yVal >= 100 ? yVal.toFixed(0) : yVal.toFixed(1)}</text>
    `;
  }

  // Etiquetas de fecha en eje X (4 puntos equidistantes)
  let dateLabelsSvg = '';
  const dateStep = Math.max(1, Math.floor((n - 1) / 3));
  const labelIndices = [0, dateStep, Math.min(n - 1, dateStep * 2), n - 1];
  const uniqueIndices = [...new Set(labelIndices)];

  uniqueIndices.forEach(idx => {
    if (rates[idx]) {
      const xPos = getX(idx);
      const dStr = formatShortDate(rates[idx].date);
      dateLabelsSvg += `
        <text x="${xPos.toFixed(1)}" y="${height - 12}" fill="#94a3b8" font-size="10.5" text-anchor="middle" font-family="Inter, sans-serif">${dStr}</text>
      `;
    }
  });

  // Generar HTML completo con el SVG interactivo y tooltip
  containerEl.innerHTML = `
    <div class="chart-wrapper" style="position: relative; width: 100%;">
      <svg viewBox="0 0 ${width} ${height}" class="history-svg" preserveAspectRatio="xMidYMid meet" id="historySvg">
        <defs>
          <linearGradient id="spreadGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.28" />
            <stop offset="100%" stop-color="#10b981" stop-opacity="0.08" />
          </linearGradient>
          <filter id="glowGreen" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#10b981" flood-opacity="0.4" />
          </filter>
          <filter id="glowAmber" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#f59e0b" flood-opacity="0.4" />
          </filter>
        </defs>

        <!-- Cuadrícula -->
        ${gridLinesSvg}
        ${dateLabelsSvg}

        <!-- Área de brecha -->
        ${spreadAreaPath ? `<path d="${spreadAreaPath}" fill="url(#spreadGrad)" />` : ''}

        <!-- Línea BCV (Verde) -->
        <path d="${bcvPath}" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#glowGreen)" />

        <!-- Línea Paralelo (Ámbar) -->
        <path d="${usdtPath}" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#glowAmber)" />

        <!-- Indicador Interactivo (Scrubber Crosshair) -->
        <g id="chartScrubber" style="display: none;">
          <line id="scrubberLine" x1="0" y1="${padding.top}" x2="0" y2="${padding.top + chartH}" stroke="rgba(255, 255, 255, 0.4)" stroke-width="1.5" stroke-dasharray="4,3" />
          <circle id="scrubberDotUsdt" cx="0" cy="0" r="5" fill="#f59e0b" stroke="#090d16" stroke-width="2" />
          <circle id="scrubberDotBcv" cx="0" cy="0" r="5" fill="#10b981" stroke="#090d16" stroke-width="2" />
        </g>
      </svg>

      <!-- Tooltip Flotante de Alta Precisión -->
      <div id="chartTooltip" class="chart-tooltip" style="display: none; position: absolute; pointer-events: none; z-index: 20;"></div>
    </div>
  `;

  // Añadir eventos de ratón y táctiles para interacción dinámica
  setupChartInteractivity(containerEl, rates, padding, chartW, minY, maxY);
}

/**
 * Configura el scrubbing táctil / ratón sobre el gráfico
 */
function setupChartInteractivity(containerEl, rates, padding, chartW, minY, maxY) {
  const svg = containerEl.querySelector('#historySvg');
  const scrubber = containerEl.querySelector('#chartScrubber');
  const line = containerEl.querySelector('#scrubberLine');
  const dotUsdt = containerEl.querySelector('#scrubberDotUsdt');
  const dotBcv = containerEl.querySelector('#scrubberDotBcv');
  const tooltip = containerEl.querySelector('#chartTooltip');

  if (!svg || !scrubber || !tooltip) return;

  const n = rates.length;
  const height = 280;
  const chartH = height - padding.top - padding.bottom;
  const getY = (val) => padding.top + chartH - ((val - minY) / (maxY - minY)) * chartH;

  function updateScrubber(clientX) {
    const rect = svg.getBoundingClientRect();
    const xRel = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, (xRel - (padding.left * (rect.width / 600))) / (chartW * (rect.width / 600))));
    const idx = Math.round(ratio * (n - 1));
    const record = rates[idx];
    if (!record) return;

    const xSvg = padding.left + (idx / (n - 1)) * chartW;
    scrubber.style.display = 'block';
    line.setAttribute('x1', xSvg);
    line.setAttribute('x2', xSvg);

    let bcvY = 0;
    let usdtY = 0;

    if (record.usdt > 0) {
      usdtY = getY(record.usdt);
      dotUsdt.setAttribute('cx', xSvg);
      dotUsdt.setAttribute('cy', usdtY);
      dotUsdt.style.display = 'block';
    } else {
      dotUsdt.style.display = 'none';
    }

    if (record.bcv > 0) {
      bcvY = getY(record.bcv);
      dotBcv.setAttribute('cx', xSvg);
      dotBcv.setAttribute('cy', bcvY);
      dotBcv.style.display = 'block';
    } else {
      dotBcv.style.display = 'none';
    }

    // Calcular brecha
    let spreadHtml = '';
    if (record.bcv > 0 && record.usdt > 0) {
      const spread = (((record.usdt - record.bcv) / record.bcv) * 100).toFixed(2);
      spreadHtml = `<div class="tooltip-spread">Brecha: <strong>+${spread}%</strong></div>`;
    }

    // Contenido del tooltip
    tooltip.innerHTML = `
      <div class="tooltip-date">${formatFullDate(record.date)}</div>
      <div class="tooltip-row usdt">
        <span class="tooltip-dot usdt"></span>
        <span class="tooltip-label">Paralelo:</span>
        <span class="tooltip-val">Bs. ${record.usdt ? record.usdt.toFixed(2) : 'N/D'}</span>
      </div>
      <div class="tooltip-row bcv">
        <span class="tooltip-dot bcv"></span>
        <span class="tooltip-label">Oficial (BCV):</span>
        <span class="tooltip-val">Bs. ${record.bcv ? record.bcv.toFixed(2) : 'N/D'}</span>
      </div>
      ${spreadHtml}
    `;

    tooltip.style.display = 'block';

    // Posicionar el tooltip respecto al contenedor HTML
    const xPixel = (xSvg / 600) * rect.width;
    const tooltipWidth = 160;
    let leftPos = xPixel - (tooltipWidth / 2);
    if (leftPos < 10) leftPos = 10;
    if (leftPos + tooltipWidth > rect.width - 10) leftPos = rect.width - tooltipWidth - 10;

    tooltip.style.left = `${leftPos}px`;
    tooltip.style.top = `10px`;
  }

  function hideScrubber() {
    scrubber.style.display = 'none';
    tooltip.style.display = 'none';
  }

  svg.addEventListener('mousemove', (e) => updateScrubber(e.clientX));
  svg.addEventListener('mouseleave', hideScrubber);

  svg.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches[0]) updateScrubber(e.touches[0].clientX);
  }, { passive: true });

  svg.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) updateScrubber(e.touches[0].clientX);
  }, { passive: true });

  svg.addEventListener('touchend', hideScrubber);
}

/**
 * Formatea una fecha YYYY-MM-DD en formato corto (ej: "15 Sep")
 */
function formatShortDate(dStr) {
  if (!dStr) return '';
  const parts = dStr.split('-');
  if (parts.length < 3) return dStr;
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mIdx = parseInt(parts[1], 10) - 1;
  return `${parseInt(parts[2], 10)} ${months[mIdx] || ''}`;
}

/**
 * Formatea una fecha completa (ej: "15 de Septiembre, 2026")
 */
function formatFullDate(dStr) {
  if (!dStr) return '';
  const parts = dStr.split('-');
  if (parts.length < 3) return dStr;
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  const mIdx = parseInt(parts[1], 10) - 1;
  return `${parseInt(parts[2], 10)} de ${months[mIdx] || ''}, ${parts[0]}`;
}

/**
 * Busca las cotizaciones para una fecha concreta YYYY-MM-DD
 * Si la fecha cae en fin de semana o feriado (sin cotización oficial directa),
 * devuelve la cotización oficial hábil inmediata anterior que estaba vigente.
 */
export function findRateForDate(historyRates, targetDateStr) {
  if (!Array.isArray(historyRates) || historyRates.length === 0) {
    return null;
  }

  // Filtrar registros válidos ordenados cronológicamente
  const sorted = [...historyRates]
    .filter(r => r && r.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  // 1. Coincidencia exacta con BCV válido
  const exact = sorted.find(r => r.date === targetDateStr);
  if (exact && typeof exact.bcv === 'number' && exact.bcv > 0) {
    return {
      exact: true,
      found: true,
      date: exact.date,
      bcv: exact.bcv,
      usdt: typeof exact.usdt === 'number' ? exact.usdt : null,
      requestedDate: targetDateStr
    };
  }

  // 2. Si no hay cotización en esa fecha exacta (fin de semana o feriado),
  // se aplica la tasa hábil inmediatamente anterior que estaba legalmente vigente
  const preceding = sorted.filter(r => r.date <= targetDateStr && typeof r.bcv === 'number' && r.bcv > 0).pop();
  if (preceding) {
    const usdtVal = (exact && typeof exact.usdt === 'number') ? exact.usdt : (typeof preceding.usdt === 'number' ? preceding.usdt : null);
    return {
      exact: false,
      found: true,
      date: preceding.date,
      bcv: preceding.bcv,
      usdt: usdtVal,
      requestedDate: targetDateStr,
      isPreceding: true,
      note: `Fin de semana o feriado (${targetDateStr}). Se aplicó la cotización oficial vigente del ${preceding.date}.`
    };
  }

  // 3. Fallback al primer registro si es anterior a todo el historial
  const first = sorted.find(r => typeof r.bcv === 'number' && r.bcv > 0);
  if (first) {
    return {
      exact: false,
      found: true,
      date: first.date,
      bcv: first.bcv,
      usdt: first.usdt,
      requestedDate: targetDateStr,
      isFallback: true,
      note: `La fecha seleccionada es previa al registro inicial (${first.date}).`
    };
  }

  return null;
}

/**
 * Obtiene el rango de fechas disponibles en el archivo de historial
 */
export function getHistoryDateRange(historyRates) {
  if (!Array.isArray(historyRates) || historyRates.length === 0) {
    return {
      min: '2023-01-03',
      max: new Date().toISOString().substring(0, 10)
    };
  }
  const valid = historyRates.filter(r => r && r.date);
  return {
    min: valid[0]?.date || '2023-01-03',
    max: valid[valid.length - 1]?.date || new Date().toISOString().substring(0, 10)
  };
}
