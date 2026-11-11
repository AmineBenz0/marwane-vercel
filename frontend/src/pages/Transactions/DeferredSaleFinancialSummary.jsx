import { Box, Stack, Typography } from '@mui/material';
import { formatMontant } from '../../utils/formatNumber';
import { formatShortDate } from '../../utils/dateFormatting';
import ExpandableDetails from '../../components/ExpandableDetails';

const money = amount => formatMontant(amount, { useCompactNotation: false, minimumFractionDigits: 2, maximumFractionDigits: 2 });
const Line = ({ label, value, strong = false }) => <Stack direction="row" spacing={2} alignItems="baseline" justifyContent="space-between">
  <Typography variant="body2" color="text.secondary">{label}</Typography>
  <Typography variant="body2" fontWeight={strong ? 800 : 700} sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
</Stack>;

/** The posted avoir is not a payment or an advance. Keep its dates visible. */
export default function DeferredSaleFinancialSummary({ sale }) {
  if (!sale) return null;
  const notes = sale.avoirs_livraison_differee || [];
  // Cent-level rounding may yield a valid zero-amount avoir: keep its
  // quantity and historical entry visible rather than hiding it.
  const credited = Number(sale.montant_avoir || 0) > 0 || notes.length > 0;
  const remaining = Number(sale.montant_restant || 0);

  return <Stack spacing={1}>
    <Line label={credited ? 'Montant initial' : 'Total'} value={money(sale.montant_total)} />
    {credited && <>
      <Line label="Avoirs commerciaux" value={`− ${money(sale.montant_avoir)}`} />
      <Line label="Montant net" value={money(sale.montant_net ?? Number(sale.montant_total) - Number(sale.montant_avoir))} strong />
    </>}
    <Line label="Payé" value={money(sale.montant_paye)} />
    <Line label={remaining < 0 ? 'Crédit client' : 'Reste à encaisser'} value={money(Math.abs(remaining))} strong={remaining !== 0} />
    {credited && <>
      {notes.length > 0 && <ExpandableDetails label="Détail des avoirs">
        <Stack spacing={1.25} sx={{ py: 1 }}>
          {notes.map(note => <Line
            key={note.id_avoir || `${note.date_effet}-${note.avoir_cumule}`}
            label={`Avoir du ${formatShortDate(note.date_effet)} · ${Number(note.quantite_annulee || 0).toLocaleString('fr-FR')} œufs`}
            value={`− ${money(note.montant_avoir)}`}
          />)}
        </Stack>
      </ExpandableDetails>}
      {remaining < 0 && <Box>
        <Typography variant="body2" color="text.secondary">
          Ce crédit ne déclenche pas de remboursement automatique. Le remboursement est une opération séparée.
        </Typography>
      </Box>}
    </>}
  </Stack>;
}
