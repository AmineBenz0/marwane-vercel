import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Stack, Typography, Divider } from '@mui/material';
import { ArrowForwardRounded as ArrowForwardRoundedIcon, Inventory2Outlined } from '@mui/icons-material';
import useDeferredSales from './useDeferredSales';

const number = value => Number(value || 0).toLocaleString('fr-FR');
export default function DeferredSalesCard() {
  const navigate = useNavigate();
  const { sales, loading, error, reload } = useDeferredSales();
  const today = new Date().toISOString().slice(0, 10);
  const pending = sales.filter(sale => sale.est_actif !== false && Number(sale.quantite_en_attente || 0) > 0);
  const actionable = pending.filter(sale => Number(sale.quantite_reservee || 0) > 0 || (sale.date_livraison_prevue && sale.date_livraison_prevue <= today));
  const remaining = pending.reduce((total, sale) => total + Math.max(0, Number(sale.quantite_en_attente) - Number(sale.quantite_reservee || 0)), 0);
  if (!error && pending.length === 0) return null;
  return <Box component="section" aria-label="À traiter maintenant" aria-busy={loading} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
    {error ? <>
      <Typography component="h3" fontWeight={800} sx={{ mb: 1 }}>À traiter maintenant</Typography>
      <Alert severity="warning" action={<Button onClick={reload}>Réessayer</Button>}>{error}</Alert>
    </> : <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={1.5}>
      <Box><Typography component="h3" fontWeight={800}>À traiter maintenant</Typography><Typography variant="body2" color="text.secondary">{number(actionable.length)} action{actionable.length === 1 ? '' : 's'} prête{actionable.length === 1 ? '' : 's'} · {number(pending.length)} promesse{pending.length === 1 ? '' : 's'} en cours · {number(remaining)} œufs à produire</Typography></Box>
      <Button variant="outlined" size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate('/livraisons-a-suivre')} sx={{ flexShrink: 0 }}>Toutes les livraisons</Button>
    </Stack>}
    {!error && actionable.length > 0 && <Stack divider={<Divider />} sx={{ mt: 1.5 }}>
      {actionable.slice(0, 4).map(sale => {
        const ready = Number(sale.quantite_reservee || 0) > 0;
        return <Button key={sale.id_transaction} onClick={() => navigate(`/transactions/${sale.id_transaction}?from=deliveries`)} sx={{ py: 1.25, px: 0.5, justifyContent: 'flex-start', textAlign: 'left', color: 'text.primary' }}>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ width: '100%' }}><Inventory2Outlined color={ready ? 'success' : 'warning'} fontSize="small" /><Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" fontWeight={700} noWrap>{sale.nom_client} · Vente #{sale.id_transaction}</Typography><Typography variant="caption" color="text.secondary">{ready ? `${number(sale.quantite_reservee)} œufs prêts à compléter` : `Échéance dépassée · ${number(sale.quantite_en_attente)} œufs à produire`}</Typography></Box><ArrowForwardRoundedIcon fontSize="small" color="action" /></Stack>
        </Button>;
      })}
    </Stack>}
  </Box>;
}
