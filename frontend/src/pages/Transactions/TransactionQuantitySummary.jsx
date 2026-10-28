import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import PropTypes from 'prop-types';
import { deferredStockQuantities } from './deferredStockQuantities';

const eggs = value => `${Number(value || 0).toLocaleString('fr-FR')} œufs`;

export default function TransactionQuantitySummary({ sale }) {
  const completed = Number(sale.quantite_completee ?? (sale.repartition_stock || []).reduce(
    (sum, source) => sum + Number(source.quantite_livree || 0), 0
  ));
  const quantity = Number(sale.quantite ?? (completed + Number(sale.quantite_en_attente || 0)));
  const cancelled = Number(sale.quantite_annulee || 0);
  const { reserved, toProduce } = deferredStockQuantities(sale);
  const pending = sale.est_actif === false ? 0 : Math.max(0, Number(sale.quantite_en_attente || 0));
  const rowSx = { flexWrap: 'wrap', gap: 0.5, fontVariantNumeric: 'tabular-nums' };

  return <Stack spacing={1.5}>
    <Stack direction="row" justifyContent="space-between" sx={rowSx}>
      <Typography color="text.secondary">Quantité commandée</Typography><Typography fontWeight={700}>{eggs(quantity)}</Typography>
    </Stack>
    <Stack direction="row" justifyContent="space-between" sx={rowSx}>
      <Typography color="text.secondary">Déjà fournis</Typography><Typography fontWeight={700}>{eggs(completed)}</Typography>
    </Stack>
    <LinearProgress variant="determinate" value={quantity > 0 ? Math.max(0, Math.min(100, completed / quantity * 100)) : 0}
      aria-label={`${eggs(completed)} fournis sur ${eggs(quantity)} commandés`} sx={{ height: 6, borderRadius: 1 }} />
    {sale.est_actif === false ? <Typography color="text.secondary">Vente annulée · quantités conservées dans l’historique.</Typography> : <>
      <Stack direction="row" justifyContent="space-between" sx={rowSx}>
        <Typography>Reste à fournir</Typography><Typography fontWeight={700}>{eggs(pending)}</Typography>
      </Stack>
      {pending > 0 && <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5 }}>
        <Stack direction="row" justifyContent="space-between" sx={rowSx}>
          <Typography variant="body2" color="text.secondary">Stock réservé disponible</Typography><Typography variant="body2" fontWeight={700}>{eggs(reserved)}</Typography>
        </Stack>
        <Stack direction="row" justifyContent="space-between" sx={{ ...rowSx, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">Encore à produire</Typography><Typography variant="body2" fontWeight={700}>{eggs(toProduce)}</Typography>
        </Stack>
      </Box>}
      {pending === 0 && <Typography color={cancelled > 0 ? 'text.secondary' : 'success.main'}>
        {cancelled > 0 ? 'Reste clôturé' : 'Quantité entièrement fournie'}
      </Typography>}
    </>}
    {cancelled > 0 && <Typography variant="body2" color="text.secondary">Quantité annulée : {eggs(cancelled)}</Typography>}
  </Stack>;
}

TransactionQuantitySummary.propTypes = {
  sale: PropTypes.shape({
    quantite: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    quantite_completee: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    quantite_en_attente: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    quantite_reservee: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    quantite_annulee: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    est_actif: PropTypes.bool,
    repartition_stock: PropTypes.arrayOf(PropTypes.shape({ quantite_livree: PropTypes.oneOfType([PropTypes.number, PropTypes.string]) })),
  }).isRequired,
};
