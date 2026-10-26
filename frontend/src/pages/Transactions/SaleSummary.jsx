import { Controller } from 'react-hook-form';
import { Alert, Box, Checkbox, Divider, FormControlLabel, Grid, Paper, Stack, TextField, Typography } from '@mui/material';
import { saleStockSummary } from './saleStockSummary';

export default function SaleSummary({ lines, products, control, saleDate, loading, renderPayment, children }) {
  return <Paper component="aside" aria-label="Résumé de la vente" variant="outlined"
    sx={{ p: 2, borderRadius: 2.5, alignSelf: 'start', position: { md: 'sticky' }, top: 0, minWidth: 0 }}>
    <Typography variant="subtitle1" fontWeight={800}>Cette vente</Typography>
    <Stack spacing={2} divider={<Divider />} sx={{ mt: 1.5 }}>
      {lines.map((line, index) => {
        const stock = saleStockSummary(line, index, lines);
        const name = products.find(p => Number(p.id_produit) === Number(line.id_produit))?.nom_produit;
        return <Box key={index}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>{lines.length > 1 ? `Vente ${index + 1} · ` : ''}{name || 'Choisissez le type d’œufs'}</Typography>
          <Stack spacing={1} aria-live="polite">
            {[
              ['Demandés', stock.requested.toLocaleString('fr-FR')],
              ['Stock disponible à réserver', stock.ready ? stock.covered.toLocaleString('fr-FR') : '—'],
              ['Reste à produire', stock.ready ? stock.pending.toLocaleString('fr-FR') : '—'],
            ].map(([label, value]) => <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={700}>{value}</Typography>
            </Box>)}
          </Stack>
          {(stock.ready && stock.pending > 0 || line.est_promesse) && <Box sx={{ mt: 1.5, p: 1.25, border: '1px solid', borderColor: 'warning.main', borderRadius: 2 }}>
            <Controller name={`lignes.${index}.est_promesse`} control={control} render={({ field }) => <FormControlLabel
              sx={{ m: 0 }} label="Livraison différée" disabled={loading}
              control={<Checkbox {...field} checked={!!field.value} onChange={event => field.onChange(event.target.checked)} />} />} />
            {stock.ready && stock.pending > 0 && <Typography variant="body2" sx={{ mb: 1 }}>Les {stock.pending.toLocaleString('fr-FR')} œufs manquants seront fournis ultérieurement.</Typography>}
            {line.est_promesse && <Controller name={`lignes.${index}.date_livraison_prevue`} control={control} render={({ field, fieldState }) =>
              <TextField {...field} value={field.value || ''} inputRef={field.ref} disabled={loading} fullWidth size="small" type="date"
                label="Date prévue de livraison *" InputLabelProps={{ shrink: true }} inputProps={{ min: saleDate }}
                error={!!fieldState.error} helperText={fieldState.error?.message || 'Les prochaines productions seront affectées à cette vente selon l’ordre des commandes.'} />} />}
            {!line.est_promesse && stock.pending > 0 && <Alert severity="warning" sx={{ mt: 1 }}>Acceptez la livraison différée ou réduisez la quantité.</Alert>}
          </Box>}
          <Grid container spacing={1.25} sx={{ mt: 1.5 }}>{renderPayment(line, index)}</Grid>
        </Box>;
      })}
    </Stack>
    <Divider sx={{ my: 2 }} />
    {children}
  </Paper>;
}
