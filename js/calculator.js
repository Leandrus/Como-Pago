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
   * Analiza la conveniencia económica comparativa entre Tasa Oficial (BCV) y Dólares / Tasa Paralelo
   * @param {number} bcvCostVes Costo total en Bolívares evaluado a tasa oficial BCV
   * @param {number} parallelCostVes Costo total en Bolívares evaluado a tasa paralelo / Binance
   * @param {number} usdtRate Tasa de cambio USDT/Paralelo
   * @param {number} bcvRate Tasa oficial BCV
   * @param {number} parallelRate Tasa paralelo utilizada
   */
  analyzePaymentMethod(bcvCostVes, parallelCostVes, usdtRate, bcvRate, parallelRate) {
    if (!bcvCostVes || !parallelCostVes || bcvCostVes <= 0 || parallelCostVes <= 0 || !usdtRate || usdtRate <= 0) {
      return { isValid: false };
    }

    const minVesCost = Math.min(bcvCostVes, parallelCostVes);
    const usdtEquivalent = minVesCost / usdtRate;

    const diffVes = Math.abs(bcvCostVes - parallelCostVes);
    const maxVes = Math.max(bcvCostVes, parallelCostVes);
    const diffPercentage = maxVes > 0 ? (diffVes / maxVes) * 100 : 0;

    // Determinación del ganador
    const isBcvCheaper = bcvCostVes < parallelCostVes;
    const isParallelCheaper = parallelCostVes < bcvCostVes;
    const isIdentical = Math.abs(bcvCostVes - parallelCostVes) < 0.01;

    let usdEquivalentSavings = 0;
    if (isBcvCheaper && bcvRate > 0) {
      usdEquivalentSavings = diffVes / bcvRate;
    } else if (isParallelCheaper && parallelRate > 0) {
      usdEquivalentSavings = diffVes / parallelRate;
    }

    let winner = 'equal';
    if (!isIdentical) {
      winner = isBcvCheaper ? 'bcv' : 'parallel';
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
      parallelCostVes
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
