import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import DateField from '../../utils/DateField';
import { formatShortDate } from '../../utils/dateFormatting';
import { lotProductionService } from '../../services/productionService';
import { localToday } from './useProductionView';

const number = (value) => value == null ? '—' : Number(value).toLocaleString('fr-FR');
const message = (error) => {
  const detail = error.data?.detail || error.response?.data?.detail;
  return typeof detail === 'string' ? detail : error.message || 'Impossible d’enregistrer le lot.';
};

export default function LotPanel({ buildings, refreshKey, onChange }) {
  const [lots, setLots] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [dialog, setDialog] = useState('');
  const [values, setValues] = useState({});
  const [counts, setCounts] = useState({});
  const [saving, setSaving] = useState(false);
  const [allocationErrorBuildingId, setAllocationErrorBuildingId] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError('');
    lotProductionService.getLots().then((data) => {
      if (!cancelled) { setLots(data || []); setLoaded(true); }
    }).catch((err) => { if (!cancelled) setError(message(err)); });
    return () => { cancelled = true; };
  }, [refreshKey, revision]);
  const selected = lots.find((lot) => String(lot.id_lot) === selectedId)
    || lots.find((lot) => lot.statut !== 'termine') || lots[0];
  const occupied = new Set(lots.filter((lot) => lot.statut !== 'termine')
    .flatMap((lot) => (lot.repartitions || []).map((row) => Number(row.id_batiment))));
  const available = buildings.filter((building) => building.est_actif !== false && !occupied.has(Number(building.id_batiment)));
  const distributionBuildings = dialog === 'edit'
    ? (selected?.repartitions || []).map((row) => ({ id_batiment: row.id_batiment, nom: row.nom_batiment }))
    : available;
  const assigned = distributionBuildings.reduce((sum, building) => sum + Number(counts[building.id_batiment] || 0), 0);
  const allocationLimit = (buildingId) => Math.max(0, Number(values.effectif_initial || 0)
    - distributionBuildings.filter((building) => building.id_batiment !== buildingId)
      .reduce((sum, building) => sum + Number(counts[building.id_batiment] || 0), 0));
  const allocationError = (building) => {
    const count = Number(counts[building.id_batiment] || 0);
    return !Number.isInteger(count) || count < (dialog === 'edit' ? 1 : 0) || count > allocationLimit(building.id_batiment);
  };
  const balanced = Number(values.effectif_initial) > 0 && assigned === Number(values.effectif_initial)
    && !allocationErrorBuildingId
    && distributionBuildings.every((building) => !allocationError(building));

  const open = (kind) => {
    setError('');
    setAllocationErrorBuildingId('');
    setValues(kind === 'create' ? {
      nom_lot: 'Lot du ' + formatShortDate(localToday()), date_debut: localToday(),
      effectif_initial: '', age_depart_semaines: 0, souche: '', notes: '',
    } : kind === 'edit' ? { ...selected } : { date_fin_reelle: localToday() });
    setCounts(kind === 'edit'
      ? Object.fromEntries(selected.repartitions.map((row) => [row.id_batiment, row.effectif_initial ?? '']))
      : {});
    setDialog(kind);
  };
  const field = (name, value) => setValues((old) => ({ ...old, [name]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (dialog !== 'end' && !balanced) return;
    setSaving(true);
    setError('');
    try {
      let result;
      if (dialog === 'end') {
        result = await lotProductionService.terminateLot(selected.id_lot, { date_fin_reelle: values.date_fin_reelle });
      } else {
        const data = {
          nom_lot: values.nom_lot.trim(), date_debut: values.date_debut,
          age_depart_semaines: Number(values.age_depart_semaines), effectif_initial: Number(values.effectif_initial),
          souche: values.souche || null, notes: values.notes || null,
          duree_semaines: values.duree_semaines || 100,
          repartitions: distributionBuildings.map((building) => ({
            id_batiment: building.id_batiment, effectif_initial: Number(counts[building.id_batiment] || 0),
          })).filter((row) => row.effectif_initial > 0),
        };
        result = dialog === 'create' ? await lotProductionService.createLot(data)
          : await lotProductionService.updateLot(selected.id_lot, data);
      }
      setSelectedId(String(result.id_lot));
      setDialog('');
      setRevision((old) => old + 1);
      onChange();
    } catch (err) { setError(message(err)); }
    finally { setSaving(false); }
  };

  return (
    <Box component="section" aria-label="Lots de volailles" sx={{ mb: 3, p: { xs: 2, md: 2.5 }, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5}>
        <Box><Typography component="h2" variant="h6" fontWeight={900}>Lots de volailles</Typography>
          <Typography variant="body2" color="text.secondary">Une arrivée, une progression commune, un suivi par bâtiment.</Typography></Box>
        <Button variant="contained" onClick={() => open('create')} disabled={!loaded || !!error || !available.length} sx={{ alignSelf: 'start', flexShrink: 0 }}>Démarrer un lot</Button>
      </Stack>
      {error && !dialog && <Alert severity="error" sx={{ mt: 2 }} action={<Button onClick={() => setRevision((old) => old + 1)}>Réessayer</Button>}>{error}</Alert>}
      {!loaded && !error && <Typography sx={{ mt: 2 }}>Chargement des lots...</Typography>}
      {loaded && !selected && <Typography color="text.secondary" sx={{ mt: 2 }}>Enregistrez l’arrivée et répartissez les poussins entre les bâtiments.</Typography>}
      {loaded && selected && <>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }} alignItems={{ sm: 'center' }}>
          {lots.length > 1 ? <TextField select size="small" label="Lot / historique" value={selected.id_lot} onChange={(event) => setSelectedId(String(event.target.value))} sx={{ minWidth: 220 }}>
            {lots.map((lot) => <MenuItem key={lot.id_lot} value={lot.id_lot}>{lot.nom_lot}</MenuItem>)}
          </TextField> : <Typography fontWeight={800}>{selected.nom_lot}</Typography>}
          <Chip size="small" label={selected.statut === 'termine' ? 'Terminé' : 'Actif'} color={selected.statut === 'termine' ? 'default' : 'success'} />
          <Typography variant="body2" color="text.secondary">Arrivée le {formatShortDate(selected.date_debut)}{selected.date_fin_reelle ? ' · fin le ' + formatShortDate(selected.date_fin_reelle) : ''}</Typography>
        </Stack>
        <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
          <Fact label="Âge commun" value={selected.age_semaines + ' semaines'} />
          <Fact label="Effectif total restant" value={number(selected.effectif_actuel) + ' / ' + number(selected.effectif_initial)} />
          <Fact label="Mortalité du lot" value={number(selected.mortalite_totale)} />
          <Fact label="Formule selon l’âge" value={selected.formule_suggeree || '—'} />
        </Box>
        <Stack spacing={1} sx={{ mt: 2 }}>
          {(selected.repartitions || []).map((row) => <Stack key={row.id_cycle} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
            <Box sx={{ minWidth: 0 }}><Typography fontWeight={800}>{row.nom_batiment}</Typography>
              <Typography variant="body2" color="text.secondary">{number(row.effectif_actuel)} restantes / {number(row.effectif_initial)} affectées · mortalité : {row.effectif_initial == null ? '—' : number(row.effectif_initial - row.effectif_actuel)}</Typography></Box>
            <Button component={RouterLink} to={'/production/batiment/' + row.id_batiment} size="small" sx={{ alignSelf: 'start' }}>Voir le suivi</Button>
          </Stack>)}
        </Stack>
        {selected.statut !== 'termine' && <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button onClick={() => open('edit')}>Modifier le lot</Button>
          <Button color="error" onClick={() => open('end')}>Terminer le lot</Button>
        </Stack>}
        {selected.statut === 'termine' && <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Progression arrêtée à la date de fin pour tous les bâtiments.</Typography>}
      </>}
      <Dialog open={!!dialog} onClose={() => { if (!saving) { setDialog(''); setError(''); } }} maxWidth="sm" fullWidth>
        <Box component="form" onSubmit={submit}>
          <DialogTitle>{dialog === 'create' ? 'Démarrer un lot' : dialog === 'edit' ? 'Modifier le lot' : 'Terminer le lot'}</DialogTitle>
          <DialogContent>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Stack spacing={2} sx={{ pt: 1 }}>
              {dialog === 'end' ? <>
                <Typography>Cette action termine le lot dans tous ses bâtiments et conserve leur historique.</Typography>
                <DateField label="Date de fin" required value={values.date_fin_reelle || ''} onChange={(event) => field('date_fin_reelle', event.target.value)} />
              </> : <>
                <TextField label="Nom du lot" required inputProps={{ maxLength: 100 }} value={values.nom_lot || ''} onChange={(event) => field('nom_lot', event.target.value)} />
                <DateField label="Date d’arrivée" required value={values.date_debut || ''} onChange={(event) => field('date_debut', event.target.value)} />
                <TextField label="Nombre total de poussins entrants" required type="number" inputProps={{ min: 1, step: 1 }} value={values.effectif_initial ?? ''} onChange={(event) => { setAllocationErrorBuildingId(''); field('effectif_initial', event.target.value); }} />
                <TextField label="Âge à l’arrivée (semaines)" required type="number" inputProps={{ min: 0, step: 1 }} value={values.age_depart_semaines ?? 0} onChange={(event) => field('age_depart_semaines', event.target.value)} helperText="Le même âge et la même formule suggérée pour tous les bâtiments." />
                <Typography fontWeight={800}>Répartition par bâtiment</Typography>
                {distributionBuildings.map((building) => {
                  const limit = allocationLimit(building.id_batiment);
                  const overLimit = Number(counts[building.id_batiment] || 0) > limit;
                  const attemptedOvershoot = allocationErrorBuildingId === String(building.id_batiment);
                  return <TextField key={building.id_batiment} label={'Poussins · ' + building.nom} type="number"
                    inputProps={{ min: dialog === 'edit' ? 1 : 0, max: limit, step: 1 }}
                    value={counts[building.id_batiment] ?? ''}
                    error={allocationError(building) || attemptedOvershoot}
                    helperText={overLimit || attemptedOvershoot ? 'La quantité dépasse le nombre total de poussins entrants.' : undefined}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      const nextCount = nextValue === '' ? 0 : Number(nextValue);
                      if (Number.isFinite(nextCount) && nextCount > limit) {
                        setAllocationErrorBuildingId(String(building.id_batiment));
                        return;
                      }
                      setAllocationErrorBuildingId('');
                      setCounts((old) => ({ ...old, [building.id_batiment]: nextValue }));
                    }} />;
                })}
                <Typography role="status" color={balanced ? 'success.main' : 'text.secondary'}>{number(assigned)} / {number(values.effectif_initial || 0)} poussins répartis{assigned !== Number(values.effectif_initial || 0) ? ' · écart : ' + number(Number(values.effectif_initial || 0) - assigned) : ''}</Typography>
                {dialog === 'create' && occupied.size > 0 && <Typography variant="caption" color="text.secondary">Les bâtiments ayant déjà un lot actif sont indisponibles pour cette arrivée.</Typography>}
                <TextField label="Souche (facultatif)" inputProps={{ maxLength: 100 }} value={values.souche || ''} onChange={(event) => field('souche', event.target.value)} />
                <TextField label="Notes (facultatif)" multiline minRows={2} value={values.notes || ''} onChange={(event) => field('notes', event.target.value)} />
              </>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button color="inherit" disabled={saving} onClick={() => { setDialog(''); setError(''); }}>Annuler</Button>
            <Button type="submit" variant="contained" color={dialog === 'end' ? 'error' : 'primary'} disabled={saving || (dialog !== 'end' && !balanced)}>{saving ? 'Enregistrement...' : dialog === 'end' ? 'Terminer le lot' : 'Enregistrer'}</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}

function Fact({ label, value }) {
  return <Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>;
}
