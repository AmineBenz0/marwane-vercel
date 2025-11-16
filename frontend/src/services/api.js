/**
 * Service API pour la communication avec le backend.
 * 
 * Configure axios avec l'URL de base de l'API, gère l'authentification JWT
 * et fournit des fonctions helper pour les requêtes HTTP.
 * 
 * Gère également les erreurs de manière centralisée avec :
 * - Mapping des codes d'erreur HTTP vers des messages utilisateur
 * - Affichage automatique de notifications (toast)
 * - Logging des erreurs en mode développement
 */

import axios from 'axios';
import useNotificationStore from '../store/notificationStore';

// Configuration de l'URL de base de l'API
// Si VITE_API_URL est vide ou non défini, utiliser un chemin relatif
const envApiUrl = import.meta.env.VITE_API_URL;
const API_PREFIX = '/api/v1';

// Déterminer la baseURL
let baseURL;
if (envApiUrl === '' || envApiUrl === undefined) {
  // Production avec Nginx reverse proxy : utiliser chemin relatif
  baseURL = API_PREFIX;
} else {
  // Développement ou URL complète spécifiée
  baseURL = `${envApiUrl}${API_PREFIX}`;
}

// Créer une instance axios avec la configuration de base
const api = axios.create({
  baseURL: baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 secondes
});

/**
 * Récupère le token d'accès depuis le localStorage.
 * 
 * @returns {string|null} Le token d'accès ou null s'il n'existe pas
 */
const getAccessToken = () => {
  return localStorage.getItem('access_token');
};

/**
 * Supprime les tokens du localStorage.
 */
const clearTokens = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
};

/**
 * Redirige vers la page de connexion.
 */
const redirectToLogin = () => {
  // Nettoyer les tokens avant la redirection
  clearTokens();
  
  // Rediriger vers la page de connexion
  // Note: Si react-router-dom n'est pas encore configuré, utiliser window.location
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
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
 * Extrait le message d'erreur depuis une réponse d'erreur API.
 * 
 * Gère différents formats de réponse d'erreur :
 * - FastAPI : { detail: string | array }
 * - Standard : { message: string }
 * - Utilise le mapping HTTP si aucun message spécifique n'est trouvé
 * 
 * @param {object} responseData - Les données de la réponse d'erreur
 * @param {number} status - Le code de statut HTTP
 * @returns {string} Le message d'erreur extrait
 */
const extractErrorMessage = (responseData, status) => {
  // Format FastAPI : { detail: string | array }
  if (responseData?.detail) {
    if (typeof responseData.detail === 'string') {
      return responseData.detail;
    }
    if (Array.isArray(responseData.detail) && responseData.detail.length > 0) {
      // Prendre le premier message d'erreur de validation
      const firstError = responseData.detail[0];
      if (firstError?.msg) {
        return firstError.msg;
      }
    }
  }

  // Format standard : { message: string }
  if (responseData?.message) {
    return responseData.message;
  }

  // Utiliser le mapping par défaut selon le code HTTP
  return mapHttpErrorToMessage(status);
};

/**
 * Log une erreur dans la console en mode développement.
 * 
 * @param {object} error - L'erreur à logger
 * @param {string} url - L'URL de la requête (optionnel)
 */
const logError = (error, url = '') => {
  if (isDevelopment()) {
    const urlMsg = url ? `[${url}] ` : '';
    console.error(`${urlMsg}Erreur API:`, {
      error,
      message: error.message,
      status: error.status,
      data: error.data,
      originalError: error.originalError || error,
    });
  }
};

/**
 * Détermine si une erreur doit afficher une notification automatique.
 * 
 * Certaines erreurs sont gérées différemment (ex: 401 redirige vers login)
 * et ne doivent pas afficher de notification.
 * 
 * @param {number} status - Le code de statut HTTP
 * @returns {boolean} True si une notification doit être affichée
 */
const shouldShowNotification = (status) => {
  // Ne pas afficher de notification pour 401 (redirection vers login)
  // Les autres erreurs affichent une notification
  return status !== 401;
};

/**
 * Intercepteur de requête : ajoute automatiquement le token JWT aux requêtes.
 */
api.interceptors.request.use(
  (config) => {
    // Récupérer le token d'accès depuis le localStorage
    const token = getAccessToken();
    
    // Si un token existe, l'ajouter dans l'en-tête Authorization
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    // En cas d'erreur lors de la configuration de la requête
    return Promise.reject(error);
  }
);

/**
 * Intercepteur de réponse : gère les erreurs globalement.
 * 
 * - 401 (Unauthorized) : redirige vers la page de connexion (sans notification)
 * - Autres erreurs : affiche une notification et propage l'erreur pour gestion locale
 * - Log toutes les erreurs en mode développement
 */
api.interceptors.response.use(
  (response) => {
    // Si la requête réussit, retourner la réponse telle quelle
    return response;
  },
  (error) => {
    // Récupérer l'instance du store de notifications
    const notificationStore = useNotificationStore.getState();
    
    // Gérer les erreurs de réponse HTTP
    if (error.response) {
      const { status, data, config } = error.response;
      const url = config?.url || 'Unknown';
      
      // Extraire le message d'erreur
      const errorMessage = extractErrorMessage(data, status);
      
      // Créer un objet d'erreur formaté
      const formattedError = {
        status,
        message: errorMessage,
        data: data,
        originalError: error,
      };
      
      // Si l'erreur est 401 (Unauthorized), rediriger vers la page de connexion
      if (status === 401) {
        if (isDevelopment()) {
          console.warn('Token invalide ou expiré. Redirection vers la page de connexion.');
        }
        redirectToLogin();
        // Ne pas afficher de notification pour 401 (redirection déjà effectuée)
      } else if (shouldShowNotification(status)) {
        // Afficher une notification pour les autres erreurs
        notificationStore.error(errorMessage);
      }
      
      // Logger l'erreur en mode développement
      logError(formattedError, url);
      
      // Retourner l'erreur formatée pour gestion locale si nécessaire
      return Promise.reject(formattedError);
    }
    
    // Si l'erreur n'a pas de réponse (réseau, timeout, etc.)
    if (error.request) {
      const networkErrorMessage = 'Impossible de contacter le serveur. Vérifiez votre connexion.';
      const formattedError = {
        status: null,
        message: networkErrorMessage,
        data: null,
        originalError: error,
      };
      
      // Afficher une notification pour les erreurs réseau
      notificationStore.error(networkErrorMessage);
      
      // Logger l'erreur en mode développement
      logError(formattedError, error.config?.url);
      
      return Promise.reject(formattedError);
    }
    
    // Autre type d'erreur
    const unexpectedErrorMessage = error.message || 'Une erreur inattendue est survenue';
    const formattedError = {
      status: null,
      message: unexpectedErrorMessage,
      data: null,
      originalError: error,
    };
    
    // Afficher une notification pour les erreurs inattendues
    notificationStore.error(unexpectedErrorMessage);
    
    // Logger l'erreur en mode développement
    logError(formattedError);
    
    return Promise.reject(formattedError);
  }
);

/**
 * Fonctions helper pour les requêtes HTTP.
 */

/**
 * Effectue une requête GET.
 * 
 * @param {string} url - L'URL de l'endpoint (relative à l'API_PREFIX)
 * @param {object} config - Configuration axios optionnelle (params, headers, etc.)
 * @returns {Promise} La réponse de l'API
 * 
 * @example
 * const data = await api.get('/clients');
 * const client = await api.get('/clients/1');
 * const filtered = await api.get('/clients', { params: { search: 'test' } });
 */
export const get = async (url, config = {}) => {
  try {
    const response = await api.get(url, config);
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Effectue une requête POST.
 * 
 * @param {string} url - L'URL de l'endpoint (relative à l'API_PREFIX)
 * @param {object} data - Les données à envoyer dans le corps de la requête
 * @param {object} config - Configuration axios optionnelle
 * @returns {Promise} La réponse de l'API
 * 
 * @example
 * const newClient = await api.post('/clients', { nom_client: 'Nouveau Client' });
 */
export const post = async (url, data = {}, config = {}) => {
  try {
    const response = await api.post(url, data, config);
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Effectue une requête PUT.
 * 
 * @param {string} url - L'URL de l'endpoint (relative à l'API_PREFIX)
 * @param {object} data - Les données à envoyer dans le corps de la requête
 * @param {object} config - Configuration axios optionnelle
 * @returns {Promise} La réponse de l'API
 * 
 * @example
 * const updated = await api.put('/clients/1', { nom_client: 'Client Modifié' });
 */
export const put = async (url, data = {}, config = {}) => {
  try {
    const response = await api.put(url, data, config);
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Effectue une requête PATCH.
 * 
 * @param {string} url - L'URL de l'endpoint (relative à l'API_PREFIX)
 * @param {object} data - Les données à envoyer dans le corps de la requête
 * @param {object} config - Configuration axios optionnelle
 * @returns {Promise} La réponse de l'API
 * 
 * @example
 * const patched = await api.patch('/clients/1', { nom_client: 'Client Partiellement Modifié' });
 */
export const patch = async (url, data = {}, config = {}) => {
  try {
    const response = await api.patch(url, data, config);
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Effectue une requête DELETE.
 * 
 * @param {string} url - L'URL de l'endpoint (relative à l'API_PREFIX)
 * @param {object} config - Configuration axios optionnelle
 * @returns {Promise} La réponse de l'API
 * 
 * @example
 * await api.delete('/clients/1');
 */
export const del = async (url, config = {}) => {
  try {
    const response = await api.delete(url, config);
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Récupère la liste des produits filtrés par type de transaction.
 * 
 * @param {string} typeTransaction - Type de transaction ('client' ou 'fournisseur')
 * @param {object} params - Paramètres optionnels (skip, limit, est_actif, recherche)
 * @returns {Promise} La liste des produits filtrés
 * 
 * @example
 * const produitsClient = await getProduitsParType('client');
 * const produitsFournisseur = await getProduitsParType('fournisseur', { est_actif: true });
 */
export const getProduitsParType = async (typeTransaction, params = {}) => {
  try {
    const response = await api.get(`/produits/par-type/${typeTransaction}`, { params });
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Exporte également l'instance axios pour des cas d'usage avancés.
 * Utile si vous avez besoin d'accéder directement à axios (ex: upload de fichiers).
 */
export default api;

