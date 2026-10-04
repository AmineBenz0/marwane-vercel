import { Chip } from '@mui/material';

const LCStatusBadge = ({ statut, estDisponible = false, size = 'small' }) => {
  const isActive = statut === 'active';
  const isCancelled = statut === 'annulee';
  const label = isActive ? (estDisponible ? 'Disponible' : 'À venir') : 'Utilisée';
  const color = isActive ? (estDisponible ? 'success' : 'warning') : 'default';

  return (
    <Chip
      label={isCancelled ? 'Annulée' : label}
      color={isCancelled ? 'error' : color}
      size={size}
      variant="outlined"
      sx={{
        fontWeight: 700,
        height: size === 'small' ? 24 : undefined,
      }}
    />
  );
};

export default LCStatusBadge;
