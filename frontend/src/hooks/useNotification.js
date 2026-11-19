/**
 * Hook personnalisé pour utiliser facilement le système de notifications.
 * 
 * @returns {object} Un objet avec les méthodes pour afficher des notifications
 * 
 * @example
 * const notification = useNotification();
 * 
 * // Afficher une notification de succès
 * notification.success('Client créé avec succès');
 * 
 * // Afficher une notification d'erreur
 * notification.error('Erreur lors de la création');
 * 
 * // Afficher une notification avec options personnalisées
 * notification.warning('Attention: solde faible', {
 *   duration: 8000,
 *   anchorOrigin: { vertical: 'top', horizontal: 'center' }
 * });
 */

import { useMemo } from 'react';
import useNotificationStore from '../store/notificationStore';

/**
 * Hook useNotification.
 * 
 * Fournit des méthodes pratiques pour afficher des notifications.
 */
function useNotification() {
  const store = useNotificationStore();
  const { success, error, warning, info, showNotification, removeNotification, clearAll } = store;

  // Zustand actions are stable, so the returned object must be too: pages list
  // `notification` in effect dependencies and would otherwise re-run on every
  // render (an error toast re-renders, which re-fetches, which errors again).
  return useMemo(() => ({
    /**
     * Affiche une notification de succès.
     * 
     * @param {string} message - Le message à afficher
     * @param {object} options - Options supplémentaires
     */
    success: (message, options) => success(message, options),

    /**
     * Affiche une notification d'erreur.
     * 
     * @param {string} message - Le message à afficher
     * @param {object} options - Options supplémentaires
     */
    error: (message, options) => error(message, options),

    /**
     * Affiche une notification d'avertissement.
     * 
     * @param {string} message - Le message à afficher
     * @param {object} options - Options supplémentaires
     */
    warning: (message, options) => warning(message, options),

    /**
     * Affiche une notification d'information.
     * 
     * @param {string} message - Le message à afficher
     * @param {object} options - Options supplémentaires
     */
    info: (message, options) => info(message, options),

    /**
     * Affiche une notification personnalisée.
     * 
     * @param {object} options - Options de la notification
     */
    show: (options) => showNotification(options),

    /**
     * Supprime une notification par son ID.
     * 
     * @param {string} id - L'ID de la notification
     */
    remove: (id) => removeNotification(id),

    /**
     * Vide toutes les notifications.
     */
    clearAll: () => clearAll(),
  }), [success, error, warning, info, showNotification, removeNotification, clearAll]);
}

export default useNotification;

