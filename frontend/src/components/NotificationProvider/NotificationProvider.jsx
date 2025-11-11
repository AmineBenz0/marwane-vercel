/**
 * Composant NotificationProvider.
 * 
 * Affiche les notifications depuis le store Zustand en utilisant MUI Snackbar.
 * 
 * Caractéristiques :
 * - Affiche les notifications une par une (queue)
 * - Auto-dismiss après la durée configurée
 * - Supporte les types : success, error, warning, info
 * - Position configurable
 * - Supporte les actions personnalisées
 */

import React, { useEffect, useState } from 'react';
import { Snackbar, Alert, IconButton, Button } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import useNotificationStore from '../../store/notificationStore';

/**
 * Composant NotificationProvider.
 * 
 * Doit être placé à la racine de l'application (dans App.jsx).
 */
function NotificationProvider({ children }) {
  const { notifications, removeNotification } = useNotificationStore();
  const [currentNotification, setCurrentNotification] = useState(null);

  /**
   * Gère l'affichage des notifications une par une.
   * Quand une notification est ajoutée à la queue, on l'affiche.
   * Quand elle est fermée, on passe à la suivante.
   */
  useEffect(() => {
    if (notifications.length > 0) {
      // Si aucune notification n'est affichée, afficher la première
      if (!currentNotification) {
        setCurrentNotification(notifications[0]);
      } 
      // Si la notification actuelle n'est plus dans la queue, passer à la suivante
      else if (!notifications.find(n => n.id === currentNotification.id)) {
        setCurrentNotification(notifications[0]);
      }
    } else if (notifications.length === 0 && currentNotification) {
      // Plus de notifications, réinitialiser
      setCurrentNotification(null);
    }
  }, [notifications, currentNotification]);

  /**
   * Gère la fermeture de la notification actuelle.
   */
  const handleClose = (event, reason) => {
    // Ne pas fermer si l'utilisateur clique ailleurs (clickaway)
    if (reason === 'clickaway') {
      return;
    }

    if (currentNotification) {
      // Supprimer la notification actuelle
      removeNotification(currentNotification.id);
      setCurrentNotification(null);
    }
  };

  /**
   * Gère l'action personnalisée si présente.
   */
  const handleAction = () => {
    if (currentNotification?.onAction) {
      currentNotification.onAction();
    }
    handleClose(null, 'action');
  };

  const { message, type, anchorOrigin, persist, actionLabel, onAction } = currentNotification || {};

  return (
    <>
      {/* Rendre les enfants (le reste de l'application) */}
      {children}
      
      {/* Afficher la notification si elle existe */}
      {currentNotification && (
        <Snackbar
          open={!!currentNotification}
          autoHideDuration={persist ? null : currentNotification.duration}
          onClose={handleClose}
          anchorOrigin={anchorOrigin}
          sx={{
            // Permettre l'affichage de plusieurs notifications en empilant
            '& .MuiSnackbar-root': {
              position: 'relative',
            },
          }}
          // Action personnalisée si présente
          action={
            <>
              {onAction && actionLabel && (
                <Button
                  color="inherit"
                  size="small"
                  onClick={handleAction}
                  sx={{ mr: 1 }}
                >
                  {actionLabel}
                </Button>
              )}
              <IconButton
                size="small"
                aria-label="close"
                color="inherit"
                onClick={handleClose}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </>
          }
        >
          <Alert
            onClose={handleClose}
            severity={type}
            variant="filled"
            sx={{
              width: '100%',
              // Styles personnalisés selon le type
              ...(type === 'success' && {
                backgroundColor: '#2e7d32',
              }),
              ...(type === 'error' && {
                backgroundColor: '#d32f2f',
              }),
              ...(type === 'warning' && {
                backgroundColor: '#ed6c02',
              }),
              ...(type === 'info' && {
                backgroundColor: '#0288d1',
              }),
            }}
          >
            {message}
          </Alert>
        </Snackbar>
      )}
    </>
  );
}

export default NotificationProvider;

