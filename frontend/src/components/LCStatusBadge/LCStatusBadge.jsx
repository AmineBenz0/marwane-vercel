import { Chip } from '@mui/material';

const LCStatusBadge = ({ statut, statutCycle, estDisponible = false, size = 'small' }) => {
  const lifecycleLabels = {
    detenue: estDisponible ? 'Disponible' : 'Détenue',
    transferee: 'Transférée au fournisseur',
    deposee: 'Déposée en banque',
    annulee: 'Annulée',
    a_verifier: statut === 'active' ? (estDisponible ? 'Disponible' : 'Non utilisée') : 'Utilisée',
  };
  const lifecycleColors = { detenue: estDisponible ? 'success' : 'warning', transferee: 'default', deposee: 'info', annulee: 'error', a_verifier: 'warning' };
  const label = statutCycle ? lifecycleLabels[statutCycle] || (statut === 'active' ? 'Non utilisée' : 'Utilisée') : (statut === 'active' ? (estDisponible ? 'Disponible' : 'À venir') : 'Utilisée');
  const color = statutCycle === 'a_verifier' ? 'default' : statutCycle ? lifecycleColors[statutCycle] || 'default' : (statut === 'active' ? (estDisponible ? 'success' : 'warning') : 'default');

  return (
    <Chip
      label={label}
      color={color}
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

