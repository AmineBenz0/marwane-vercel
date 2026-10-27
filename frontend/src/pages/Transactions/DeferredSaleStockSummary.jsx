import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import DeferredSaleStatusBadge from './DeferredSaleStatusBadge';

const number = value => Number(value || 0).toLocaleString('fr-FR');
export default function DeferredSaleStockSummary({ sale, showStatus = true }) {
  const quantity = Number(sale.quantite ?? (Number(sale.quantite_couverte || 0) + Number(sale.quantite_en_attente || 0)));
  const complete = Number(sale.quantite_en_attente) === 0;
  const covered = Number(sale.quantite_couverte ?? Math.max(
    0, quantity - Number(sale.quantite_en_attente || 0),
  ));
  const completed = Number(sale.quantite_completee ?? covered);
  const ready = Math.min(Number(sale.quantite_reservee || 0), Number(sale.quantite_en_attente || 0));
  const toProduce = Math.max(0, Number(sale.quantite_en_attente || 0) - ready);
  const reservedPercent = quantity > 0 ? Math.min(100, (completed / quantity) * 100) : 0;
  return <Stack spacing={1.5}>
    {showStatus && <Box><DeferredSaleStatusBadge sale={sale} /></Box>}
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
      <Box><Typography variant="body2" color="text.secondary">Complété</Typography>
        <Typography fontWeight={700}>{number(completed)} / {number(quantity)} œufs</Typography>
      </Box>
      <Stack alignItems={{ xs: 'flex-start', sm: 'flex-end' }}>
        {ready > 0 && <Typography fontWeight={700} color="success.main">{number(ready)} prêts à compléter</Typography>}
        {toProduce > 0 && <Typography fontWeight={700}>{number(toProduce)} à produire</Typography>}
        {complete && <Typography fontWeight={700} color="success.main">{Number(sale.quantite_annulee || 0) > 0 ? 'Reste clôturé' : 'Promesse complétée'}</Typography>}
      </Stack>
    </Stack>
    <LinearProgress variant="determinate" value={reservedPercent} aria-label={`${number(completed)} œufs complétés sur ${number(quantity)}`} sx={{ height: 6, borderRadius: 3 }} />
  </Stack>;
}
