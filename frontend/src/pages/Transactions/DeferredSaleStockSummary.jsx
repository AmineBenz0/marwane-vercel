import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { deferredSaleStatus } from './deferredSaleStatus';

const number = value => Number(value || 0).toLocaleString('fr-FR');
export default function DeferredSaleStockSummary({ sale, onComplete }) {
  const state = deferredSaleStatus(sale);
  const available = Math.min(Number(sale.quantite_reservee || 0), Number(sale.quantite_en_attente || 0));
  const complete = Number(sale.quantite_en_attente) === 0;
  return <Stack spacing={1.5}>
    {state && state.id !== 'ready' && <Box><Chip size="small" color={state.color} label={state.label} /></Box>}
    {complete ? <Typography variant="body2" color="text.secondary">{number(sale.quantite)} œufs</Typography> : <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
        <Box><Typography variant="body2" color="text.secondary">Stock de la vente</Typography>
          <Typography fontWeight={700}>{number(sale.quantite_couverte)} / {number(sale.quantite)} œufs</Typography>
        </Box>
        <Typography fontWeight={700}>{number(sale.quantite_en_attente)} restants</Typography>
      </Stack>
      {state?.id === 'ready' && onComplete && <Box><Button variant="contained" onClick={onComplete}>Compléter {number(available)} œufs</Button></Box>}
    </>}
  </Stack>;
}
