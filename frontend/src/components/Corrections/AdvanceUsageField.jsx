import { Alert, Box, Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import DateField from '../../utils/DateField';
import { formatMontant } from '../../utils/formatNumber';

export default function AdvanceUsageField({ available, amount, day, total, onChange, onDateChange, error, onRetry, disabled }) {
  const maximum = Math.max(0, Math.min(available, total));
  if (error) return <Alert severity="warning" sx={{ mb: 1.5 }} action={<Button onClick={onRetry}>Réessayer</Button>}>{error}</Alert>;
  if (!(available > 0) && !(Number(amount) > 0)) return null;
  return <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5, mb: 2 }}>
    <FormControlLabel control={<Checkbox checked={Number(amount) > 0} disabled={disabled || (maximum <= 0 && Number(amount) <= 0)} onChange={event => onChange(event.target.checked ? maximum.toFixed(2) : '0')} />}
      label={`Utiliser l’avance disponible · ${formatMontant(available)}`} />
    {Number(amount) > 0 && <Stack spacing={1.5} sx={{ mt: 1 }}>
      <TextField label="Avance utilisée (MAD)" type="number" value={amount} onChange={event => onChange(event.target.value)} disabled={disabled} inputProps={{ min: 0, max: maximum, step: '0.01' }} />
      <DateField label="Date d’utilisation de l’avance" value={day} onChange={onDateChange} disabled={disabled} required fullWidth />
      <Typography variant="body2">Montant : {formatMontant(total)} · Avance : {formatMontant(amount)} · Complément : <strong>{formatMontant(Math.max(0, total - Number(amount)))}</strong></Typography>
      <Typography variant="caption" color="text.secondary">L’argent de l’avance est déjà enregistré. Seul un nouveau complément affectera la caisse ou la banque.</Typography>
    </Stack>}
  </Box>;
}
