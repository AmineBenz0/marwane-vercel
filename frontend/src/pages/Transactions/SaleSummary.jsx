import { Controller } from 'react-hook-form';
import { Alert, Box, Checkbox, FormControlLabel, Grid, Stack, TextField, Typography } from '@mui/material';
import { saleStockSummary } from './saleStockSummary';

/**
 * Stock situation, deferred delivery and payment for ONE sale line, shown under
 * that line (it used to be a side panel listing every line).
 */
export default function SaleLineDetails({ line, index, lines, control, saleDate, loading, renderPayment }) {
  const stock = saleStockSummary(line, index, lines);
  const format = (value) => value.toLocaleString('fr-FR');
  return (
    <Box sx={{ mt: 1.5 }}>
      <Box
        aria-label={`Stock pour la vente ${index + 1}`}
        aria-live="polite"
        sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1, p: 1.25, borderRadius: 2, bgcolor: 'background.default' }}
      >
        {[
          ['Œufs vendus', format(stock.requested)],
          ['Disponibles maintenant (stock)', stock.ready ? format(stock.covered) : '—'],
          ['À produire plus tard', stock.ready ? format(stock.pending) : '—'],
        ].map(([label, value]) => (
          <Stack key={label} direction={{ xs: 'row', sm: 'column' }} justifyContent="space-between" spacing={0.25}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography variant="body2" fontWeight={800}>{value}</Typography>
          </Stack>
        ))}
      </Box>
      {((stock.ready && stock.pending > 0) || line.est_promesse) && (
        <Box sx={{ mt: 1.25, p: 1.25, border: '1px solid', borderColor: 'warning.main', borderRadius: 2 }}>
          <Controller name={`lignes.${index}.est_promesse`} control={control} render={({ field }) => (
            <FormControlLabel
              sx={{ m: 0 }}
              label="Livraison différée"
              disabled={loading}
              control={<Checkbox {...field} checked={!!field.value} onChange={(event) => field.onChange(event.target.checked)} />}
            />
          )} />
          {stock.ready && stock.pending > 0 && (
            <Typography variant="body2" sx={{ mb: 1 }}>
              Les {format(stock.pending)} œufs manquants seront fournis ultérieurement.
            </Typography>
          )}
          {line.est_promesse && (
            <Controller name={`lignes.${index}.date_livraison_prevue`} control={control} render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value || ''}
                inputRef={field.ref}
                disabled={loading}
                fullWidth
                size="small"
                type="date"
                label="Date prévue de livraison *"
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: saleDate }}
                error={!!fieldState.error}
                helperText={fieldState.error?.message || 'Les prochaines productions seront affectées à cette vente selon l’ordre des commandes.'}
              />
            )} />
          )}
          {!line.est_promesse && stock.pending > 0 && (
            <Alert severity="warning" sx={{ mt: 1 }}>Acceptez la livraison différée ou réduisez la quantité.</Alert>
          )}
        </Box>
      )}
      <Grid container spacing={1.25} sx={{ mt: 0.5 }}>{renderPayment(line, index)}</Grid>
    </Box>
  );
}
