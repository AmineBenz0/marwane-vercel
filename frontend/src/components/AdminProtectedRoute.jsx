/**
 * Composant AdminProtectedRoute pour protéger les routes nécessitant le rôle admin.
 * 
 * Redirige vers /login si l'utilisateur n'est pas authentifié.
 * Redirige vers /dashboard si l'utilisateur n'est pas admin.
 * 
 * @param {React.ReactNode} children - Les composants enfants à rendre si admin
 */

import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

const AdminProtectedRoute = ({ children }) => {
  const { isAuthenticated, user } = useAuthStore();

  // Si l'utilisateur n'est pas authentifié, rediriger vers la page de connexion
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Si l'utilisateur n'est pas admin, rediriger vers le dashboard
  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  // Si admin, rendre les enfants
  return children;
};

export default AdminProtectedRoute;

