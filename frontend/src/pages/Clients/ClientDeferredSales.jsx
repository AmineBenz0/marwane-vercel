import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import { CheckCircleOutline } from '@mui/icons-material';
import ExpandableDetails from '../../components/ExpandableDetails';
import { get } from '../../services/api';
import { formatShortDate } from '../../utils/dateFormatting';
import DeferredSaleStockSummary from '../Transactions/DeferredSaleStockSummary';
import PaymentStatusBadge from '../../components/PaymentStatusBadge';

export default function ClientDeferredSales({ clientId, produitsMap }) {
  const navigate = useNavigate();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    const load = async () => {
      const rows = [];
      let page;
      do {
        page = await get('/transactions', { params: { id_client: Number(clientId), est_promesse: true, est_actif: true, skip: rows.length, limit: 100 } });
        rows.push(...page);
      } while (page.length === 100 && !cancelled);
      if (!cancelled) setSales(rows);
    };
    load().catch(err => { if (!cancelled) setError(err.message || 'Impossible de charger les livraisons différées.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId, revision]);
  const fullyReservedSales = sales.filter(sale => sale.quantite_en_attente === 0);
  const pendingSales = sales.filter(sale => sale.quantite_en_attente > 0);
  const saleCard = sale => <Box key={sale.id_transaction} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
          <Box><Typography fontWeight={700}>Vente #{sale.id_transaction} · {produitsMap.get(sale.id_produit) || `Produit #${sale.id_produit}`}</Typography>
            <Typography variant="body2">Prévue le {formatShortDate(sale.date_livraison_prevue)} · {sale.nom_batiment_source || 'Bâtiment non renseigné'}</Typography>
          </Box>
        </Stack>
        <Box sx={{ my: 2 }}><DeferredSaleStockSummary sale={sale} showStatus={false} /></Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button onClick={() => navigate(`/transactions/${sale.id_transaction}`)}>Détails et historique</Button>
          <Stack direction="row" alignItems="center" spacing={1}><Typography variant="caption" color="text.secondary">Paiement</Typography><PaymentStatusBadge statut={sale.est_en_retard ? 'en_retard' : (sale.statut_paiement || 'impaye')} /></Stack>
        </Stack>

  </Box>;
  return <Card variant="outlined" sx={{ mb: 3 }}><CardContent>
    <Typography component="h2" variant="h6" fontWeight={800} gutterBottom>Livraisons différées</Typography>
    {loading ? <CircularProgress size={24} aria-label="Chargement des livraisons du client" /> : error ? <Alert severity="warning" action={<Button onClick={() => setRevision(value => value + 1)}>Réessayer</Button>}>{error}</Alert> : !sales.length ? <Typography>Aucune livraison différée.</Typography> : <Stack spacing={2}>
      {pendingSales.map(saleCard)}
    </Stack>}
    {!loading && !error && fullyReservedSales.length > 0 && <ExpandableDetails
      label="Réservations complètes" icon={<CheckCircleOutline />} meta={fullyReservedSales.length}
      expanded={showCompleted} onChange={(_, next) => setShowCompleted(next)} sx={{ mt: 2 }}>
      <Stack spacing={2}>{fullyReservedSales.map(saleCard)}</Stack>
    </ExpandableDetails>}
  </CardContent></Card>;
}
