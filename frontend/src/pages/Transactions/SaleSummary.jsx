import { Controller } from 'react-hook-form';
import { Alert, Box, Checkbox, FormControlLabel, Grid, Typography } from '@mui/material';
import DateField from '../../utils/DateField';
import { saleStockSummary } from './saleStockSummary';

/**
 * Under ONE sale line: what is still missing, the deferred delivery when the stock is short,
 * and the payment. The stock itself is shown by the source picker.
 */
export default function SaleLineDetails({ line, index, lines, products = [], control, saleDate, loading, renderPayment, onDeferredChange }) {
  const stock = saleStockSummary(line, index, lines);
  const format = (value) => value.toLocaleString('fr-FR');
  const productName = products.find((p) => Number(p.id_produit) === Number(line.id_produit))?.nom_produit;
  return (
    <Box sx={{ mt: 1 }}>
      {/* The sale cannot be saved without an egg type: say so instead of leaving Save greyed out. */}
      {!productName && (
        <Typography variant="body2" sx={{ mb: 1, color: 'warning.dark', fontWeight: 700 }}>
          {line.id_batiment ? 'Choisissez le type d’œufs vendu.' : 'Choisissez le bâtiment d’où viennent les œufs.'}
        </Typography>
      )}
      {((stock.ready && stock.pending > 0) || line.est_promesse) && (
        <Box sx={{ mt: 1.25, p: 1.25, border: '1px solid', borderColor: 'warning.main', borderRadius: 2 }}>
          <Controller name={`lignes.${index}.est_promesse`} control={control} render={({ field }) => (
            <FormControlLabel
              sx={{ m: 0 }}
              label="Livraison différée"
              disabled={loading}
              control={<Checkbox {...field} checked={!!field.value} onChange={(event) => { field.onChange(event.target.checked); onDeferredChange?.(); }} />}
            />
          )} />
          {stock.ready && stock.pending > 0 && (
            <Typography variant="body2" sx={{ mb: 1 }}>
              Stock insuffisant : {format(stock.covered)} œufs disponibles maintenant.
              Les {format(stock.pending)} œufs manquants seront fournis ultérieurement.
            </Typography>
          )}
          {line.est_promesse && (
            <Controller name={`lignes.${index}.date_livraison_prevue`} control={control} render={({ field, fieldState }) => (
              <DateField
                {...field}
                value={field.value || ''}
                inputRef={field.ref}
                disabled={loading}
                fullWidth
                size="small"
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
