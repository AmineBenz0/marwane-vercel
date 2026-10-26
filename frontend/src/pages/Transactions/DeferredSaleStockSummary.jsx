import { Box, Chip, Stack, Typography } from '@mui/material';
import { deferredSaleStatus } from './deferredSaleStatus';

const number = value => Number(value || 0).toLocaleString('fr-FR');
export default function DeferredSaleStockSummary({ sale }) {
  const state = deferredSaleStatus(sale);
  const complete = Number(sale.quantite_en_attente) === 0;
  const covered = Number(sale.quantite_couverte ?? Math.max(
    0, Number(sale.quantite || 0) - Number(sale.quantite_en_attente || 0),
  ));
  return <Stack spacing={1.5}>
    {state && <Box><Chip size="small" color={state.color} label={state.label} /></Box>}
    {complete ? <Typography variant="body2" color="text.secondary">{number(covered)} œufs réservés</Typography> : <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
        <Box><Typography variant="body2" color="text.secondary">Réservés pour cette vente</Typography>
          <Typography fontWeight={700}>{number(covered)} / {number(sale.quantite)} œufs</Typography>
        </Box>
        <Typography fontWeight={700}>{number(sale.quantite_en_attente)} œufs à produire</Typography>
      </Stack>
    </>}
  </Stack>;
}
