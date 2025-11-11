# Tests des Routes - Guide de Vérification

Ce document décrit comment tester manuellement que les routes fonctionnent correctement.

## Prérequis

1. Installer les dépendances : `npm install`
2. Démarrer le serveur de développement : `npm run dev`
3. Ouvrir l'application dans le navigateur : http://localhost:3000

## Tests à Effectuer

### Test 1 : Route publique `/login`

**Objectif** : Vérifier que la page de connexion est accessible sans authentification.

**Étapes** :
1. Ouvrir http://localhost:3000/login
2. ✅ **Résultat attendu** : La page Login s'affiche sans redirection

---

### Test 2 : Redirection par défaut `/`

**Objectif** : Vérifier que la route racine redirige vers `/login`.

**Étapes** :
1. Ouvrir http://localhost:3000/
2. ✅ **Résultat attendu** : Redirection automatique vers `/login`

---

### Test 3 : Routes protégées sans authentification

**Objectif** : Vérifier que les routes protégées redirigent vers `/login` si l'utilisateur n'est pas authentifié.

**Routes à tester** :
- `/dashboard`
- `/transactions`
- `/clients`
- `/fournisseurs`
- `/produits`
- `/caisse`

**Étapes pour chaque route** :
1. S'assurer d'être déconnecté (vider localStorage si nécessaire)
2. Accéder directement à la route (ex: http://localhost:3000/dashboard)
3. ✅ **Résultat attendu** : Redirection automatique vers `/login`

**Vérification dans la console** :
```javascript
// Vérifier l'état d'authentification
localStorage.getItem('access_token') // devrait être null
```

---

### Test 4 : Route admin `/audit` sans authentification

**Objectif** : Vérifier que la route admin redirige vers `/login` si non authentifié.

**Étapes** :
1. S'assurer d'être déconnecté
2. Accéder à http://localhost:3000/audit
3. ✅ **Résultat attendu** : Redirection automatique vers `/login`

---

### Test 5 : Route admin `/audit` avec utilisateur non-admin

**Objectif** : Vérifier que la route admin redirige vers `/dashboard` si l'utilisateur n'est pas admin.

**Étapes** :
1. Se connecter avec un compte utilisateur (non-admin)
2. Accéder à http://localhost:3000/audit
3. ✅ **Résultat attendu** : Redirection automatique vers `/dashboard`

**Note** : Ce test nécessite un backend fonctionnel avec des utilisateurs de test.

---

### Test 6 : Routes protégées avec authentification

**Objectif** : Vérifier que les routes protégées sont accessibles quand l'utilisateur est authentifié.

**Étapes** :
1. Se connecter avec un compte valide
2. Accéder à chaque route protégée :
   - `/dashboard`
   - `/transactions`
   - `/clients`
   - `/fournisseurs`
   - `/produits`
   - `/caisse`
3. ✅ **Résultat attendu** : Chaque page s'affiche correctement

---

### Test 7 : Route admin `/audit` avec utilisateur admin

**Objectif** : Vérifier que la route admin est accessible pour les administrateurs.

**Étapes** :
1. Se connecter avec un compte admin
2. Accéder à http://localhost:3000/audit
3. ✅ **Résultat attendu** : La page Audit s'affiche

---

### Test 8 : Route inconnue (404)

**Objectif** : Vérifier que les routes inconnues redirigent vers `/login`.

**Étapes** :
1. Accéder à une route inexistante (ex: http://localhost:3000/route-inexistante)
2. ✅ **Résultat attendu** : Redirection automatique vers `/login`

---

## Vérification Programmatique

Pour vérifier l'état d'authentification dans la console du navigateur :

```javascript
// Importer le store (si disponible)
import useAuthStore from './src/store/authStore';

// Vérifier l'état
const { isAuthenticated, user } = useAuthStore.getState();
console.log('Authentifié:', isAuthenticated);
console.log('Utilisateur:', user);

// Vérifier les tokens
console.log('Access Token:', localStorage.getItem('access_token'));
console.log('Refresh Token:', localStorage.getItem('refresh_token'));
```

## Checklist de Validation

- [ ] Route `/login` accessible sans authentification
- [ ] Route `/` redirige vers `/login`
- [ ] Routes protégées redirigent vers `/login` si non authentifié
- [ ] Route `/audit` redirige vers `/login` si non authentifié
- [ ] Route `/audit` redirige vers `/dashboard` si utilisateur non-admin
- [ ] Routes protégées accessibles si authentifié
- [ ] Route `/audit` accessible si admin
- [ ] Routes inconnues redirigent vers `/login`

## Notes

- Les tests nécessitant une authentification réelle nécessitent un backend fonctionnel
- Pour tester sans backend, vous pouvez simuler l'authentification en modifiant directement le localStorage :
  ```javascript
  // Simuler un utilisateur connecté (non-admin)
  localStorage.setItem('access_token', 'fake-token');
  useAuthStore.setState({
    isAuthenticated: true,
    user: { id: 1, email: 'test@example.com', role: 'user' }
  });
  
  // Simuler un admin
  useAuthStore.setState({
    isAuthenticated: true,
    user: { id: 1, email: 'admin@example.com', role: 'admin' }
  });
  ```

