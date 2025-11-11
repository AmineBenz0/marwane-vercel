/**
 * Helper pour tester les routes manuellement dans la console du navigateur.
 * 
 * Usage dans la console :
 * 1. Ouvrir la console (F12)
 * 2. Copier-coller ce code ou importer ce fichier
 * 3. Utiliser les fonctions pour tester
 */

/**
 * Simule un utilisateur connecté (non-admin)
 */
export const simulateUserLogin = () => {
  const useAuthStore = require('../store/authStore').default;
  
  useAuthStore.setState({
    isAuthenticated: true,
    user: {
      id: 1,
      email: 'user@example.com',
      role: 'user'
    },
    accessToken: 'fake-access-token',
    refreshToken: 'fake-refresh-token'
  });
  
  localStorage.setItem('access_token', 'fake-access-token');
  localStorage.setItem('refresh_token', 'fake-refresh-token');
  
  console.log('✅ Utilisateur connecté (non-admin)');
  console.log('Vous pouvez maintenant tester les routes protégées');
};

/**
 * Simule un administrateur connecté
 */
export const simulateAdminLogin = () => {
  const useAuthStore = require('../store/authStore').default;
  
  useAuthStore.setState({
    isAuthenticated: true,
    user: {
      id: 1,
      email: 'admin@example.com',
      role: 'admin'
    },
    accessToken: 'fake-access-token',
    refreshToken: 'fake-refresh-token'
  });
  
  localStorage.setItem('access_token', 'fake-access-token');
  localStorage.setItem('refresh_token', 'fake-refresh-token');
  
  console.log('✅ Administrateur connecté');
  console.log('Vous pouvez maintenant tester la route /audit');
};

/**
 * Simule une déconnexion
 */
export const simulateLogout = () => {
  const useAuthStore = require('../store/authStore').default;
  
  useAuthStore.getState().logout();
  
  console.log('✅ Utilisateur déconnecté');
  console.log('Vous pouvez maintenant tester les redirections vers /login');
};

/**
 * Affiche l'état actuel de l'authentification
 */
export const checkAuthState = () => {
  const useAuthStore = require('../store/authStore').default;
  const state = useAuthStore.getState();
  
  console.log('=== État d\'authentification ===');
  console.log('Authentifié:', state.isAuthenticated);
  console.log('Utilisateur:', state.user);
  console.log('Access Token:', state.accessToken ? 'Présent' : 'Absent');
  console.log('Refresh Token:', state.refreshToken ? 'Présent' : 'Absent');
  console.log('LocalStorage Access Token:', localStorage.getItem('access_token') ? 'Présent' : 'Absent');
  console.log('LocalStorage Refresh Token:', localStorage.getItem('refresh_token') ? 'Présent' : 'Absent');
};

// Exposer les fonctions globalement pour faciliter les tests
if (typeof window !== 'undefined') {
  window.routeTestHelper = {
    simulateUserLogin,
    simulateAdminLogin,
    simulateLogout,
    checkAuthState,
  };
  console.log('✅ Helpers de test chargés. Utilisez:');
  console.log('  - window.routeTestHelper.simulateUserLogin()');
  console.log('  - window.routeTestHelper.simulateAdminLogin()');
  console.log('  - window.routeTestHelper.simulateLogout()');
  console.log('  - window.routeTestHelper.checkAuthState()');
}

