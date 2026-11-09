import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import DeferredSaleStatusBadge from './DeferredSaleStatusBadge';
import { deferredStockQuantities } from './deferredStockQuantities';

const number = value => Number(value || 0).toLocaleString('fr-FR');

export default function DeferredSaleStockSummary({ sale, showStatus = true }) {
  const { covered, pending, reserved, toProduce } = deferredStockQuantities(sale);
  const total = Math.max(0, Number(sale.quantite ?? (covered + pending)));
  const coveredPercent = total > 0 ? Math.min(100, covered * 100 / total) : 0;
  return <Stack spacing={1.5}>
    {showStatus && <Box><DeferredSaleStatusBadge sale={sale} /></Box>}
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
      <Box>
        <Typography variant="body2" color="text.secondary">Stock couvert</Typography>
        <Typography fontWeight={700}>{number(covered)} / {number(total)} œufs</Typography>
      </Box>
      {pending > 0 && <Stack alignItems={{ xs: 'flex-start', sm: 'flex-end' }}>
        {reserved > 0 && <Typography fontWeight={700} color="success.main">{number(reserved)} prêts à compléter</Typography>}
        {toProduce > 0 && <Typography fontWeight={700}>{number(toProduce)} œufs à produire</Typography>}
      </Stack>}
    </Stack>
    <LinearProgress variant="determinate" value={coveredPercent}
      aria-label={`${number(covered)} œufs couverts sur ${number(total)}`}
      sx={{ height: 6, borderRadius: 3 }} />
  </Stack>;
}
