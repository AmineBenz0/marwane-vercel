import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, Stack, TextField, Typography,
} from '@mui/material';
import { EditOutlined, History, StopCircleOutlined } from '@mui/icons-material';
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
  const [historyOpen, setHistoryOpen] = useState(false);
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
  const activeLot = lots.find((lot) => lot.statut !== 'termine');
  const selected = lots.find((lot) => String(lot.id_lot) === selectedId)
    || activeLot || lots[0];
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
    if (kind === 'create' && (!loaded || activeLot || !available.length)) return;
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
    if (dialog === 'create' && activeLot) {
      setError('Un lot est déjà actif. Terminez-le avant de démarrer un nouveau lot.');
      return;
    }
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
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={1.5}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Typography component="h2" variant="h6" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>
              {loaded && selected ? selected.nom_lot : 'Lots de volailles'}
            </Typography>
            {loaded && selected && <Chip size="small" variant="outlined" label={selected.statut === 'termine' ? 'Terminé' : 'Actif'}
              color={selected.statut === 'termine' ? 'default' : 'success'} />}
          </Stack>
          {loaded && selected && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
            Arrivée le {formatShortDate(selected.date_debut)}
            {selected.souche ? ' · Souche : ' + selected.souche : ''}
            {selected.date_fin_reelle ? ' · Fin le ' + formatShortDate(selected.date_fin_reelle) : ''}
          </Typography>}
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', flexShrink: 0 }}>
          {loaded && lots.length > 0 && <Button size="small" startIcon={<History />} onClick={() => setHistoryOpen(true)}>Historique</Button>}
          {loaded && !activeLot && <Button variant="contained" onClick={() => open('create')} disabled={!!error || !available.length}>Démarrer un lot</Button>}
        </Stack>
      </Stack>
      {error && !dialog && <Alert severity="error" sx={{ mt: 2 }} action={<Button onClick={() => setRevision((old) => old + 1)}>Réessayer</Button>}>{error}</Alert>}
      {!loaded && !error && <Typography sx={{ mt: 2 }}>Chargement des lots...</Typography>}
      {loaded && !selected && <Typography color="text.secondary" sx={{ mt: 2 }}>Enregistrez l’arrivée et répartissez les poussins entre les bâtiments.</Typography>}
      {loaded && selected && <>
        {selected.statut === 'termine' && activeLot && <Button size="small" onClick={() => setSelectedId(String(activeLot.id_lot))} sx={{ mt: 1 }}>Revenir au lot en cours</Button>}
        <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 2, md: 3 } }}>
          <Fact label="Effectif restant" value={number(selected.effectif_actuel)} detail={'sur ' + number(selected.effectif_initial) + ' entrants'} color="primary.main" />
          <Fact label="Mortalité cumulée" value={number(selected.mortalite_totale)} />
          <Fact label="Âge" value={selected.age_semaines == null ? '—' : selected.age_semaines + ' semaines'} />
          <Fact label="Formule d’aliment" value={selected.formule_suggeree || '—'} />
        </Box>
        <Divider sx={{ mt: 2.5, mb: 2 }} />
        {selected.statut !== 'termine' ? <Stack direction="row" justifyContent="flex-end" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button variant="outlined" startIcon={<EditOutlined />} onClick={() => open('edit')}>Modifier le lot</Button>
          <Button variant="outlined" color="error" startIcon={<StopCircleOutlined />} onClick={() => open('end')}
            sx={{ color: 'error.main', borderColor: 'error.main', '&:hover': { color: 'error.dark', borderColor: 'error.dark', bgcolor: 'action.hover' } }}>Terminer le lot</Button>
        </Stack> : <Typography variant="body2" color="text.secondary">Progression arrêtée à la date de fin pour tous les bâtiments.</Typography>}
      </>}
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Historique des lots</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ pt: 1 }}>
            {lots.map((lot) => <Button key={lot.id_lot} color="inherit" onClick={() => { setSelectedId(String(lot.id_lot)); setHistoryOpen(false); }}
              sx={{ justifyContent: 'space-between', gap: 2, textAlign: 'left', p: 1.5 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{lot.nom_lot}</Typography>
                <Typography variant="body2" color="text.secondary">Arrivée le {formatShortDate(lot.date_debut)}</Typography>
              </Box>
              <Chip size="small" variant="outlined" label={lot.statut === 'termine' ? 'Terminé' : 'Actif'} color={lot.statut === 'termine' ? 'default' : 'success'} />
            </Button>)}
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setHistoryOpen(false)}>Fermer</Button></DialogActions>
      </Dialog>
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

function Fact({ label, value, detail, color = 'text.primary' }) {
  return <Box sx={{ minWidth: 0 }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="h5" fontWeight={800} color={color} sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>{value}</Typography>
    {detail && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{detail}</Typography>}
  </Box>;
}
