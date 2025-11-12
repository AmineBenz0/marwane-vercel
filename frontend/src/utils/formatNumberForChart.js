/**
 * Utilitaires spécialisés pour le formatage des nombres dans les graphiques.
 * 
 * Ces fonctions sont optimisées pour l'affichage compact dans les axes de graphiques.
 */

/**
 * Formate un nombre de manière compacte pour un axe de graphique.
 * Enlève le symbole de devise pour économiser de l'espace.
 * 
 * @param {number} value - La valeur à formater
 * @param {object} options - Options de formatage
 * @returns {string} - Valeur formatée
 */
export const formatNumberForAxis = (value, options = {}) => {
  if (value === null || value === undefined || isNaN(value)) return '0';

  const absValue = Math.abs(value);
  const {
    threshold = 10000, // Seuil plus bas pour les graphiques
    maximumFractionDigits = 1,
  } = options;

  // Pour les très grands nombres (>= 1 million)
  if (absValue >= 1000000) {
    const millions = value / 1000000;
    return `${millions.toFixed(maximumFractionDigits)}M`;
  }
  
  // Pour les grands nombres (>= threshold, généralement 10k)
  if (absValue >= threshold) {
    const thousands = value / 1000;
    return `${thousands.toFixed(maximumFractionDigits)}k`;
  }

  // Pour les petits nombres, format standard
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
};

/**
 * Formate un montant de manière compacte pour un axe de graphique.
 * 
 * @param {number} value - Le montant à formater
 * @param {object} options - Options de formatage
 * @returns {string} - Montant formaté
 */
export const formatMontantForAxis = (value, options = {}) => {
  if (value === null || value === undefined || isNaN(value)) return '0';

  const formatted = formatNumberForAxis(value, options);
  
  // Éviter de doubler le "M" si déjà présent
  if (formatted.endsWith('M') || formatted.endsWith('k')) {
    return formatted;
  }
  
  return formatted;
};

/**
 * Formate un montant complet pour un tooltip de graphique.
 * 
 * @param {number} value - Le montant à formater
 * @param {string} currency - Code devise
 * @returns {string} - Montant formaté
 */
export const formatMontantForTooltip = (value, currency = 'MAD') => {
  if (value === null || value === undefined || isNaN(value)) return '-';
  
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
};

/**
 * Génère des ticks optimaux pour un axe Y basé sur la plage de données.
 * 
 * @param {number} min - Valeur minimum
 * @param {number} max - Valeur maximum
 * @param {number} tickCount - Nombre de ticks souhaités
 * @returns {Array} - Tableau de valeurs pour les ticks
 */
export const generateOptimalTicks = (min, max, tickCount = 5) => {
  if (max === min) {
    return [0, max];
  }

  const range = max - min;
  const roughStep = range / (tickCount - 1);
  
  // Arrondir le step à une valeur "propre"
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  
  let step;
  if (residual > 5) {
    step = 10 * magnitude;
  } else if (residual > 2) {
    step = 5 * magnitude;
  } else if (residual > 1) {
    step = 2 * magnitude;
  } else {
    step = magnitude;
  }

  // Générer les ticks
  const ticks = [];
  const start = Math.floor(min / step) * step;
  
  for (let i = 0; i <= tickCount; i++) {
    const tick = start + (i * step);
    if (tick >= min && tick <= max * 1.1) { // Petit buffer pour le max
      ticks.push(tick);
    }
  }

  // S'assurer que 0 est inclus si dans la plage
  if (min <= 0 && max >= 0 && !ticks.includes(0)) {
    ticks.push(0);
    ticks.sort((a, b) => a - b);
  }

  return ticks;
};

