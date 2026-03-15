import React from 'react';
import { Chip } from '@mui/material';
import { 
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  SwapHoriz as SwapIcon,
  Error as ErrorIcon,
  Cancel as CancelIcon,
  AccessTime as AvailableIcon
} from '@mui/icons-material';

/**
 * Composant pour afficher un badge stylisé selon le statut d'une Lettre de Crédit.
 */
const LCStatusBadge = ({ statut, estDisponible = false }) => {
  const getStatusConfig = (statut) => {
    switch (statut?.toLowerCase()) {
      case 'active':
        return {
          label: estDisponible ? 'Disponible' : 'Active (Attente)',
          color: estDisponible ? 'success' : 'info',
          icon: estDisponible ? <CheckCircleIcon /> : <AvailableIcon />
        };
      case 'utilisee':
        return {
          label: 'Utilisée',
          color: 'default',
          icon: <ScheduleIcon />,
          variant: 'outlined'
        };
      case 'cedee':
        return {
          label: 'Cédée',
          color: 'warning',
          icon: <SwapIcon />
        };
      case 'expiree':
        return {
          label: 'Expirée',
          color: 'error',
          icon: <ErrorIcon />
        };
      case 'annulee':
        return {
          label: 'Annulée',
          color: 'default',
          icon: <CancelIcon />
        };
      default:
        return {
          label: statut || 'Inconnu',
          color: 'default',
          icon: <ScheduleIcon />
        };
    }
  };

  const config = getStatusConfig(statut);

  return (
    <Chip
      label={config.label}
      color={config.color}
      icon={config.icon}
      size="small"
      variant={config.variant || 'filled'}
      sx={{ 
        fontWeight: 'bold',
        '& .MuiChip-icon': { fontSize: '1.1rem' }
      }}
    />
  );
};

export default LCStatusBadge;
