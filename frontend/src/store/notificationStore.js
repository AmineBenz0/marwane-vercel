/**
 * Store Zustand pour la gestion des notifications (toast).
 * 
 * Gère :
 * - Une queue de notifications
 * - Les types de notifications (success, error, warning, info)
 * - L'affichage automatique avec auto-dismiss
 * - La configuration par notification (durée, position, etc.)
 */

import { create } from 'zustand';

/**
 * Types de notifications disponibles.
 */
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

/**
 * Positions disponibles pour les notifications.
 */
export const NOTIFICATION_POSITIONS = {
  TOP_LEFT: { vertical: 'top', horizontal: 'left' },
  TOP_CENTER: { vertical: 'top', horizontal: 'center' },
  TOP_RIGHT: { vertical: 'top', horizontal: 'right' },
  BOTTOM_LEFT: { vertical: 'bottom', horizontal: 'left' },
  BOTTOM_CENTER: { vertical: 'bottom', horizontal: 'center' },
  BOTTOM_RIGHT: { vertical: 'bottom', horizontal: 'right' },
};

/**
 * Durée par défaut pour chaque type de notification (en millisecondes).
 */
const DEFAULT_DURATION = {
  success: 4000, // 4 secondes
  error: 6000,   // 6 secondes
  warning: 5000, // 5 secondes
  info: 4000,    // 4 secondes
};

/**
 * Store Zustand pour les notifications.
 * 
 * État :
 * - notifications: Array des notifications en attente
 * 
 * Actions :
 * - showNotification: Affiche une nouvelle notification
 * - removeNotification: Supprime une notification de la queue
 * - clearAll: Vide toutes les notifications
 * - success: Helper pour afficher une notification de succès
 * - error: Helper pour afficher une notification d'erreur
 * - warning: Helper pour afficher une notification d'avertissement
 * - info: Helper pour afficher une notification d'information
 */
const useNotificationStore = create((set, get) => ({
  // État initial
  notifications: [],

  /**
   * Affiche une nouvelle notification.
   * 
   * @param {object} options - Options de la notification
   * @param {string} options.message - Le message à afficher
   * @param {string} options.type - Le type de notification (success, error, warning, info)
   * @param {number} options.duration - Durée d'affichage en ms (optionnel, défaut selon type)
   * @param {object} options.anchorOrigin - Position de la notification (optionnel)
   * @param {boolean} options.persist - Si true, la notification ne se ferme pas automatiquement (optionnel)
   * @param {string} options.actionLabel - Label pour un bouton d'action (optionnel)
   * @param {function} options.onAction - Callback pour le bouton d'action (optionnel)
   * @returns {string} L'ID de la notification créée
   */
  showNotification: (options) => {
    const {
      message,
      type = NOTIFICATION_TYPES.INFO,
      duration,
      anchorOrigin = NOTIFICATION_POSITIONS.BOTTOM_RIGHT,
      persist = false,
      actionLabel,
      onAction,
    } = options;

    // Générer un ID unique pour la notification
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Déterminer la durée (par défaut selon le type si non spécifiée)
    const notificationDuration = duration !== undefined 
      ? duration 
      : (persist ? null : DEFAULT_DURATION[type] || 4000);

    // Créer la notification
    const notification = {
      id,
      message,
      type,
      duration: notificationDuration,
      anchorOrigin,
      persist,
      actionLabel,
      onAction,
    };

    // Ajouter à la queue
    set((state) => ({
      notifications: [...state.notifications, notification],
    }));

    // Si la notification n'est pas persistante et a une durée, la supprimer automatiquement
    if (!persist && notificationDuration !== null) {
      setTimeout(() => {
        get().removeNotification(id);
      }, notificationDuration);
    }

    return id;
  },

  /**
   * Supprime une notification de la queue.
   * 
   * @param {string} id - L'ID de la notification à supprimer
   */
  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  /**
   * Vide toutes les notifications.
   */
  clearAll: () => {
    set({ notifications: [] });
  },

  /**
   * Helper pour afficher une notification de succès.
   * 
   * @param {string} message - Le message à afficher
   * @param {object} options - Options supplémentaires (duration, anchorOrigin, etc.)
   * @returns {string} L'ID de la notification créée
   */
  success: (message, options = {}) => {
    return get().showNotification({
      message,
      type: NOTIFICATION_TYPES.SUCCESS,
      ...options,
    });
  },

  /**
   * Helper pour afficher une notification d'erreur.
   * 
   * @param {string} message - Le message à afficher
   * @param {object} options - Options supplémentaires (duration, anchorOrigin, etc.)
   * @returns {string} L'ID de la notification créée
   */
  error: (message, options = {}) => {
    return get().showNotification({
      message,
      type: NOTIFICATION_TYPES.ERROR,
      ...options,
    });
  },

  /**
   * Helper pour afficher une notification d'avertissement.
   * 
   * @param {string} message - Le message à afficher
   * @param {object} options - Options supplémentaires (duration, anchorOrigin, etc.)
   * @returns {string} L'ID de la notification créée
   */
  warning: (message, options = {}) => {
    return get().showNotification({
      message,
      type: NOTIFICATION_TYPES.WARNING,
      ...options,
    });
  },

  /**
   * Helper pour afficher une notification d'information.
   * 
   * @param {string} message - Le message à afficher
   * @param {object} options - Options supplémentaires (duration, anchorOrigin, etc.)
   * @returns {string} L'ID de la notification créée
   */
  info: (message, options = {}) => {
    return get().showNotification({
      message,
      type: NOTIFICATION_TYPES.INFO,
      ...options,
    });
  },
}));

export default useNotificationStore;

