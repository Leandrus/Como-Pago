/**
 * Controlador Principal de la Aplicación
 * ¿Cómo Pago en Venezuela?
 * Integración de API, Cálculos, Persistencia y UI
 */

import { getDollarRates, formatRateDate } from './api.js';
import { Calculator } from './calculator.js';
import { initPWA } from './pwa.js';
import './consent.js';

const LS_KEY = 've_payment_calculator_state';
const DEBOUNCE_TIME = 600;

// Estado centralizado de la app
const state = {
  bcv: 0,
  usdt: 0,
  price_bcv_usd: 0,
  price_parallel_usd: 0,
  saveTimeout: null,
  lastUpdatedIso: null
};

// Referencias del DOM
let els = {};

function initDomReferences() {
  els = {
    section1: document.getElementById('section1'),
    section2: document.getElementById('section2'),
    
    bcvDisplay: document.getElementById('bcvDisplay'),
    usdtDisplay: document.getElementById('usdtDisplay'),
    bcvLoader: document.getElementById('bcvLoader'),
    usdtLoader: document.getElementById('usdtLoader'),
    rateDiff: document.getElementById('rateDiff'),
    apiTimestamp: document.getElementById('apiTimestamp'),
    
    price_bcv_usd_input: document.getElementById('price_bcv_usd_input'),
    price_bcv_ves_input: document.getElementById('price_bcv_ves_input'),
    price_parallel_usd_input: document.getElementById('price_parallel_usd_input'),
    price_parallel_ves_input: document.getElementById('price_parallel_ves_input'),
    
    recommendationBox: document.getElementById('recommendationBox'),
    finalVerdict: document.getElementById('finalVerdict'),
    savingsText: document.getElementById('savingsText'),
    equivalenceBox: document.getElementById('equivalenceBox'),
    equivalenceText: document.getElementById('equivalenceText'),
    
    btnCalculate: document.getElementById('btnCalculate'),
    btnEdit: document.getElementById('btnEdit'), 
    btnReset: document.getElementById('btnReset'),

    // Modales legales integrados
    legalModal: document.getElementById('legalModal'),
    legalModalTitle: document.getElementById('legalModalTitle'),
    legalModalContent: document.getElementById('legalModalContent'),
    legalModalClose: document.getElementById('legalModalClose'),
    legalModalAccept: document.getElementById('legalModalAccept')
  };
}

/**
 * Persistencia en LocalStorage con Debounce
 */
function saveState() {
  if (window.ConsentManager && !window.ConsentManager.hasConsent('preferences')) {
    return;
  }

  clearTimeout(state.saveTimeout);
  state.saveTimeout = setTimeout(() => {
    const dataToSave = {
      bcv: parseFloat(els.bcvDisplay.value) || 0,
      usdt: parseFloat(els.usdtDisplay.value) || 0,
      price_bcv_usd: parseFloat(els.price_bcv_usd_input.value) || 0, 
      price_parallel_usd: parseFloat(els.price_parallel_usd_input.value) || 0,
      lastUpdatedIso: state.lastUpdatedIso
    };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(dataToSave));
    } catch (e) {
      console.warn('Error al guardar en LocalStorage:', e);
    }
  }, DEBOUNCE_TIME);
}

/**
 * Carga el estado guardado desde LocalStorage
 */
function loadSavedState() {
  let loaded = false;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      state.lastUpdatedIso = data.lastUpdatedIso || null;

      if (data.bcv > 0) els.bcvDisplay.value = data.bcv.toFixed(2);
      if (data.usdt > 0) els.usdtDisplay.value = data.usdt.toFixed(2);

      if (data.price_bcv_usd > 0) els.price_bcv_usd_input.value = data.price_bcv_usd.toFixed(2);
      // Compatibilidad con versiones anteriores que guardaban price_avg_usd
      const savedParallel = data.price_parallel_usd || data.price_avg_usd || 0;
      if (savedParallel > 0) els.price_parallel_usd_input.value = savedParallel.toFixed(2);

      if (state.lastUpdatedIso && els.apiTimestamp) {
        els.apiTimestamp.textContent = `Actualizado: ${formatRateDate(state.lastUpdatedIso)}`;
      }

      loaded = true;
    }
  } catch (e) {
    console.warn('Error al cargar datos de LocalStorage:', e);
  }

  updateRateDiffDisplay();
  updateCalculatedVesOutputs();
  return loaded;
}

/**
 * Muestra u oculta los spinners de carga en las tasas
 */
function setRateLoaders(visible) {
  if (els.bcvLoader) els.bcvLoader.classList.toggle('active', visible);
  if (els.usdtLoader) els.usdtLoader.classList.toggle('active', visible);
}

/**
 * Consulta la API api-dolar.leandrus.net y actualiza los valores
 */
async function fetchRates() {
  setRateLoaders(true);

  try {
    const data = await getDollarRates();

    if (data.bcv > 0) {
      state.bcv = data.bcv;
      els.bcvDisplay.value = state.bcv.toFixed(2);
    }

    if (data.usdt > 0) {
      state.usdt = data.usdt;
      els.usdtDisplay.value = state.usdt.toFixed(2);
    }

    if (data.updatedAt) {
      state.lastUpdatedIso = data.updatedAt;
      if (els.apiTimestamp) {
        const sourceLabel = data.isCached ? ' (Caché)' : '';
        els.apiTimestamp.textContent = `Tasas al: ${formatRateDate(data.updatedAt)}${sourceLabel}`;
      }
    }
  } catch (err) {
    console.error('Error al actualizar tasas:', err);
  } finally {
    setRateLoaders(false);
    updateRateDiffDisplay();
    updateCalculatedVesOutputs();
    saveState();
  }
}

/**
 * Actualiza la diferencia y el porcentaje entre tasas en la interfaz
 */
function updateRateDiffDisplay() {
  const bcv = parseFloat(els.bcvDisplay.value) || 0;
  const usdt = parseFloat(els.usdtDisplay.value) || 0;

  const result = Calculator.calculateRatesDiff(bcv, usdt);

  if (els.rateDiff) {
    els.rateDiff.innerHTML = `
      <span class="badge-diff ${result.statusClass}">${result.diff.toFixed(2)} Bs</span>
      <span>(</span><span class="badge-diff ${result.statusClass}">${result.percentage.toFixed(2)}%</span><span>)</span>
    `;
  }
}

/**
 * Actualiza los campos calculados de costo en VES o USD según corresponda
 * @param {'from_usd' | 'from_ves' | 'from_rates'} source Origen del cambio
 */
function syncInputs(source = 'from_usd') {
  const bcvRate = parseFloat(els.bcvDisplay.value) || 0;
  const parallelRate = parseFloat(els.usdtDisplay.value) || 0;

  if (source === 'from_usd' || source === 'from_rates') {
    const bcvUsd = parseFloat(els.price_bcv_usd_input.value);
    const parallelUsd = parseFloat(els.price_parallel_usd_input.value);

    if (!isNaN(bcvUsd) && bcvUsd > 0 && bcvRate > 0) {
      els.price_bcv_ves_input.value = (bcvUsd * bcvRate).toFixed(2);
    } else if (source === 'from_usd' && (isNaN(bcvUsd) || bcvUsd <= 0)) {
      els.price_bcv_ves_input.value = '';
    }

    if (!isNaN(parallelUsd) && parallelUsd > 0 && parallelRate > 0) {
      els.price_parallel_ves_input.value = (parallelUsd * parallelRate).toFixed(2);
    } else if (source === 'from_usd' && (isNaN(parallelUsd) || parallelUsd <= 0)) {
      els.price_parallel_ves_input.value = '';
    }
  }

  saveState();
}

/**
 * Convierte Bolívares a USD cuando el usuario escribe en el campo de Bolívares
 * @param {'bcv' | 'parallel'} target Opción a convertir
 */
function syncVesToUsd(target) {
  const bcvRate = parseFloat(els.bcvDisplay.value) || 0;
  const parallelRate = parseFloat(els.usdtDisplay.value) || 0;

  if (target === 'bcv') {
    const ves = parseFloat(els.price_bcv_ves_input.value);
    if (!isNaN(ves) && ves > 0 && bcvRate > 0) {
      els.price_bcv_usd_input.value = (ves / bcvRate).toFixed(2);
    } else if (isNaN(ves) || ves <= 0) {
      els.price_bcv_usd_input.value = '';
    }
  } else if (target === 'parallel') {
    const ves = parseFloat(els.price_parallel_ves_input.value);
    if (!isNaN(ves) && ves > 0 && parallelRate > 0) {
      els.price_parallel_usd_input.value = (ves / parallelRate).toFixed(2);
    } else if (isNaN(ves) || ves <= 0) {
      els.price_parallel_usd_input.value = '';
    }
  }

  saveState();
}

/**
 * Función de compatibilidad para sincronización general
 */
function updateCalculatedVesOutputs(skipSave = false) {
  syncInputs('from_rates');
}

/**
 * Analiza el método de pago más conveniente y muestra la pantalla de resultados
 * Devuelve una de tres respuestas claras:
 * 1. Conveniencia de pago en Bolívares (usando la tasa BCV)
 * 2. Conveniencia de pago en Divisas o USDT
 * 3. Conveniencia indistinta si la diferencia es muy mínima
 */
function analyzePayment() {
  const bcvRate = parseFloat(els.bcvDisplay.value) || 0;
  const parallelRate = parseFloat(els.usdtDisplay.value) || 0;

  if (bcvRate <= 0 || parallelRate <= 0) {
    alert('Las tasas de cambio no están disponibles o son inválidas. Por favor verifica las tasas.');
    return;
  }

  let bcvUsd = parseFloat(els.price_bcv_usd_input.value) || 0;
  let parallelUsd = parseFloat(els.price_parallel_usd_input.value) || 0;
  let bcvVes = parseFloat(els.price_bcv_ves_input.value) || 0;
  let parallelVes = parseFloat(els.price_parallel_ves_input.value) || 0;

  // Si el usuario ingresó solo Bolívares, sincronizar USD primero
  if (bcvUsd <= 0 && bcvVes > 0) {
    bcvUsd = Number((bcvVes / bcvRate).toFixed(2));
    els.price_bcv_usd_input.value = bcvUsd;
  }
  if (parallelUsd <= 0 && parallelVes > 0) {
    parallelUsd = Number((parallelVes / parallelRate).toFixed(2));
    els.price_parallel_usd_input.value = parallelUsd;
  }

  // Si el usuario solo colocó un precio (caso frecuente: comparar el mismo producto cotizado en USD)
  // auto-completamos la otra opción para no frustrar la experiencia
  if (bcvUsd > 0 && parallelUsd <= 0) {
    parallelUsd = bcvUsd;
    els.price_parallel_usd_input.value = parallelUsd.toFixed(2);
    parallelVes = Number((parallelUsd * parallelRate).toFixed(2));
    els.price_parallel_ves_input.value = parallelVes.toFixed(2);
  } else if (parallelUsd > 0 && bcvUsd <= 0) {
    bcvUsd = parallelUsd;
    els.price_bcv_usd_input.value = bcvUsd.toFixed(2);
    bcvVes = Number((bcvUsd * bcvRate).toFixed(2));
    els.price_bcv_ves_input.value = bcvVes.toFixed(2);
  }

  // Recalcular montos en Bolívares exactos para el análisis
  const bcvCostVes = bcvVes > 0 ? bcvVes : Calculator.convertToVes(bcvUsd, bcvRate);
  const parallelCostVes = parallelVes > 0 ? parallelVes : Calculator.convertToVes(parallelUsd, parallelRate);

  const analysis = Calculator.analyzePaymentMethod(
    bcvCostVes,
    parallelCostVes,
    parallelRate,
    bcvRate,
    bcvUsd,
    parallelUsd
  );

  if (!analysis.isValid) {
    alert('Por favor, ingresa al menos un monto en Dólares ($) o Bolívares (Bs) para realizar el cálculo.');
    return;
  }

  // Ocultar sección de entrada y mostrar resultados
  els.section1.classList.add('hidden');
  els.section2.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Presentar recomendación económica en tarjeta unificada
  const card = els.recommendationBox;
  const verdict = els.finalVerdict;
  const savings = els.savingsText;
  const eqText = els.equivalenceText;

  card.className = 'card results-card';
  verdict.className = 'results-verdict';

  if (analysis.winner === 'bcv') {
    // -------------------------------------------------------------
    // RESPUESTA 1: Conveniencia de pago en Bolívares (Tasa BCV)
    // -------------------------------------------------------------
    card.classList.add('border-bcv');
    verdict.classList.add('bcv-won');
    verdict.textContent = 'Bolívares (Tasa Oficial BCV)';

    savings.innerHTML = `
      <span class="savings-lead">Te conviene pagar en Bolívares</span>
      <span class="savings-highlight bcv">Ahorras ${Calculator.formatVes(analysis.diffVes)}</span>
      <span class="savings-sub">
        Equivale a un ahorro real de <strong style="color: #34d399;">$ ${analysis.usdEquivalentSavings.toFixed(2)} USD</strong> 
        (<strong style="color: #34d399;">${analysis.diffPercentage.toFixed(2)}%</strong> menos).
      </span>
      <div class="results-comparison-grid">
        <div class="res-item">
          <span>En Bolívares (BCV):</span>
          <strong>${Calculator.formatVes(analysis.bcvCostVes)}</strong>
          <small style="color: #64748b;">(Costo real: $ ${analysis.realUsdCostBcv.toFixed(2)})</small>
        </div>
        <div class="res-item">
          <span>En Divisas / USDT:</span>
          <strong>${Calculator.formatVes(analysis.parallelCostVes)}</strong>
          <small style="color: #64748b;">(Costo real: $ ${analysis.parallelUsd.toFixed(2)})</small>
        </div>
      </div>
    `;

    eqText.innerHTML = `
      <strong>¿Tienes Dólares en efectivo o Binance USDT?</strong> Te rinde más cambiarlos a Bolívares a tasa paralelo (${parallelRate.toFixed(2)} Bs/$). Solo necesitas vender <strong>$ ${analysis.usdtEquivalent.toFixed(2)} USD</strong> para pagar la cuenta, quedándote con <strong>$ ${analysis.usdEquivalentSavings.toFixed(2)} USD</strong> en tu bolsillo.
    `;
  } else if (analysis.winner === 'parallel') {
    // -------------------------------------------------------------
    // RESPUESTA 2: Conveniencia de pago en Divisas o USDT
    // -------------------------------------------------------------
    card.classList.add('border-avg');
    verdict.classList.add('avg-won');
    verdict.textContent = 'Divisas o Binance USDT';

    savings.innerHTML = `
      <span class="savings-lead">Te conviene pagar en Divisas o USDT</span>
      <span class="savings-highlight avg">Ahorras $ ${analysis.usdEquivalentSavings.toFixed(2)} USD</span>
      <span class="savings-sub">
        Equivale a <strong style="color: #fbbf24;">${Calculator.formatVes(analysis.diffVes)}</strong> 
        (<strong style="color: #fbbf24;">${analysis.diffPercentage.toFixed(2)}%</strong> menos).
      </span>
      <div class="results-comparison-grid">
        <div class="res-item">
          <span>En Divisas / USDT:</span>
          <strong>${Calculator.formatVes(analysis.parallelCostVes)}</strong>
          <small style="color: #64748b;">(Pagas: $ ${analysis.parallelUsd.toFixed(2)})</small>
        </div>
        <div class="res-item">
          <span>En Bolívares (BCV):</span>
          <strong>${Calculator.formatVes(analysis.bcvCostVes)}</strong>
          <small style="color: #64748b;">(Costo real: $ ${analysis.realUsdCostBcv.toFixed(2)})</small>
        </div>
      </div>
    `;

    eqText.innerHTML = `
      <strong>Paga en Divisas o Binance USDT:</strong> El precio ofrecido incluye un descuento que supera la brecha cambiaria. Recuerda que en Venezuela 1 Dólar físico y 1 USDT tienen exactamente el mismo valor de mercado.
    `;
  } else {
    // -------------------------------------------------------------
    // RESPUESTA 3: Conveniencia indistinta si la diferencia es mínima
    // -------------------------------------------------------------
    card.classList.add('border-default');
    verdict.classList.add('equal');
    verdict.textContent = 'Conveniencia Indistinta';

    savings.innerHTML = `
      <span class="savings-lead">La diferencia es prácticamente nula</span>
      <span class="savings-highlight" style="color: #94a3b8; font-size: 1.1rem;">Diferencia de apenas ${Calculator.formatVes(analysis.diffVes)} ($ ${analysis.usdEquivalentSavings.toFixed(2)} USD)</span>
      <span class="savings-sub" style="color: #64748b;">
        Variación de solo un ${analysis.diffPercentage.toFixed(2)}% entre ambas alternativas.
      </span>
      <div class="results-comparison-grid">
        <div class="res-item">
          <span>En Bolívares (BCV):</span>
          <strong>${Calculator.formatVes(analysis.bcvCostVes)}</strong>
          <small style="color: #64748b;">($ ${analysis.realUsdCostBcv.toFixed(2)})</small>
        </div>
        <div class="res-item">
          <span>En Divisas / USDT:</span>
          <strong>${Calculator.formatVes(analysis.parallelCostVes)}</strong>
          <small style="color: #64748b;">($ ${analysis.parallelUsd.toFixed(2)})</small>
        </div>
      </div>
    `;

    eqText.innerHTML = `
      <strong>Ambas opciones son equivalentes:</strong> El impacto en tu bolsillo es insignificante. Paga con el método que tengas más accesible (efectivo, Binance USDT o Bolívares por punto/pago móvil).
    `;
  }
}

/**
 * Regresa a la sección de edición
 */
function showInputsView() {
  els.section1.classList.remove('hidden');
  els.section2.classList.add('hidden');
  updateRateDiffDisplay();
  updateCalculatedVesOutputs();
}

/**
 * Reinicia todos los valores y restablece tasas desde la API
 */
function handleResetAll() {
  els.price_bcv_usd_input.value = '';
  els.price_bcv_ves_input.value = '';
  els.price_parallel_usd_input.value = '';
  els.price_parallel_ves_input.value = '';

  fetchRates();
  showInputsView();
}

/**
 * Textos legales para los modales integrados en la SPA
 */
const legalDocs = {
  terminos: {
    title: 'Términos y Condiciones de Uso',
    html: `
      <h3>1. Naturaleza del Servicio</h3>
      <p><strong>¿Cómo Pago en Venezuela?</strong> es una herramienta de software web de libre acceso orientada exclusivamente al cálculo matemático comparativo y a la orientación referencial de costos entre tasas de cambio oficiales (BCV) y de mercado (Paralelo / USDT Binance).</p>
      
      <h3>2. Exclusión de Servicios Financieros</h3>
      <p>Esta plataforma <strong>NO constituye entidad bancaria, casa de cambio, procesador de pagos, transmisor de dinero ni agente de retención</strong>. No se reciben, transfieren, custodian ni procesan fondos de ninguna naturaleza.</p>
      
      <h3>3. Exactitud y Disponibilidad</h3>
      <p>Las tasas presentadas son obtenidas de forma automatizada mediante la API pública de <a href="https://api-dolar.leandrus.net" target="_blank" rel="noopener">api-dolar.leandrus.net</a>. No garantizamos la absoluta sincronía en tiempo real con negociaciones privadas ni nos responsabilizamos por fluctuaciones de mercado o decisiones individuales tomadas en base a estos cálculos.</p>
      
      <h3>4. Propiedad Intelectual y Código Abierto</h3>
      <p>El código fuente de este proyecto es público y de libre consulta bajo Licencia de Código Abierto MIT en GitHub. El usuario es responsable de su utilización dentro del marco jurídico aplicable.</p>
    `
  },
  privacidad: {
    title: 'Política de Privacidad y Protección de Datos',
    html: `
      <h3>1. Principio de Cero Recolección de Datos Personales</h3>
      <p>En <strong>¿Cómo Pago?</strong> respetamos estrictamente su privacidad. <strong>No solicitamos, procesamos ni almacenamos ningún dato de identificación personal</strong> (nombres, correos, documentos de identidad, números de cuenta o direcciones IP vinculadas a usuarios).</p>
      
      <h3>2. Almacenamiento Local (LocalStorage)</h3>
      <p>La aplicación utiliza la memoria de su propio navegador (LocalStorage) exclusivamente para:</p>
      <ul>
        <li>Recordar las últimas tasas y montos calculados para agilizar su siguiente visita.</li>
        <li>Almacenar en caché temporal las tasas para permitir funcionamiento offline (PWA).</li>
        <li>Guardar sus preferencias de cookies a través del gestor de consentimiento (CMP).</li>
      </ul>
      <p>Estos datos nunca son transmitidos a servidores propios ni a terceros.</p>

      <h3>3. Comunicaciones Seguras</h3>
      <p>Todas las comunicaciones entre el cliente y las APIs se ejecutan bajo protocolos seguros cifrados TLS/HTTPS.</p>
    `
  },
  cookies: {
    title: 'Política de Cookies y Almacenamiento Local',
    html: `
      <h3>1. ¿Qué tecnologías de almacenamiento empleamos?</h3>
      <p>Nuestra web no utiliza cookies publicitarias ni de seguimiento intrusivo. Empleamos únicamente mecanismos de almacenamiento web estándar (LocalStorage y Cache Storage mediante Service Worker).</p>

      <h3>2. Clasificación de Almacenamiento</h3>
      <ul>
        <li><strong>Técnicas / Esenciales:</strong> Necesarias para el registro de Service Worker (PWA) y el funcionamiento de la calculadora en modo sin conexión.</li>
        <li><strong>Preferencias:</strong> Guardan temporalmente los últimos montos introducidos por el usuario si este decide activarlo en el Gestor de Consentimiento.</li>
        <li><strong>Analíticas:</strong> Desactivadas por defecto. Únicamente estadísticas técnicas agregadas.</li>
      </ul>

      <h3>3. Control del Usuario</h3>
      <p>Usted puede en todo momento modificar o revocar sus preferencias desde el botón <strong>Gestionar Cookies</strong> situado en el pie de página o limpiar la memoria de su navegador cuando lo desee.</p>
    `
  },
  aviso: {
    title: 'Aviso Legal y Descargo de Responsabilidad',
    html: `
      <div class="legal-callout warning">
        <strong>Aviso Importante:</strong> Esta herramienta tiene fines exclusivamente pedagógicos, referenciales y de apoyo al consumidor para la toma de decisiones informadas.
      </div>
      
      <h3>1. Ausencia de Asesoramiento Financiero</h3>
      <p>La información, fórmulas y sugerencias emitidas por el sistema no deben interpretarse como asesoramiento legal, tributario, contable ni financiero. El usuario debe evaluar individualmente las condiciones comerciales pactadas con su proveedor, comerciante o contraparte según la normativa legal vigente de la República Bolivariana de Venezuela.</p>
      
      <h3>2. Responsabilidad por Tasas</h3>
      <p>Las tasas oficiales son calculadas y divulgadas por el Banco Central de Venezuela (BCV), mientras que los indicadores referenciales provienen de plataformas P2P. La plataforma y sus desarrolladores quedan exentos de toda responsabilidad derivada de discrepancias entre los valores mostrados y aquellos aplicados en transacciones específicas.</p>
    `
  }
};

/**
 * Abre el modal legal correspondiente
 */
function openLegalModal(type) {
  const doc = legalDocs[type];
  if (!doc || !els.legalModal) return;

  els.legalModalTitle.textContent = doc.title;
  els.legalModalContent.innerHTML = doc.html;
  els.legalModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLegalModal() {
  if (els.legalModal) {
    els.legalModal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

/**
 * Configuración de Eventos de la Interfaz
 */
function bindEvents() {
  const handleRateChange = () => {
    updateRateDiffDisplay();
    syncInputs('from_rates');
    saveState();
  };

  // Escucha de entradas en tasas
  ['input', 'keyup', 'change'].forEach(evt => {
    els.bcvDisplay.addEventListener(evt, handleRateChange);
    els.usdtDisplay.addEventListener(evt, handleRateChange);
  });

  // Escucha de entradas en USD (calcula VES)
  ['input', 'keyup'].forEach(evt => {
    els.price_bcv_usd_input.addEventListener(evt, () => syncInputs('from_usd'));
    els.price_parallel_usd_input.addEventListener(evt, () => syncInputs('from_usd'));
  });

  // Escucha de entradas en Bolívares (calcula USD)
  ['input', 'keyup'].forEach(evt => {
    els.price_bcv_ves_input.addEventListener(evt, () => syncVesToUsd('bcv'));
    els.price_parallel_ves_input.addEventListener(evt, () => syncVesToUsd('parallel'));
  });

  // Tecla Enter en cualquiera de los 4 inputs numéricos para calcular de inmediato
  [
    els.price_bcv_usd_input,
    els.price_bcv_ves_input,
    els.price_parallel_usd_input,
    els.price_parallel_ves_input
  ].forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        analyzePayment();
      }
    });
  });

  // Botones de acción
  els.btnCalculate.addEventListener('click', analyzePayment);
  els.btnEdit.addEventListener('click', showInputsView);
  els.btnReset.addEventListener('click', handleResetAll);

  // Enlaces legales que abren el modal en SPA
  document.querySelectorAll('[data-legal]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const type = link.getAttribute('data-legal');
      openLegalModal(type);
    });
  });

  // Cierre de modales legales
  if (els.legalModalClose) els.legalModalClose.addEventListener('click', closeLegalModal);
  if (els.legalModalAccept) els.legalModalAccept.addEventListener('click', closeLegalModal);
  if (els.legalModal) {
    els.legalModal.addEventListener('click', (e) => {
      if (e.target === els.legalModal) closeLegalModal();
    });
  }

  // Tecla Esc para cerrar cualquier modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLegalModal();
      if (window.ConsentManager) window.ConsentManager.hideModal();
    }
  });
}

/**
 * Inicialización Principal al cargar el DOM
 */
document.addEventListener('DOMContentLoaded', () => {
  initDomReferences();
  initPWA();
  bindEvents();

  const hasData = loadSavedState();
  if (hasData && (parseFloat(els.price_bcv_usd_input.value) > 0 || parseFloat(els.price_parallel_usd_input.value) > 0)) {
    showInputsView();
  } else {
    els.section2.classList.add('hidden');
  }

  // Consulta en segundo plano de tasas actualizadas desde api-dolar.leandrus.net
  fetchRates();
});
