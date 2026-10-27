import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { ArrowForwardRounded as ArrowForwardRoundedIcon } from '@mui/icons-material';
import useDeferredSales from './useDeferredSales';

const number = value => Number(value || 0).toLocaleString('fr-FR');
export default function DeferredSalesCard() {
  const navigate = useNavigate();
  const { sales, loading, error, reload } = useDeferredSales();
  const pending = sales.filter(sale => sale.est_actif !== false && Number(sale.quantite_en_attente || 0) > 0);
  const remaining = pending.reduce((total, sale) => total + Number(sale.quantite_en_attente), 0);
  if (!error && pending.length === 0) return null;
  return <Box component="section" aria-label="Livraisons différées" aria-busy={loading} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
    {error ? <>
      <Typography component="h3" fontWeight={800} sx={{ mb: 1 }}>Livraisons différées</Typography>
      <Alert severity="warning" action={<Button onClick={reload}>Réessayer</Button>}>{error}</Alert>
    </> : <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={1.5}>
      <Box>
        <Typography component="h3" fontWeight={800}>Livraisons différées</Typography>
        <Typography variant="body2" color="text.secondary">
          {number(pending.length)} {pending.length === 1 ? 'vente' : 'ventes'} · {number(remaining)} {remaining === 1 ? 'œuf' : 'œufs'} à produire
        </Typography>
      </Box>
      <Button variant="contained" size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate('/livraisons-a-suivre')} sx={{ flexShrink: 0 }}>
        Voir les livraisons
      </Button>
    </Stack>}
  </Box>;
}
