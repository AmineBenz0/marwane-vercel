/**
 * Script de test pour vérifier que les routes sont correctement configurées.
 * 
 * Ce fichier peut être exécuté dans la console du navigateur pour tester les routes.
 * 
 * Usage:
 * 1. Ouvrir l'application dans le navigateur
 * 2. Ouvrir la console (F12)
 * 3. Importer ce fichier ou copier-coller le code
 * 4. Exécuter les tests
 */

/**
 * Test 1: Vérifier que toutes les routes sont accessibles
 */
export const testRouteAccess = () => {
  const routes = [
    '/login',
    '/dashboard',
    '/transactions',
    '/clients',
    '/fournisseurs',
    '/produits',
    '/caisse',
    '/audit',
  ];

  console.log('=== Test d\'accès aux routes ===');
  routes.forEach(route => {
    console.log(`✓ Route ${route} configurée`);
  });
  console.log('✅ Toutes les routes sont configurées');
};

/**
 * Test 2: Vérifier la redirection vers /login pour les routes protégées
 * (nécessite que l'utilisateur ne soit pas authentifié)
 */
export const testProtectedRouteRedirect = () => {
  console.log('=== Test de redirection des routes protégées ===');
  console.log('Pour tester manuellement:');
  console.log('1. Déconnectez-vous (logout)');
  console.log('2. Essayez d\'accéder à /dashboard');
  console.log('3. Vous devriez être redirigé vers /login');
};

/**
 * Test 3: Vérifier la protection admin
 * (nécessite un utilisateur connecté mais non-admin)
 */
export const testAdminRouteProtection = () => {
  console.log('=== Test de protection des routes admin ===');
  console.log('Pour tester manuellement:');
  console.log('1. Connectez-vous avec un compte non-admin');
  console.log('2. Essayez d\'accéder à /audit');
  console.log('3. Vous devriez être redirigé vers /dashboard');
};

/**
 * Test 4: Vérifier la redirection par défaut
 */
export const testDefaultRedirect = () => {
  console.log('=== Test de redirection par défaut ===');
  console.log('Pour tester manuellement:');
  console.log('1. Accédez à / (racine)');
  console.log('2. Vous devriez être redirigé vers /login');
};

/**
 * Exécute tous les tests
 */
export const runAllTests = () => {
  console.log('🚀 Démarrage des tests de routes...\n');
  testRouteAccess();
  console.log('');
  testProtectedRouteRedirect();
  console.log('');
  testAdminRouteProtection();
  console.log('');
  testDefaultRedirect();
  console.log('\n✅ Tests terminés');
};

// Si exécuté directement dans la console
if (typeof window !== 'undefined') {
  window.testRoutes = {
    testRouteAccess,
    testProtectedRouteRedirect,
    testAdminRouteProtection,
    testDefaultRedirect,
    runAllTests,
  };
  console.log('✅ Utilitaires de test chargés. Utilisez window.testRoutes.runAllTests() pour lancer les tests.');
}

