/**
 * Composant ProtectedRoute pour protéger les routes nécessitant une authentification.
 * 
 * Redirige vers /login si l'utilisateur n'est pas authentifié.
 * Affiche un loader pendant la réhydratation du store.
 * 
 * @param {React.ReactNode} children - Les composants enfants à rendre si authentifié
 */

import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import useAuthStore from '../store/authStore';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isInitialized } = useAuthStore();

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

  // Si authentifié, rendre les enfants
  return children;
};

export default ProtectedRoute;

