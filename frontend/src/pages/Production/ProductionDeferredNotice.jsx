import { Alert, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export default function ProductionDeferredNotice({ savedProduction }) {
  const navigate = useNavigate();
  const assignments = (savedProduction?.reservations_stock || []).filter(row => Number(row.quantite) > 0);
  if (!assignments.length) return null;
  const quantity = assignments.reduce((sum, row) => sum + Number(row.quantite), 0).toLocaleString('fr-FR');
  const params = new URLSearchParams({ view: 'deferred', stock: 'reserved' });
  if (savedProduction.id_batiment) params.set('building', savedProduction.id_batiment);
  return <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => navigate(`/transactions?${params}`)}>Voir les ventes</Button>}>
    {quantity} œufs réservés pour {assignments.length} vente{assignments.length > 1 ? 's' : ''}.
  </Alert>;
}
