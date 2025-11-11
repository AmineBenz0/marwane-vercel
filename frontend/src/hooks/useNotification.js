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

import useNotificationStore from '../store/notificationStore';

/**
 * Hook useNotification.
 * 
 * Fournit des méthodes pratiques pour afficher des notifications.
 */
function useNotification() {
  const store = useNotificationStore();

  return {
    /**
     * Affiche une notification de succès.
     * 
     * @param {string} message - Le message à afficher
     * @param {object} options - Options supplémentaires
     */
    success: (message, options) => store.success(message, options),

    /**
     * Affiche une notification d'erreur.
     * 
     * @param {string} message - Le message à afficher
     * @param {object} options - Options supplémentaires
     */
    error: (message, options) => store.error(message, options),

    /**
     * Affiche une notification d'avertissement.
     * 
     * @param {string} message - Le message à afficher
     * @param {object} options - Options supplémentaires
     */
    warning: (message, options) => store.warning(message, options),

    /**
     * Affiche une notification d'information.
     * 
     * @param {string} message - Le message à afficher
     * @param {object} options - Options supplémentaires
     */
    info: (message, options) => store.info(message, options),

    /**
     * Affiche une notification personnalisée.
     * 
     * @param {object} options - Options de la notification
     */
    show: (options) => store.showNotification(options),

    /**
     * Supprime une notification par son ID.
     * 
     * @param {string} id - L'ID de la notification
     */
    remove: (id) => store.removeNotification(id),

    /**
     * Vide toutes les notifications.
     */
    clearAll: () => store.clearAll(),
  };
}

export default useNotification;

