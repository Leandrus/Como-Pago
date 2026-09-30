/**
 * Módulo de Cálculos Matemáticos y Financieros
 * ¿Cómo Pago en Venezuela?
 */

export const Calculator = {
  /**
   * Calcula la diferencia absoluta y porcentual entre BCV y Paralelo/USDT
   */
  calculateRatesDiff(bcv, usdt) {
    if (!bcv || bcv <= 0) {
      return { diff: 0, percentage: 0, statusClass: 'green' };
    }
    const diff = usdt - bcv;
    const percentage = (diff / bcv) * 100;

    let statusClass = 'green';
    if (percentage > 5) {
      statusClass = 'red';
    } else if (percentage > 1) {
      statusClass = 'orange';
    }

    return {
      diff: Number(diff.toFixed(2)),
      percentage: Number(percentage.toFixed(2)),
      statusClass
    };
  },

  /**
   * Convierte un precio en USD a Bolívares dada una tasa específica
   */
  convertToVes(usdAmount, rate) {
    if (!usdAmount || usdAmount <= 0 || !rate || rate <= 0) return 0;
    return Number((usdAmount * rate).toFixed(2));
  },

  /**
   * Analiza la conveniencia económica comparativa entre Tasa Oficial (BCV) y Dólares / Tasa Paralelo (USDT)
   * @param {number} bcvCostVes Costo en Bolívares evaluado a tasa oficial BCV
   * @param {number} parallelCostVes Costo en Bolívares evaluado a tasa paralelo / Binance
   * @param {number} usdtRate Tasa de cambio USDT / Paralelo (mercado libre)
   * @param {number} bcvRate Tasa oficial BCV
   * @param {number} bcvUsd Monto cotizado en USD para la opción BCV
   * @param {number} parallelUsd Monto cotizado en USD para la opción Divisas/USDT
   */
  analyzePaymentMethod(bcvCostVes, parallelCostVes, usdtRate, bcvRate, bcvUsd = 0, parallelUsd = 0) {
    if (!bcvCostVes || !parallelCostVes || bcvCostVes <= 0 || parallelCostVes <= 0 || !usdtRate || usdtRate <= 0) {
      return { isValid: false };
    }

    // Costo real en dólares de ambas opciones evaluado al valor del mercado libre (tasa paralelo/USDT)
    const realUsdCostBcv = bcvCostVes / usdtRate;
    const realUsdCostParallel = parallelCostVes / usdtRate;

    // Diferencia absoluta en Bolívares y en Dólares reales
    const diffVes = Math.abs(bcvCostVes - parallelCostVes);
    const diffUsd = Math.abs(realUsdCostBcv - realUsdCostParallel);

    // Porcentaje de diferencia tomando como base el mayor costo
    const maxVes = Math.max(bcvCostVes, parallelCostVes);
    const diffPercentage = maxVes > 0 ? (diffVes / maxVes) * 100 : 0;

    // Menor costo y dólares necesarios para cubrir el pago
    const minVesCost = Math.min(bcvCostVes, parallelCostVes);
    const usdtEquivalent = minVesCost / usdtRate;

    // Regla de decisión binaria:
    // Solo conviene pagar en Divisas/USDT si su costo real es estrictamente menor al de Bolívares.
    // En caso de empate, diferencia mínima o menor costo en Bolívares, el usuario siempre preferirá pagar en Bolívares (BCV).
    const winner = (parallelCostVes < bcvCostVes) ? 'parallel' : 'bcv';

    return {
      isValid: true,
      winner, // 'bcv' | 'parallel'
      diffVes: Number(diffVes.toFixed(2)),
      diffUsd: Number(diffUsd.toFixed(2)),
      diffPercentage: Number(diffPercentage.toFixed(2)),
      usdEquivalentSavings: Number(diffUsd.toFixed(2)),
      minVesCost: Number(minVesCost.toFixed(2)),
      usdtEquivalent: Number(usdtEquivalent.toFixed(2)),
      bcvCostVes: Number(bcvCostVes.toFixed(2)),
      parallelCostVes: Number(parallelCostVes.toFixed(2)),
      realUsdCostBcv: Number(realUsdCostBcv.toFixed(2)),
      realUsdCostParallel: Number(realUsdCostParallel.toFixed(2)),
      bcvUsd: Number(bcvUsd.toFixed(2)),
      parallelUsd: Number(parallelUsd.toFixed(2))
    };
  },

  /**
   * Formateador de moneda en Bolívares (VES)
   */
  formatVes(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return '0,00 Bs';
    return amount.toLocaleString('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' Bs';
  },

  /**
   * Formateador de moneda en Dólares (USD)
   */
  formatUsd(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return '$ 0.00';
    return '$ ' + amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
};
