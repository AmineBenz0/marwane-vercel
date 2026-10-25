import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { get } from '../../services/api';
import { formatShortDate } from '../../utils/dateFormatting';
import DeferredSaleCompletionDialog from '../Transactions/DeferredSaleCompletionDialog';
import { deferredSaleStatus } from '../Transactions/deferredSaleStatus';

const number = value => Number(value || 0).toLocaleString('fr-FR');
export default function ClientDeferredSales({ clientId, produitsMap, onCompleted }) {
  const navigate = useNavigate();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
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
  const completedSales = sales.filter(sale => sale.quantite_en_attente === 0);
  const displayedSales = sales.filter(sale => sale.quantite_en_attente > 0 || showCompleted);
  return <Card variant="outlined" sx={{ mb: 3 }}><CardContent>
    <Typography component="h2" variant="h6" fontWeight={800} gutterBottom>Livraisons différées</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Suivi des œufs à fournir, indépendamment du paiement.</Typography>
    {loading ? <CircularProgress size={24} aria-label="Chargement des livraisons du client" /> : error ? <Alert severity="warning" action={<Button onClick={() => setRevision(value => value + 1)}>Réessayer</Button>}>{error}</Alert> : !sales.length ? <Typography>Aucune livraison différée.</Typography> : <Stack spacing={2}>
      {displayedSales.map(sale => <Box key={sale.id_transaction} sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
          <Box><Typography fontWeight={700}>Vente #{sale.id_transaction} · {produitsMap.get(sale.id_produit) || `Produit #${sale.id_produit}`}</Typography>
            <Typography variant="body2">Prévue le {formatShortDate(sale.date_livraison_prevue)} · {sale.nom_batiment_source || 'Bâtiment non renseigné'}</Typography>
          </Box><Chip size="small" color={deferredSaleStatus(sale).color} label={deferredSaleStatus(sale).label} />
        </Stack>
        <Typography sx={{ my: 1 }}>{number(sale.quantite_couverte)} œufs couverts · {number(sale.quantite_en_attente)} restants · {number(sale.quantite_reservee)} réservés disponibles</Typography>
        <Stack direction="row" spacing={1}>
          {sale.quantite_reservee > 0 && <Button variant="contained" onClick={() => setSelected(sale.id_transaction)}>Compléter la vente #{sale.id_transaction}</Button>}
          <Button onClick={() => navigate(`/transactions/${sale.id_transaction}`)}>Détails et historique</Button>
        </Stack>
      </Box>)}
    </Stack>}
    {!loading && !error && completedSales.length > 0 && <Button sx={{ mt: 2 }} aria-expanded={showCompleted} onClick={() => setShowCompleted(value => !value)}>{showCompleted ? 'Masquer' : 'Voir'} {completedSales.length} livraison(s) complétée(s)</Button>}
    <DeferredSaleCompletionDialog open={selected !== null} transactionId={selected} onClose={() => setSelected(null)} onCompleted={updated => {
      setSelected(null); setRevision(value => value + 1); onCompleted?.(updated);
    }} />
  </CardContent></Card>;
}
