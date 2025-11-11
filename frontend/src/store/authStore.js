/**
 * Store Zustand pour la gestion de l'authentification.
 * 
 * Gère :
 * - L'utilisateur connecté (id, email, role)
 * - Les tokens (access + refresh)
 * - Les fonctions : login, logout, refreshToken
 * - La persistance dans localStorage
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { post } from '../services/api';

/**
 * Décode le payload d'un token JWT.
 * Les tokens JWT sont au format: header.payload.signature
 * Le payload est en base64url et contient les informations de l'utilisateur.
 * 
 * @param {string} token - Le token JWT à décoder
 * @returns {object|null} Le payload décodé ou null en cas d'erreur
 */
const decodeJWT = (token) => {
  try {
    // Un JWT est composé de 3 parties séparées par des points
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Le payload est la deuxième partie
    const payload = parts[1];

    // Décoder le base64url (remplacer les caractères spécifiques au base64url)
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64);

    // Parser le JSON
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Erreur lors du décodage du token JWT:', error);
    return null;
  }
};

/**
 * Extrait les informations utilisateur depuis un token JWT.
 * 
 * @param {string} accessToken - Le token d'accès JWT
 * @returns {object|null} Les informations utilisateur (id, email, role) ou null
 */
const extractUserFromToken = (accessToken) => {
  const payload = decodeJWT(accessToken);
  if (!payload) {
    return null;
  }

  return {
    id: parseInt(payload.sub) || null,
    email: payload.email || null,
    role: payload.role || null,
  };
};

/**
 * Store Zustand pour l'authentification.
 * 
 * État initial :
 * - user: null (pas d'utilisateur connecté)
 * - accessToken: null
 * - refreshToken: null
 * - isAuthenticated: false
 * 
 * Actions :
 * - login: Connecte un utilisateur avec email et mot de passe
 * - logout: Déconnecte l'utilisateur et nettoie le store
 * - refreshToken: Rafraîchit le token d'accès en utilisant le refresh token
 * - setUser: Met à jour les informations utilisateur (utilisé après refresh)
 */
const useAuthStore = create(
  persist(
    (set, get) => ({
      // État initial
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      /**
       * Connecte un utilisateur avec son email et mot de passe.
       * 
       * @param {string} email - L'email de l'utilisateur
       * @param {string} password - Le mot de passe de l'utilisateur
       * @returns {Promise<object>} Les informations de l'utilisateur connecté
       * @throws {Error} Si la connexion échoue
       */
      login: async (email, password) => {
        try {
          // Appeler l'endpoint de connexion
          const response = await post('/auth/login', {
            email,
            mot_de_passe: password,
          });

          // Extraire les tokens de la réponse
          const { access_token, refresh_token } = response;

          // Extraire les informations utilisateur depuis le token
          const user = extractUserFromToken(access_token);

          if (!user || !user.id || !user.email) {
            throw new Error('Impossible d\'extraire les informations utilisateur du token');
          }

          // Mettre à jour le store
          set({
            user,
            accessToken: access_token,
            refreshToken: refresh_token,
            isAuthenticated: true,
          });

          // Mettre à jour le localStorage pour l'API service
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', refresh_token);

          return user;
        } catch (error) {
          // En cas d'erreur, nettoyer le store
          get().logout();
          throw error;
        }
      },

      /**
       * Déconnecte l'utilisateur et nettoie le store.
       */
      logout: () => {
        // Nettoyer le store
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });

        // Nettoyer le localStorage
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      },

      /**
       * Rafraîchit le token d'accès en utilisant le refresh token.
       * 
       * @returns {Promise<string>} Le nouveau token d'accès
       * @throws {Error} Si le rafraîchissement échoue
       */
      refreshToken: async () => {
        const { refreshToken: currentRefreshToken } = get();

        if (!currentRefreshToken) {
          throw new Error('Aucun refresh token disponible');
        }

        try {
          // Appeler l'endpoint de rafraîchissement
          const response = await post('/auth/refresh', {
            refresh_token: currentRefreshToken,
          });

          // Extraire le nouveau token d'accès
          const { access_token } = response;

          // Extraire les informations utilisateur depuis le nouveau token
          const user = extractUserFromToken(access_token);

          if (!user || !user.id || !user.email) {
            throw new Error('Impossible d\'extraire les informations utilisateur du nouveau token');
          }

          // Mettre à jour le store avec le nouveau token et les informations utilisateur
          set({
            user,
            accessToken: access_token,
            isAuthenticated: true,
          });

          // Mettre à jour le localStorage
          localStorage.setItem('access_token', access_token);

          return access_token;
        } catch (error) {
          // En cas d'erreur (token expiré, invalide, etc.), déconnecter l'utilisateur
          console.error('Erreur lors du rafraîchissement du token:', error);
          get().logout();
          throw error;
        }
      },

      /**
       * Met à jour les informations utilisateur.
       * Utile après un rafraîchissement de token ou une mise à jour du profil.
       * 
       * @param {object} userData - Les nouvelles informations utilisateur
       */
      setUser: (userData) => {
        set({ user: userData });
      },

      /**
       * Initialise le store depuis le localStorage.
       * Vérifie si un token existe et restaure l'état d'authentification.
       * Cette fonction est appelée automatiquement au chargement de l'application.
       */
      initialize: () => {
        const accessToken = localStorage.getItem('access_token');
        const refreshToken = localStorage.getItem('refresh_token');

        if (accessToken && refreshToken) {
          // Extraire les informations utilisateur depuis le token
          const user = extractUserFromToken(accessToken);

          if (user && user.id && user.email) {
            // Restaurer l'état d'authentification
            set({
              user,
              accessToken,
              refreshToken,
              isAuthenticated: true,
            });
          } else {
            // Si le token est invalide, nettoyer
            get().logout();
          }
        } else {
          // Pas de tokens, s'assurer que le store est vide
          get().logout();
        }
      },
    }),
    {
      // Configuration de la persistance
      name: 'auth-storage', // Nom de la clé dans localStorage
      storage: createJSONStorage(() => localStorage),
      // Persister uniquement les tokens et l'état d'authentification
      // Les informations utilisateur seront recalculées depuis le token
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      // Callback appelé après la réhydratation depuis localStorage
      onRehydrateStorage: () => (state) => {
        // Après la réhydratation, recalculer l'utilisateur depuis le token
        if (state && state.accessToken) {
          const user = extractUserFromToken(state.accessToken);
          if (user && user.id && user.email) {
            state.user = user;
            state.isAuthenticated = true;
            // S'assurer que les tokens sont dans localStorage pour l'API service
            localStorage.setItem('access_token', state.accessToken);
            if (state.refreshToken) {
              localStorage.setItem('refresh_token', state.refreshToken);
            }
          } else {
            // Token invalide, nettoyer
            state.user = null;
            state.accessToken = null;
            state.refreshToken = null;
            state.isAuthenticated = false;
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
          }
        }
      },
    }
  )
);

// Initialiser le store au chargement si les tokens existent dans localStorage
// mais ne sont pas encore dans le store (cas de première utilisation)
if (typeof window !== 'undefined') {
  const storedAccessToken = localStorage.getItem('access_token');
  const storedRefreshToken = localStorage.getItem('refresh_token');
  const storeState = useAuthStore.getState();
  
  // Si des tokens existent dans localStorage mais pas dans le store, initialiser
  if ((storedAccessToken || storedRefreshToken) && !storeState.accessToken) {
    storeState.initialize();
  }
}

export default useAuthStore;

