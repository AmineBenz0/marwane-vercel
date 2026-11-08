import { useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import DateField from '../../utils/DateField';
import { formatShortDate } from '../../utils/dateFormatting';
import { lotProductionService } from '../../services/productionService';
import { localToday } from './useProductionView';

const makeLotName = (buildingName, date, strain) => {
  const building = String(buildingName || '').trim().replace(/^(?:bâtiment|batiment|bat)\s*/i, '').trim();
  const parts = [`Bat ${building}`];
  if (date) parts.push(formatShortDate(date));
  if (strain?.trim()) parts.push(strain.trim());
  return parts.join(' - ');
};
const estimateLotEndDate = (startDate, durationWeeks = 100) => {
  if (!startDate) return '';
  const endDate = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(endDate.getTime())) return '';
  endDate.setDate(endDate.getDate() + (durationWeeks * 7) - 1);
  return formatShortDate(endDate);
};
const message = (error) => {
  const detail = error.data?.detail || error.response?.data?.detail;
  return typeof detail === 'string' ? detail : error.message || "Impossible d'enregistrer le lot.";
};

export default function LotCreateDialog({ building, available = [], onClose, onCreated }) {
  const initialBuilding = building ?? available[0];
  const [values, setValues] = useState(() => {
    const date = localToday();
    return {
      id_batiment: initialBuilding?.id_batiment ?? '',
      date_debut: date,
      nom_lot: makeLotName(initialBuilding?.nom, date, ''),
      effectif_initial: '',
      souche: '',
    };
  });
  const [automaticName, setAutomaticName] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const generatedName = (source) => {
    const selectedBuilding = building ?? available.find((row) => Number(row.id_batiment) === Number(source.id_batiment));
    return makeLotName(selectedBuilding?.nom, source.date_debut, source.souche);
  };
  const field = (name, value) => {
    if (name === 'nom_lot') setAutomaticName(false);
    setValues((old) => {
      const next = { ...old, [name]: value };
      if (automaticName && ['date_debut', 'id_batiment', 'souche'].includes(name)) next.nom_lot = generatedName(next);
      return next;
    });
  };
  const restoreAutomaticName = () => {
    setAutomaticName(true);
    setValues((old) => ({ ...old, nom_lot: generatedName(old) }));
  };
  const count = Number(values.effectif_initial);
  const canSave = (building || available.some((row) => Number(row.id_batiment) === Number(values.id_batiment)))
    && values.date_debut && values.nom_lot.trim() && Number.isInteger(count) && count > 0;
  const submit = async (event) => {
    event.preventDefault();
    if (saving || !canSave) return;
    setSaving(true);
    setError('');
    try {
      const result = await lotProductionService.createLot({
        nom_lot: values.nom_lot.trim(), date_debut: values.date_debut,
        age_depart_semaines: 0, effectif_initial: count,
        souche: values.souche || null, duree_semaines: 100, date_fin_prevue: null,
        repartitions: [{ id_batiment: Number(values.id_batiment), effectif_initial: count }],
      });
      onCreated(result);
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={() => { if (!saving) onClose(); }} maxWidth="sm" fullWidth aria-labelledby="lot-create-title">
      <Box component="form" onSubmit={submit}>
        <DialogTitle id="lot-create-title">Démarrer un lot</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Stack spacing={2} sx={{ pt: 1 }}>
            {building ? (
              <TextField label="Bâtiment" fullWidth value={building.nom} InputProps={{ readOnly: true }} />
            ) : <TextField select label="Bâtiment" required fullWidth value={values.id_batiment ?? ''} onChange={(event) => field('id_batiment', event.target.value)}>
              {available.map((building) => <MenuItem key={building.id_batiment} value={building.id_batiment}>{building.nom}</MenuItem>)}
            </TextField>}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <DateField label="Date de mise en place" required fullWidth value={values.date_debut || ''} onChange={(event) => field('date_debut', event.target.value)} />
              <Box sx={{ minWidth: 0 }}>
                <TextField label="Nom du lot" required fullWidth inputProps={{ maxLength: 100 }} value={values.nom_lot || ''} onChange={(event) => field('nom_lot', event.target.value)} />
                {!automaticName && <Button size="small" onClick={restoreAutomaticName} sx={{ minWidth: 0, p: 0, mt: 0.5, alignSelf: 'flex-end', textTransform: 'none' }}>Rétablir le nom automatique</Button>}
              </Box>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField label="Effectif de départ" required fullWidth type="number" inputProps={{ min: 1, step: 1 }} value={values.effectif_initial ?? ''} onChange={(event) => field('effectif_initial', event.target.value)} />
              <TextField label="Souche (facultatif)" fullWidth inputProps={{ maxLength: 100 }} value={values.souche || ''} onChange={(event) => field('souche', event.target.value)} />
            </Box>
            <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Typography variant="body2" color="text.secondary">Fin estimée</Typography>
                <Typography variant="body2" fontWeight={700}>{estimateLotEndDate(values.date_debut) || 'À calculer'}</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">Calculée sur une durée standard de 100 semaines. La clôture reste manuelle.</Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" disabled={saving} onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="contained" disabled={saving || !canSave}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
