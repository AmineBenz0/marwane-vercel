/**
 * Page d'erreur affichée lorsqu'une erreur React non gérée est détectée.
 * 
 * Affiche un message clair pour l'utilisateur avec des options de récupération :
 * - Recharger la page
 * - Retourner à l'accueil
 * - Signaler le problème (optionnel)
 */

import React, { useState } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  Alert,
  Collapse,
  IconButton,
  Divider,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Home as HomeIcon,
  BugReport as BugReportIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  ErrorOutline as ErrorOutlineIcon,
} from '@mui/icons-material';

/**
 * Composant ErrorPage.
 * 
 * @param {Error} error - L'erreur qui a été capturée
 * @param {Object} errorInfo - Informations sur le composant qui a causé l'erreur
 * @param {Function} onReset - Fonction pour réinitialiser l'erreur (optionnel)
 */
function ErrorPage({ error, errorInfo, onReset }) {
  const [showDetails, setShowDetails] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  /**
   * Recharge la page complètement.
   */
  const handleReload = () => {
    window.location.reload();
  };

  /**
   * Redirige vers la page d'accueil (dashboard ou login selon l'état d'authentification).
   * 
   * Note: Ce composant est utilisé par un ErrorBoundary situé en dehors du Router.
   * On utilise donc window.location au lieu de useNavigate pour éviter les erreurs
   * "useNavigate() may be used only in the context of a <Router>".
   */
  const handleGoHome = () => {
    const token = localStorage.getItem('access_token');
    if (token) {
      window.location.href = '/dashboard';
    } else {
      window.location.href = '/login';
    }
  };

  /**
   * Réinitialise l'erreur si la fonction onReset est fournie.
   */
  const handleReset = () => {
    if (onReset) {
      onReset();
    } else {
      handleGoHome();
    }
  };

  /**
   * Signale le problème (peut être connecté à un endpoint backend).
   */
  const handleReportProblem = async () => {
    try {
      // Préparer les données du rapport
      const reportData = {
        error: error?.message,
        stack: error?.stack,
        componentStack: errorInfo?.componentStack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      };

      // Logger dans la console
      console.log('Problème signalé:', reportData);

      // Optionnel: Envoyer au backend si un endpoint existe
      // Pour l'instant, on log juste dans la console
      // Si un endpoint backend est créé plus tard, décommenter ce code:
      /*
      try {
        const { post } = await import('../../services/api');
        await post('/errors/report', reportData);
      } catch (apiError) {
        console.warn('Impossible d\'envoyer le rapport au backend:', apiError);
      }
      */

      // Marquer comme envoyé
      setReportSent(true);
    } catch (reportError) {
      console.error('Erreur lors du signalement du problème:', reportError);
      // Marquer quand même comme envoyé pour éviter les tentatives répétées
      setReportSent(true);
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 8, mb: 4 }}>
      <Paper
        elevation={3}
        sx={{
          p: 4,
          textAlign: 'center',
          borderRadius: 2,
        }}
      >
        {/* Icône d'erreur */}
        <Box sx={{ mb: 3 }}>
          <ErrorOutlineIcon
            sx={{
              fontSize: 80,
              color: 'error.main',
              mb: 2,
            }}
          />
        </Box>

        {/* Titre */}
        <Typography variant="h4" component="h1" gutterBottom color="error">
          Oups ! Une erreur est survenue
        </Typography>

        {/* Message principal */}
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Désolé, une erreur inattendue s'est produite dans l'application.
          <br />
          Veuillez essayer de recharger la page ou retourner à l'accueil.
        </Typography>

        {/* Message d'erreur si disponible (en mode développement) */}
        {(import.meta.env.DEV || import.meta.env.MODE === 'development') && error && (
          <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
            <Typography variant="subtitle2" gutterBottom>
              Erreur: {error.message}
            </Typography>
          </Alert>
        )}

        {/* Boutons d'action */}
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            justifyContent: 'center',
            flexWrap: 'wrap',
            mb: 3,
          }}
        >
          <Button
            variant="contained"
            color="primary"
            startIcon={<RefreshIcon />}
            onClick={handleReload}
            size="large"
          >
            Recharger la page
          </Button>

          <Button
            variant="outlined"
            color="primary"
            startIcon={<HomeIcon />}
            onClick={handleGoHome}
            size="large"
          >
            Retour à l'accueil
          </Button>

          {onReset && (
            <Button
              variant="outlined"
              color="secondary"
              onClick={handleReset}
              size="large"
            >
              Réessayer
            </Button>
          )}
        </Box>

        {/* Bouton pour signaler le problème */}
        <Box sx={{ mb: 3 }}>
          <Button
            variant="text"
            color="inherit"
            startIcon={<BugReportIcon />}
            onClick={handleReportProblem}
            disabled={reportSent}
            size="medium"
          >
            {reportSent ? 'Problème signalé ✓' : 'Signaler le problème'}
          </Button>
        </Box>

        {/* Détails de l'erreur (développement uniquement) */}
        {(error || errorInfo) && (
          <>
            <Divider sx={{ my: 3 }} />
            <Box>
              <Button
                variant="text"
                onClick={() => setShowDetails(!showDetails)}
                endIcon={showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                size="small"
                sx={{ mb: 2 }}
              >
                {showDetails ? 'Masquer' : 'Afficher'} les détails techniques
              </Button>

              <Collapse in={showDetails}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    backgroundColor: 'grey.50',
                    textAlign: 'left',
                    maxHeight: 400,
                    overflow: 'auto',
                  }}
                >
                  {error && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Message d'erreur:
                      </Typography>
                      <Typography
                        variant="body2"
                        component="pre"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          backgroundColor: 'white',
                          p: 1,
                          borderRadius: 1,
                        }}
                      >
                        {error.toString()}
                      </Typography>
                    </Box>
                  )}

                  {error?.stack && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Stack trace:
                      </Typography>
                      <Typography
                        variant="body2"
                        component="pre"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          backgroundColor: 'white',
                          p: 1,
                          borderRadius: 1,
                        }}
                      >
                        {error.stack}
                      </Typography>
                    </Box>
                  )}

                  {errorInfo?.componentStack && (
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        Component stack:
                      </Typography>
                      <Typography
                        variant="body2"
                        component="pre"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          backgroundColor: 'white',
                          p: 1,
                          borderRadius: 1,
                        }}
                      >
                        {errorInfo.componentStack}
                      </Typography>
                    </Box>
                  )}
                </Paper>
              </Collapse>
            </Box>
          </>
        )}
      </Paper>
    </Container>
  );
}

export default ErrorPage;

