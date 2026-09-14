/**
 * Hook personnalisé pour gérer les erreurs API de manière centralisée.
 * 
 * Fournit des méthodes pour :
 * - Gérer les erreurs API avec des messages utilisateur clairs
 * - Afficher automatiquement des notifications d'erreur
 * - Logger les erreurs en mode développement
 * - Extraire les messages d'erreur depuis différentes structures de réponse
 * 
 * @returns {object} Un objet avec les méthodes pour gérer les erreurs API
 * 
 * @example
 * const { handleApiError, getErrorMessage } = useApiError();
 * 
 * try {
 *   await post('/clients', data);
 * } catch (error) {
 *   handleApiError(error); // Affiche automatiquement une notification
 * }
 * 
 * @example
 * const { getErrorMessage } = useApiError();
 * 
 * try {
 *   await post('/clients', data);
 * } catch (error) {
 *   const message = getErrorMessage(error);
 *   setFormError(message); // Utiliser le message dans un formulaire
 * }
 */

import { useCallback } from 'react';
import useNotification from './useNotification';

/**
 * Mappe les codes d'erreur HTTP vers des messages utilisateur clairs.
 * 
 * @param {number} status - Le code de statut HTTP
 * @param {string} defaultMessage - Message par défaut si aucun mapping n'existe
 * @returns {string} Le message d'erreur mappé
 */
const mapHttpErrorToMessage = (status, defaultMessage = 'Une erreur est survenue') => {
  const errorMessages = {
    400: 'Données invalides',
    401: 'Session expirée. Veuillez vous reconnecter',
    403: 'Accès refusé',
    404: 'Ressource non trouvée',
    500: 'Erreur serveur',
    502: 'Service temporairement indisponible',
    503: 'Service temporairement indisponible',
    504: 'Délai d\'attente dépassé',
  };

  return errorMessages[status] || defaultMessage;
};

/**
 * Extrait le message d'erreur depuis une erreur API.
 * 
 * Gère différents formats de réponse d'erreur :
 * - FastAPI : { detail: string | array }
 * - Standard : { message: string }
 * - Erreur réseau : message personnalisé
 * 
 * @param {object} error - L'erreur à traiter
 * @returns {string} Le message d'erreur extrait
 */
const extractErrorMessage = (error) => {
  // Si l'erreur a déjà été formatée par l'intercepteur axios
  if (error.message && typeof error.message === 'string') {
    return error.message;
  }

  // Si l'erreur contient une réponse HTTP
  if (error.response) {
    const { status, data } = error.response;

    // Format FastAPI : { detail: string | array }
    if (data?.detail) {
      if (typeof data.detail === 'string') {
        return data.detail;
      }
      if (Array.isArray(data.detail)) {
        // Prendre le premier message d'erreur de validation
        const firstError = data.detail[0];
        if (firstError?.msg) {
          return firstError.msg;
        }
      }
    }

    // Format standard : { message: string }
    if (data?.message) {
      return data.message;
    }

    // Utiliser le mapping par défaut selon le code HTTP
    return mapHttpErrorToMessage(status);
  }

  // Erreur réseau (pas de réponse)
  if (error.request) {
    return 'Impossible de contacter le serveur. Vérifiez votre connexion.';
  }

  // Autre type d'erreur
  return error.message || 'Une erreur inattendue est survenue';
};

/**
 * Détermine si on est en mode développement.
 * 
 * @returns {boolean} True si en mode développement
 */
const isDevelopment = () => {
  return import.meta.env.DEV || import.meta.env.MODE === 'development';
};

/**
 * Log une erreur dans la console en mode développement.
 * 
 * @param {object} error - L'erreur à logger
 * @param {string} context - Contexte supplémentaire (optionnel)
 */
const logError = (error, context = '') => {
  if (isDevelopment()) {
    const contextMsg = context ? `[${context}] ` : '';
    console.error(`${contextMsg}Erreur API:`, {
      error,
      message: extractErrorMessage(error),
      status: error?.status || error?.response?.status,
      data: error?.data || error?.response?.data,
      stack: error?.stack,
    });
  }
};

/**
 * Hook useApiError.
 * 
 * Fournit des méthodes pratiques pour gérer les erreurs API.
 */
function useApiError() {
  const notification = useNotification();

  /**
   * Extrait le message d'erreur depuis une erreur API.
   * 
   * @param {object} error - L'erreur à traiter
   * @returns {string} Le message d'erreur extrait
   */
  const getErrorMessage = useCallback((error) => {
    return extractErrorMessage(error);
  }, []);

  /**
   * Gère une erreur API en affichant une notification et en loggant l'erreur.
   * 
   * @param {object} error - L'erreur à gérer
   * @param {object} options - Options supplémentaires
   * @param {boolean} options.showNotification - Si true, affiche une notification (défaut: true)
   * @param {string} options.context - Contexte pour le logging (optionnel)
   * @param {string} options.customMessage - Message personnalisé à afficher (optionnel)
   * @returns {string} Le message d'erreur extrait
   * 
   * @example
   * try {
   *   await post('/clients', data);
   * } catch (error) {
   *   handleApiError(error); // Affiche automatiquement une notification
   * }
   * 
   * @example
   * try {
   *   await post('/clients', data);
   * } catch (error) {
   *   handleApiError(error, { 
   *     showNotification: false, // Ne pas afficher de notification
   *     context: 'Création client' // Contexte pour le log
   *   });
   * }
   */
  const handleApiError = useCallback(
    (error, options = {}) => {
      const { showNotification = true, context = '', customMessage = null } = options;

      // Extraire le message d'erreur
      const errorMessage = customMessage || extractErrorMessage(error);

      // Logger l'erreur en mode développement
      logError(error, context);

      // Afficher une notification si demandé
      if (showNotification) {
        notification.error(errorMessage);
      }

      return errorMessage;
    },
    [notification]
  );

  /**
   * Gère une erreur API silencieusement (sans notification).
   * Utile pour les cas où on veut gérer l'erreur manuellement.
   * 
   * @param {object} error - L'erreur à gérer
   * @param {string} context - Contexte pour le logging (optionnel)
   * @returns {string} Le message d'erreur extrait
   */
  const handleApiErrorSilently = useCallback(
    (error, context = '') => {
      return handleApiError(error, { showNotification: false, context });
    },
    [handleApiError]
  );

  /**
   * Vérifie si une erreur correspond à un code HTTP spécifique.
   * 
   * @param {object} error - L'erreur à vérifier
   * @param {number} statusCode - Le code de statut HTTP à vérifier
   * @returns {boolean} True si l'erreur correspond au code
   */
  const isErrorStatus = useCallback((error, statusCode) => {
    return (
      error?.status === statusCode ||
      error?.response?.status === statusCode
    );
  }, []);

  /**
   * Vérifie si une erreur est une erreur de validation (400).
   * 
   * @param {object} error - L'erreur à vérifier
   * @returns {boolean} True si c'est une erreur de validation
   */
  const isValidationError = useCallback(
    (error) => isErrorStatus(error, 400),
    [isErrorStatus]
  );

  /**
   * Vérifie si une erreur est une erreur d'authentification (401).
   * 
   * @param {object} error - L'erreur à vérifier
   * @returns {boolean} True si c'est une erreur d'authentification
   */
  const isAuthError = useCallback(
    (error) => isErrorStatus(error, 401),
    [isErrorStatus]
  );

  /**
   * Vérifie si une erreur est une erreur d'autorisation (403).
   * 
   * @param {object} error - L'erreur à vérifier
   * @returns {boolean} True si c'est une erreur d'autorisation
   */
  const isForbiddenError = useCallback(
    (error) => isErrorStatus(error, 403),
    [isErrorStatus]
  );

  /**
   * Vérifie si une erreur est une erreur de ressource non trouvée (404).
   * 
   * @param {object} error - L'erreur à vérifier
   * @returns {boolean} True si c'est une erreur 404
   */
  const isNotFoundError = useCallback(
    (error) => isErrorStatus(error, 404),
    [isErrorStatus]
  );

  /**
   * Vérifie si une erreur est une erreur serveur (500+).
   * 
   * @param {object} error - L'erreur à vérifier
   * @returns {boolean} True si c'est une erreur serveur
   */
  const isServerError = useCallback(
    (error) => {
      const status = error?.status || error?.response?.status;
      return status && status >= 500;
    },
    []
  );

  /**
   * Vérifie si une erreur est une erreur réseau (pas de réponse).
   * 
   * @param {object} error - L'erreur à vérifier
   * @returns {boolean} True si c'est une erreur réseau
   */
  const isNetworkError = useCallback((error) => {
    return !error?.response && error?.request;
  }, []);

  return {
    handleApiError,
    handleApiErrorSilently,
    getErrorMessage,
    isErrorStatus,
    isValidationError,
    isAuthError,
    isForbiddenError,
    isNotFoundError,
    isServerError,
    isNetworkError,
  };
}

export default useApiError;

