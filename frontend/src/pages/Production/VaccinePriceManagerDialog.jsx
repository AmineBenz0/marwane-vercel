import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { productionService } from '../../services/productionService';

export default function VaccinePriceManagerDialog({ open, onClose, vaccins, onPriceUpdated }) {
  const [prices, setPrices] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setPrices(Object.fromEntries(vaccins.map((vaccine) => [vaccine.id_vaccin, vaccine.prix_defaut ?? ''])));
      setError('');
    }
  }, [open, vaccins]);

  const savePrice = async (vaccine) => {
    setSavingId(vaccine.id_vaccin);
    setError('');
    try {
      const value = prices[vaccine.id_vaccin];
      const updated = await productionService.updateVaccinePrice(vaccine.id_vaccin, {
        prix_defaut: value === '' ? null : String(value),
      });
      onPriceUpdated(updated);
    } catch (err) {
      setError(err.data?.detail || err.response?.data?.detail || 'Impossible d’enregistrer ce tarif.');
    } finally {
      setSavingId(null);
    }
  };

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="vaccine-price-dialog-title">
    <DialogTitle id="vaccine-price-dialog-title">Tarifs des vaccins</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Les changements s’appliquent aux prochaines saisies. Les dépenses déjà enregistrées gardent leur prix.
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {vaccins.map((vaccine) => {
          const price = prices[vaccine.id_vaccin] ?? '';
          const valid = price === '' || (/^\d+(?:\.\d{1,2})?$/.test(String(price)) && Number(price) > 0);
          const changed = String(price) !== String(vaccine.prix_defaut ?? '');
          return <Stack key={vaccine.id_vaccin} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography fontWeight={700} variant="body2">{vaccine.nom}</Typography>
              <Typography variant="caption" color="text.secondary">{vaccine.unite}</Typography>
            </Stack>
            <TextField size="small" fullWidth type="number" label={`Tarif ${vaccine.nom} (DH)`} value={price}
              inputProps={{ min: '0.01', step: '0.01' }}
              onChange={(event) => setPrices((current) => ({ ...current, [vaccine.id_vaccin]: event.target.value }))}
              error={!valid} helperText={price === '' ? 'Vide : à saisir au besoin' : undefined} sx={{ maxWidth: { sm: 170 } }} />
            <Button size="small" sx={{ alignSelf: { xs: 'flex-end', sm: 'center' } }} disabled={!changed || !valid || savingId === vaccine.id_vaccin}
              onClick={() => savePrice(vaccine)}>{savingId === vaccine.id_vaccin ? 'Enregistrement…' : 'Enregistrer'}</Button>
          </Stack>;
        })}
      </Stack>
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Fermer</Button></DialogActions>
  </Dialog>;
}