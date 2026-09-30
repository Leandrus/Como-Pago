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
  avgRate: 0,
  manualOverrideAvg: false,
  price_bcv_usd: 0,
  price_avg_usd: 0,
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
    avgRateInput: document.getElementById('avgRateInput'),
    
    price_bcv_usd_input: document.getElementById('price_bcv_usd_input'),
    price_bcv_ves_input: document.getElementById('price_bcv_ves_input'),
    price_avg_usd_input: document.getElementById('price_avg_usd_input'),
    price_avg_ves_input: document.getElementById('price_avg_ves_input'),
    
    recommendationBox: document.getElementById('recommendationBox'),
    finalVerdict: document.getElementById('finalVerdict'),
    savingsText: document.getElementById('savingsText'),

    usdtResultCard: document.getElementById('usdtResultCard'), 
    usdtTransferCost: document.getElementById('usdtTransferCost'),
    usdtSubtitle: document.getElementById('usdtSubtitle'), 
    
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
  // Verificar si el usuario ha consentido guardar preferencias
  if (window.ConsentManager && !window.ConsentManager.hasConsent('preferences')) {
    return;
  }

  clearTimeout(state.saveTimeout);
  state.saveTimeout = setTimeout(() => {
    const dataToSave = {
      bcv: parseFloat(els.bcvDisplay.value) || 0,
      usdt: parseFloat(els.usdtDisplay.value) || 0,
      avgRate: parseFloat(els.avgRateInput.value) || 0,
      price_bcv_usd: parseFloat(els.price_bcv_usd_input.value) || 0, 
      price_avg_usd: parseFloat(els.price_avg_usd_input.value) || 0, 
      manualOverrideAvg: state.manualOverrideAvg,
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
      state.manualOverrideAvg = data.manualOverrideAvg === true;
      state.lastUpdatedIso = data.lastUpdatedIso || null;

      if (data.bcv > 0) els.bcvDisplay.value = data.bcv.toFixed(2);
      if (data.usdt > 0) els.usdtDisplay.value = data.usdt.toFixed(2);
      if (data.avgRate > 0) els.avgRateInput.value = data.avgRate.toFixed(2);

      if (data.price_bcv_usd > 0) els.price_bcv_usd_input.value = data.price_bcv_usd.toFixed(2);
      if (data.price_avg_usd > 0) els.price_avg_usd_input.value = data.price_avg_usd.toFixed(2);

      if (state.lastUpdatedIso && els.apiTimestamp) {
        els.apiTimestamp.textContent = `Actualizado: ${formatRateDate(state.lastUpdatedIso)}`;
      }

      loaded = true;
    }
  } catch (e) {
    console.warn('Error al cargar datos de LocalStorage:', e);
  }

  updateRateDiffDisplay();
  recalculateAverageRate(true);
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
async function fetchRates(isReset = false) {
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

    if (isReset) {
      state.manualOverrideAvg = false;
    }

    recalculateAverageRate();
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
 * Recalcula la Tasa Promedio recomendada para efectivo
 */
function recalculateAverageRate(force = false) {
  if (state.manualOverrideAvg && !force) {
    return;
  }

  const bcv = parseFloat(els.bcvDisplay.value) || 0;
  const usdt = parseFloat(els.usdtDisplay.value) || 0;

  state.avgRate = Calculator.calculateDefaultAverage(bcv, usdt);
  els.avgRateInput.value = state.avgRate.toFixed(2);
  updateCalculatedVesOutputs(true);
}

/**
 * Actualiza los campos calculados de costo en VES
 */
function updateCalculatedVesOutputs(skipSave = false) {
  const bcvRate = parseFloat(els.bcvDisplay.value) || 0;
  const avgRate = parseFloat(els.avgRateInput.value) || 0;

  const bcvUsd = parseFloat(els.price_bcv_usd_input.value) || 0;
  const avgUsd = parseFloat(els.price_avg_usd_input.value) || 0;

  els.price_bcv_ves_input.value = bcvUsd > 0 && bcvRate > 0 ? Calculator.convertToVes(bcvUsd, bcvRate).toFixed(2) : '';
  els.price_avg_ves_input.value = avgUsd > 0 && avgRate > 0 ? Calculator.convertToVes(avgUsd, avgRate).toFixed(2) : '';

  if (!skipSave) {
    saveState();
  }
}

/**
 * Analiza el método de pago más conveniente y muestra la pantalla de resultados
 */
function analyzePayment() {
  const bcvCostVes = parseFloat(els.price_bcv_ves_input.value) || 0;
  const avgCostVes = parseFloat(els.price_avg_ves_input.value) || 0;
  const usdtRate = parseFloat(els.usdtDisplay.value) || 0;
  const bcvRate = parseFloat(els.bcvDisplay.value) || 0;
  const avgRate = parseFloat(els.avgRateInput.value) || 0;

  const analysis = Calculator.analyzePaymentMethod(bcvCostVes, avgCostVes, usdtRate, bcvRate, avgRate);

  if (!analysis.isValid) {
    alert('Por favor, ingresa los montos en Dólares ($) para ambas opciones y verifica que las tasas estén cargadas.');
    return;
  }

  // Ocultar sección de entrada y mostrar resultados
  els.section1.classList.add('hidden');
  els.section2.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // 1. Mostrar costo equivalente en USDT
  els.usdtTransferCost.textContent = `$ ${analysis.usdtEquivalent.toFixed(2)}`;
  els.usdtSubtitle.innerHTML = `
    Si decides transferir vía <strong>Binance P2P / USDT</strong>, deberás enviar 
    <strong style="color: #fcd34d;">$ ${analysis.usdtEquivalent.toFixed(2)} USDT</strong> 
    para cubrir el costo más económico en Bolívares.
  `;

  // 2. Presentar recomendación económica
  const card = els.recommendationBox;
  const verdict = els.finalVerdict;
  const savings = els.savingsText;

  card.className = 'card results-card';
  verdict.className = 'results-verdict';

  if (analysis.winner === 'bcv') {
    card.classList.add('border-bcv');
    verdict.classList.add('bcv-won');
    verdict.textContent = 'Bolívares (Tasa Oficial)';

    savings.innerHTML = `
      <span style="font-weight: 700; color: #f1f5f9;">El costo es menor pagando con la Tasa Oficial BCV</span>
      <span class="savings-highlight bcv">Ahorras ${Calculator.formatVes(analysis.diffVes)}</span>
      <span style="font-size: 0.8rem; color: #94a3b8;">
        Equivalente a <strong style="color: #34d399;">$ ${analysis.usdEquivalentSavings.toFixed(2)} USD</strong> 
        (<strong style="color: #34d399;">${analysis.diffPercentage.toFixed(2)}%</strong> menos).
      </span>
      <div style="font-size: 0.72rem; color: #64748b; margin-top: 0.5rem;">
        Costo Oficial: ${Calculator.formatVes(analysis.bcvCostVes)} | Costo Físicos: ${Calculator.formatVes(analysis.avgCostVes)}
      </div>
    `;
  } else if (analysis.winner === 'avg') {
    card.classList.add('border-avg');
    verdict.classList.add('avg-won');
    verdict.textContent = 'Dólares (Tasa Promedio)';

    savings.innerHTML = `
      <span style="font-weight: 700; color: #f1f5f9;">El costo es menor pagando en Dólares Físicos</span>
      <span class="savings-highlight avg">Ahorras ${Calculator.formatVes(analysis.diffVes)}</span>
      <span style="font-size: 0.8rem; color: #94a3b8;">
        Equivalente a <strong style="color: #60a5fa;">$ ${analysis.usdEquivalentSavings.toFixed(2)} USD</strong> 
        (<strong style="color: #60a5fa;">${analysis.diffPercentage.toFixed(2)}%</strong> menos).
      </span>
      <div style="font-size: 0.72rem; color: #64748b; margin-top: 0.5rem;">
        Costo Oficial: ${Calculator.formatVes(analysis.bcvCostVes)} | Costo Físicos: ${Calculator.formatVes(analysis.avgCostVes)}
      </div>
    `;
  } else {
    card.classList.add('border-default');
    verdict.classList.add('equal');
    verdict.textContent = 'Indistinto';
    savings.innerHTML = `
      <span style="color: #f1f5f9;">La diferencia es insignificante (&lt; 0.01 Bs). Ambas opciones representan el mismo desembolso.</span>
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
  recalculateAverageRate();
  updateCalculatedVesOutputs();
}

/**
 * Reinicia todos los valores y restablece tasas desde la API
 */
function handleResetAll() {
  els.price_bcv_usd_input.value = '';
  els.price_bcv_ves_input.value = '';
  els.price_avg_usd_input.value = '';
  els.price_avg_ves_input.value = '';

  state.manualOverrideAvg = false;
  fetchRates(true);
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
      <p><strong>¿Cómo Pago en Venezuela?</strong> es una herramienta de software web de libre acceso orientada exclusivamente al cálculo matemático comparativo y a la orientación referencial de costos entre tasas de cambio oficiales (BCV) y referenciales de mercado (P2P/USDT).</p>
      
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
    recalculateAverageRate();
    updateCalculatedVesOutputs();
    saveState();
  };

  const handlePriceInput = () => {
    updateCalculatedVesOutputs();
  };

  // Escucha de entradas en tasas
  ['input', 'keyup'].forEach(evt => {
    els.bcvDisplay.addEventListener(evt, handleRateChange);
    els.usdtDisplay.addEventListener(evt, handleRateChange);
    els.price_bcv_usd_input.addEventListener(evt, handlePriceInput);
    els.price_avg_usd_input.addEventListener(evt, handlePriceInput);
  });

  // Tasa promedio editable
  els.avgRateInput.addEventListener('input', (e) => {
    state.manualOverrideAvg = true;
    state.avgRate = parseFloat(e.target.value) || 0;
    updateCalculatedVesOutputs();
    saveState();
  });

  // Tecla Enter para calcular rápido en los inputs USD
  [els.price_bcv_usd_input, els.price_avg_usd_input].forEach(input => {
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
  if (hasData && (parseFloat(els.price_bcv_usd_input.value) > 0 || parseFloat(els.price_avg_usd_input.value) > 0)) {
    showInputsView();
  } else {
    els.section2.classList.add('hidden');
  }

  // Consulta en segundo plano de tasas actualizadas desde api-dolar.leandrus.net
  fetchRates();
});
