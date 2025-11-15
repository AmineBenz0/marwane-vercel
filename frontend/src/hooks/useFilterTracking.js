/**
 * Hook pour tracker l'utilisation des filtres et déterminer les filtres inline.
 * 
 * Fonctionnalités :
 * - Enregistre chaque utilisation de filtre dans localStorage
 * - Calcule les filtres les plus utilisés
 * - Détermine automatiquement quels filtres mettre en inline
 * - Support pour filtres "forcés" en inline (toujours visibles)
 */

import { useState, useEffect, useCallback } from 'react';

const TRACKING_PREFIX = 'filter_tracking_';
const MIN_USAGE_THRESHOLD = 3; // Nombre minimum d'utilisations pour considérer un filtre populaire

/**
 * Hook pour tracker l'utilisation des filtres.
 * 
 * @param {string} pageKey - Identifiant unique de la page (ex: 'transactions', 'clients')
 * @param {Array} filterDefinitions - Définitions des filtres disponibles
 * @param {number} maxInlineFilters - Nombre maximum de filtres à afficher en inline (par défaut 3)
 * @returns {Object} - Objet contenant les méthodes et données de tracking
 */
export function useFilterTracking(pageKey, filterDefinitions = [], maxInlineFilters = 3) {
  const storageKey = `${TRACKING_PREFIX}${pageKey}`;
  
  // État local pour forcer le re-render après mise à jour du tracking
  const [, forceUpdate] = useState(0);

  /**
   * Récupère les statistiques d'utilisation depuis localStorage.
   */
  const getUsageStats = useCallback(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('Erreur lors de la récupération des stats:', error);
      return {};
    }
  }, [storageKey]);

  /**
   * Enregistre l'utilisation d'un filtre.
   */
  const trackFilterUsage = useCallback((filterId) => {
    try {
      const stats = getUsageStats();
      stats[filterId] = {
        count: (stats[filterId]?.count || 0) + 1,
        lastUsed: new Date().toISOString(),
      };
      localStorage.setItem(storageKey, JSON.stringify(stats));
      forceUpdate((n) => n + 1); // Force le re-render
    } catch (error) {
      console.error('Erreur lors du tracking:', error);
    }
  }, [storageKey, getUsageStats]);

  /**
   * Détermine quels filtres doivent être affichés en inline.
   * 
   * Logique :
   * 1. Filtres marqués comme 'alwaysInline' sont toujours inclus
   * 2. Parmi les autres, on prend les plus utilisés
   * 3. Si pas assez d'historique, on prend les premiers dans l'ordre défini
   */
  const getInlineFilters = useCallback(() => {
    const stats = getUsageStats();
    
    // Séparer les filtres forcés en inline
    const forcedInline = filterDefinitions.filter((f) => f.alwaysInline);
    const optionalFilters = filterDefinitions.filter((f) => !f.alwaysInline);
    
    // Calculer le nombre de slots restants
    const remainingSlots = Math.max(0, maxInlineFilters - forcedInline.length);
    
    if (remainingSlots === 0) {
      return forcedInline.map((f) => f.id);
    }
    
    // Trier les filtres optionnels par utilisation
    const sortedByUsage = [...optionalFilters].sort((a, b) => {
      const countA = stats[a.id]?.count || 0;
      const countB = stats[b.id]?.count || 0;
      
      // Si les deux ont assez d'utilisations, trier par count
      if (countA >= MIN_USAGE_THRESHOLD && countB >= MIN_USAGE_THRESHOLD) {
        return countB - countA;
      }
      
      // Si un seul a assez d'utilisations, le privilégier
      if (countA >= MIN_USAGE_THRESHOLD) return -1;
      if (countB >= MIN_USAGE_THRESHOLD) return 1;
      
      // Sinon, garder l'ordre de définition (index dans le tableau original)
      return 0;
    });
    
    // Prendre les N premiers
    const selectedOptional = sortedByUsage.slice(0, remainingSlots);
    
    // Retourner les IDs combinés
    return [
      ...forcedInline.map((f) => f.id),
      ...selectedOptional.map((f) => f.id),
    ];
  }, [filterDefinitions, maxInlineFilters, getUsageStats]);

  /**
   * Réinitialise les statistiques de tracking.
   */
  const resetTracking = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      forceUpdate((n) => n + 1);
    } catch (error) {
      console.error('Erreur lors de la réinitialisation:', error);
    }
  }, [storageKey]);

  /**
   * Obtient les statistiques pour un filtre spécifique.
   */
  const getFilterStats = useCallback((filterId) => {
    const stats = getUsageStats();
    return stats[filterId] || { count: 0, lastUsed: null };
  }, [getUsageStats]);

  return {
    trackFilterUsage,
    getInlineFilters,
    resetTracking,
    getFilterStats,
    getUsageStats,
  };
}

export default useFilterTracking;

