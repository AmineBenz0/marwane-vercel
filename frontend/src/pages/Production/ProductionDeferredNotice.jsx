import { Alert, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import useDeferredSales from '../Transactions/useDeferredSales';

export default function ProductionDeferredNotice({ refreshKey }) {
  const navigate = useNavigate();
  const { sales, loading, error, reload } = useDeferredSales(refreshKey > 0, refreshKey);
  if (!refreshKey || loading) return null;
  if (error) return <Alert severity="warning" sx={{ mb: 2 }} action={<Button onClick={reload}>Réessayer</Button>}>
    Production enregistrée. La vérification des livraisons différées est indisponible.
  </Alert>;
  const count = sales.filter(sale => sale.quantite_reservee > 0).length;
  if (!count) return null;
  return <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => navigate('/transactions?view=deferred&stock=ready')}>Voir les ventes</Button>}>
    Production enregistrée. Du stock est disponible pour compléter {count} vente(s).
  </Alert>;
}
