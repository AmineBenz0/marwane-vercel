import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import DeferredSaleStatusBadge from './DeferredSaleStatusBadge';

const number = value => Number(value || 0).toLocaleString('fr-FR');
export default function DeferredSaleStockSummary({ sale, showStatus = true }) {
  const quantity = Number(sale.quantite || 0);
  const complete = Number(sale.quantite_en_attente) === 0;
  const covered = Number(sale.quantite_couverte ?? Math.max(
    0, quantity - Number(sale.quantite_en_attente || 0),
  ));
  const reservedPercent = quantity > 0 ? Math.min(100, (covered / quantity) * 100) : 0;
  return <Stack spacing={1.5}>
    {showStatus && <Box><DeferredSaleStatusBadge sale={sale} /></Box>}
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
      <Box><Typography variant="body2" color="text.secondary">Stock réservé</Typography>
        <Typography fontWeight={700}>{number(covered)} / {number(quantity)} œufs</Typography>
      </Box>
      <Typography fontWeight={700} color={complete ? 'success.main' : 'text.primary'}>{complete ? 'Tout le stock est réservé' : `${number(sale.quantite_en_attente)} œufs à produire`}</Typography>
    </Stack>
    <LinearProgress variant="determinate" value={reservedPercent} aria-label={`${number(covered)} œufs réservés sur ${number(quantity)}`} sx={{ height: 6, borderRadius: 3 }} />
  </Stack>;
}
