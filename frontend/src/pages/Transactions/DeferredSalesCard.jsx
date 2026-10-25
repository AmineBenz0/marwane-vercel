import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Collapse, Divider, Stack, Typography } from '@mui/material';
import { formatShortDate } from '../../utils/dateFormatting';
import DeferredSaleCompletionDialog from './DeferredSaleCompletionDialog';
import useDeferredSales from './useDeferredSales';

const number = value => Number(value || 0).toLocaleString('fr-FR');
export default function DeferredSalesCard() {
  const navigate = useNavigate();
  const { sales, loading, error, reload } = useDeferredSales();
  const [selectedId, setSelectedId] = useState(null);
  const [showWaiting, setShowWaiting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const ready = sales.filter(sale => sale.quantite_reservee > 0);
  const waiting = sales.filter(sale => !sale.quantite_reservee);
  return <Box component="section" aria-label="Livraisons différées" sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1 }}>
      <Typography component="h3" fontWeight={800}>Livraisons différées</Typography>
      <Chip size="small" color="info" label={`${ready.length} à compléter`} />
    </Stack>
    {feedback && <Alert severity="success" sx={{ mb: 1 }}>{feedback}</Alert>}
    {loading ? <CircularProgress size={22} aria-label="Vérification des livraisons différées" /> : error ?
      <Alert severity="warning" action={<Button onClick={reload}>Réessayer</Button>}>{error}</Alert> : <>
        <Stack spacing={1.5} divider={<Divider />}>
          {ready.slice(0, 3).map(sale => <Stack key={sale.id_transaction} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{sale.nom_client} · #{sale.id_transaction}</Typography>
              <Typography variant="body2" color="text.secondary">{sale.nom_produit}{sale.nom_batiment ? ` · ${sale.nom_batiment}` : ''}</Typography>
              <Typography variant="body2" fontWeight={700}>{number(sale.quantite_en_attente)} œufs restants</Typography>
              {sale.date_livraison_prevue && <Typography variant="caption" color="text.secondary">Prévue le {formatShortDate(sale.date_livraison_prevue)}</Typography>}
            </Box>
            <Button variant="contained" onClick={() => setSelectedId(sale.id_transaction)} aria-label={`Compléter ${number(sale.quantite_reservee)} œufs pour la vente ${sale.id_transaction}`}>Compléter {number(sale.quantite_reservee)} œufs</Button>
          </Stack>)}
        </Stack>
        {!ready.length && <Typography variant="body2" color="text.secondary">{waiting.length ? 'Aucune vente à compléter avec le stock actuel.' : 'Toutes les livraisons différées sont complétées.'}</Typography>}
        {!!waiting.length && <>
          <Button size="small" onClick={() => setShowWaiting(value => !value)} aria-expanded={showWaiting} sx={{ mt: 1 }}>{waiting.length} vente(s) en attente de production</Button>
          <Collapse in={showWaiting}><Stack spacing={1} sx={{ py: 1 }}>
            {waiting.map(sale => <Box key={sale.id_transaction}>
              <Typography variant="body2" fontWeight={700}>{sale.nom_client} · #{sale.id_transaction}</Typography>
              <Typography variant="body2" color="text.secondary">{sale.nom_produit} · {number(sale.quantite_en_attente)} œufs restants</Typography>
            </Box>)}
          </Stack></Collapse>
        </>}
        <Button size="small" onClick={() => navigate('/transactions?view=deferred')} sx={{ mt: 1 }}>Voir les ventes</Button>
      </>}
    <DeferredSaleCompletionDialog open={selectedId !== null} transactionId={selectedId} onClose={() => setSelectedId(null)} onCompleted={updated => {
      setSelectedId(null);
      setFeedback(updated.quantite_en_attente > 0 ? `Vente #${updated.id_transaction} : ${number(updated.quantite_en_attente)} œufs restent à fournir.` : `Vente #${updated.id_transaction} : stock complet.`);
      reload();
    }} />
  </Box>;
}
