/**
 * Composant AdminProtectedRoute pour protéger les routes nécessitant le rôle admin.
 * 
 * Redirige vers /login si l'utilisateur n'est pas authentifié.
 * Redirige vers /dashboard si l'utilisateur n'est pas admin.
 * Affiche un loader pendant la réhydratation du store.
 * 
 * @param {React.ReactNode} children - Les composants enfants à rendre si admin
 */

import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import useAuthStore from '../store/authStore';

const AdminProtectedRoute = ({ children }) => {
  const { isAuthenticated, isInitialized, user } = useAuthStore();

  // Attendre que le store soit initialisé avant de vérifier l'authentification
  // Cela évite une boucle de redirection lors du chargement initial
  if (!isInitialized) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

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

