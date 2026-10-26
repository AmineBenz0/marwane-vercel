import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Chip, Collapse, Divider, Stack, Typography } from '@mui/material';
import { formatShortDate } from '../../utils/dateFormatting';
import useDeferredSales from './useDeferredSales';

const number = value => Number(value || 0).toLocaleString('fr-FR');
export default function DeferredSalesCard() {
  const navigate = useNavigate();
  const { sales, loading, error, reload } = useDeferredSales();
  const [showWaiting, setShowWaiting] = useState(false);
  const pending = sales.filter(sale => sale.est_actif !== false && Number(sale.quantite_en_attente || 0) > 0);
  const reserved = pending.filter(sale => Number(sale.quantite_couverte || 0) > 0);
  const waiting = pending.filter(sale => Number(sale.quantite_couverte || 0) === 0);
  if (!error && pending.length === 0) return null;
  return <Box component="section" aria-label="Livraisons différées" aria-busy={loading} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1 }}>
      <Typography component="h3" fontWeight={800}>Livraisons différées</Typography>
      {!error && <Chip size="small" variant="outlined" label={`${pending.length} à suivre`}
        sx={{ bgcolor: 'action.hover', color: 'text.secondary', borderColor: 'divider', fontWeight: 700 }} />}
    </Stack>
    {error ?
      <Alert severity="warning" action={<Button onClick={reload}>Réessayer</Button>}>{error}</Alert> : <>
        <Stack spacing={1.5} divider={<Divider />}>
          {reserved.slice(0, 3).map(sale => <Box key={sale.id_transaction}>
            <Box sx={{ minWidth: 0 }}>
              <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{sale.nom_client} · #{sale.id_transaction}</Typography>
              <Typography variant="body2" color="text.secondary">{sale.nom_produit}{sale.nom_batiment ? ` · ${sale.nom_batiment}` : ''}</Typography>
              <Typography variant="body2" fontWeight={700}>{number(sale.quantite_couverte)} œufs réservés · {number(sale.quantite_en_attente)} à produire</Typography>
              {sale.date_livraison_prevue && <Typography variant="caption" color="text.secondary">Prévue le {formatShortDate(sale.date_livraison_prevue)}</Typography>}
            </Box>
          </Box>)}
        </Stack>
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
  </Box>;
}
