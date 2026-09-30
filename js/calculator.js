/**
 * Módulo de Cálculos Matemáticos y Financieros
 * ¿Cómo Pago en Venezuela?
 */

export const Calculator = {
  /**
   * Calcula la tasa promedio para compra de dólares físicos:
   * Fórmula estándar: ((BCV + USDT) / 2) * 1.10 (+10% margen de intermediación física)
   */
  calculateDefaultAverage(bcv, usdt) {
    if (!bcv || bcv <= 0 || !usdt || usdt <= 0) return 0;
    const simpleAvg = (bcv + usdt) / 2;
    const rawAvg = simpleAvg * 1.10;
    return Math.round((rawAvg + Number.EPSILON) * 100) / 100;
  },

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
   * Convierte un precio en USD a Bolívares dada una tasa
   */
  convertToVes(usdAmount, rate) {
    if (!usdAmount || usdAmount <= 0 || !rate || rate <= 0) return 0;
    return Number((usdAmount * rate).toFixed(2));
  },

  /**
   * Analiza la conveniencia económica comparativa
   * @param {number} bcvCostVes Costo total en Bolívares evaluado a tasa oficial
   * @param {number} avgCostVes Costo total en Bolívares evaluado a tasa promedio
   * @param {number} usdtRate Tasa de cambio USDT/Paralelo
   * @param {number} bcvRate Tasa oficial BCV
   * @param {number} avgRate Tasa promedio utilizada
   */
  analyzePaymentMethod(bcvCostVes, avgCostVes, usdtRate, bcvRate, avgRate) {
    if (!bcvCostVes || !avgCostVes || bcvCostVes <= 0 || avgCostVes <= 0 || !usdtRate || usdtRate <= 0) {
      return { isValid: false };
    }

    const minVesCost = Math.min(bcvCostVes, avgCostVes);
    const usdtEquivalent = minVesCost / usdtRate;

    const diffVes = Math.abs(bcvCostVes - avgCostVes);
    const maxVes = Math.max(bcvCostVes, avgCostVes);
    const diffPercentage = maxVes > 0 ? (diffVes / maxVes) * 100 : 0;

    // Determinación del ganador
    const isBcvCheaper = bcvCostVes < avgCostVes;
    const isAvgCheaper = avgCostVes < bcvCostVes;
    const isIdentical = Math.abs(bcvCostVes - avgCostVes) < 0.01;

    let usdEquivalentSavings = 0;
    if (isBcvCheaper && bcvRate > 0) {
      usdEquivalentSavings = diffVes / bcvRate;
    } else if (isAvgCheaper && avgRate > 0) {
      usdEquivalentSavings = diffVes / avgRate;
    }

    let winner = 'equal';
    if (!isIdentical) {
      winner = isBcvCheaper ? 'bcv' : 'avg';
    }

    return {
      isValid: true,
      winner,
      minVesCost,
      usdtEquivalent: Number(usdtEquivalent.toFixed(2)),
      diffVes: Number(diffVes.toFixed(2)),
      diffPercentage: Number(diffPercentage.toFixed(2)),
      usdEquivalentSavings: Number(usdEquivalentSavings.toFixed(2)),
      bcvCostVes,
      avgCostVes
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
