/**
 * Composant ProtectedRoute pour protéger les routes nécessitant une authentification.
 * 
 * Redirige vers /login si l'utilisateur n'est pas authentifié.
 * 
 * @param {React.ReactNode} children - Les composants enfants à rendre si authentifié
 */

import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore();

  // Si l'utilisateur n'est pas authentifié, rediriger vers la page de connexion
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Si authentifié, rendre les enfants
  return children;
};

export default ProtectedRoute;

