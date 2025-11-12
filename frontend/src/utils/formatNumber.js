/**
 * Utilitaires centralisés pour le formatage des nombres.
 * 
 * Gère l'affichage des nombres, spécialement les grands nombres avec notation compacte.
 */

/**
 * Formate un nombre avec notation compacte pour les grands nombres.
 * 
 * @param {number} value - La valeur à formater
 * @param {object} options - Options de formatage
 * @param {string} options.style - 'decimal', 'currency', 'percent'
 * @param {string} options.currency - Code devise (ex: 'MAD', 'EUR')
 * @param {number} options.threshold - Seuil pour notation compacte (défaut: 1000000)
 * @param {boolean} options.useCompactNotation - Utiliser notation compacte (défaut: true)
 * @param {number} options.maximumFractionDigits - Nombre de décimales max
 * @param {number} options.minimumFractionDigits - Nombre de décimales min
 * @returns {string} - Valeur formatée
 */
export const formatNumber = (value, options = {}) => {
  if (value === null || value === undefined || isNaN(value)) return '-';

  const {
    style = 'decimal',
    currency = 'MAD',
    threshold = 1000000, // 1 million
    useCompactNotation = true,
    maximumFractionDigits = 2,
    minimumFractionDigits = 0,
  } = options;

  const absValue = Math.abs(value);
  
  // Pour les grands nombres, utiliser la notation compacte
  if (useCompactNotation && absValue >= threshold) {
    const formatterOptions = {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits,
      minimumFractionDigits,
    };

    if (style === 'currency') {
      formatterOptions.style = 'currency';
      formatterOptions.currency = currency;
    }

    return new Intl.NumberFormat('fr-FR', formatterOptions).format(value);
  }

  // Pour les nombres normaux, formatage standard
  const formatterOptions = {
    maximumFractionDigits,
    minimumFractionDigits,
  };

  if (style === 'currency') {
    formatterOptions.style = 'currency';
    formatterOptions.currency = currency;
  } else if (style === 'percent') {
    formatterOptions.style = 'percent';
  }

  return new Intl.NumberFormat('fr-FR', formatterOptions).format(value);
};

/**
 * Formate un montant en devise.
 * 
 * @param {number} montant - Le montant à formater
 * @param {object} options - Options de formatage
 * @returns {string} - Montant formaté
 */
export const formatMontant = (montant, options = {}) => {
  return formatNumber(montant, {
    style: 'currency',
    currency: options.currency || 'MAD',
    useCompactNotation: options.useCompactNotation !== false,
    threshold: options.threshold || 1000000,
    maximumFractionDigits: options.maximumFractionDigits !== undefined ? options.maximumFractionDigits : 2,
    minimumFractionDigits: options.minimumFractionDigits !== undefined ? options.minimumFractionDigits : 0,
  });
};

/**
 * Formate un montant complet (pour tooltips ou affichage détaillé).
 * 
 * @param {number} montant - Le montant à formater
 * @param {string} currency - Code devise
 * @returns {string} - Montant complet formaté
 */
export const formatMontantComplet = (montant, currency = 'MAD') => {
  if (montant === null || montant === undefined || isNaN(montant)) return '-';
  
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(montant);
};

/**
 * Formate un nombre simple avec séparateurs de milliers.
 * 
 * @param {number} value - La valeur à formater
 * @param {object} options - Options de formatage
 * @returns {string} - Valeur formatée
 */
export const formatSimpleNumber = (value, options = {}) => {
  return formatNumber(value, {
    style: 'decimal',
    useCompactNotation: options.useCompactNotation !== false,
    threshold: options.threshold || 1000000,
    maximumFractionDigits: options.maximumFractionDigits !== undefined ? options.maximumFractionDigits : 0,
    minimumFractionDigits: options.minimumFractionDigits !== undefined ? options.minimumFractionDigits : 0,
  });
};

/**
 * Formate un nombre complet (pour tooltips ou affichage détaillé).
 * 
 * @param {number} value - La valeur à formater
 * @returns {string} - Valeur complète formatée
 */
export const formatNumberComplet = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '-';
  
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Formate un pourcentage.
 * 
 * @param {number} value - La valeur à formater (0-100)
 * @param {number} decimals - Nombre de décimales
 * @returns {string} - Pourcentage formaté
 */
export const formatPercentage = (value, decimals = 1) => {
  if (value === null || value === undefined || isNaN(value)) return '-';
  
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(value / 100);
};

/**
 * Détermine si une valeur nécessite une notation compacte.
 * 
 * @param {number} value - La valeur à vérifier
 * @param {number} threshold - Seuil (défaut: 1000000)
 * @returns {boolean} - True si notation compacte recommandée
 */
export const needsCompactNotation = (value, threshold = 1000000) => {
  if (value === null || value === undefined || isNaN(value)) return false;
  return Math.abs(value) >= threshold;
};

/**
 * Obtient la taille de police recommandée selon la longueur du nombre.
 * 
 * @param {string} formattedValue - La valeur formatée
 * @returns {string} - Taille de police (h3, h4, h5, h6)
 */
export const getRecommendedFontSize = (formattedValue) => {
  if (!formattedValue) return 'h4';
  
  const length = formattedValue.length;
  
  if (length <= 10) return 'h4';
  if (length <= 15) return 'h5';
  if (length <= 20) return 'h6';
  return 'body1';
};

