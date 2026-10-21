import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { EditOutlined, History, StopCircleOutlined } from '@mui/icons-material';
import DateField from '../../utils/DateField';
import { formatShortDate } from '../../utils/dateFormatting';
import { cycleProductionService, lotProductionService } from '../../services/productionService';
import { localToday } from './useProductionView';

const number = (value) => value == null ? '-' : Number(value).toLocaleString('fr-FR');
const message = (error) => {
  const detail = error.data?.detail || error.response?.data?.detail;
  return typeof detail === 'string' ? detail : error.message || "Impossible d'enregistrer le lot.";
};

export default function LotPanel({ buildings, refreshKey, onChange, managementMode = false }) {
  const [lots, setLots] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [dialog, setDialog] = useState('');
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [historyCycle, setHistoryCycle] = useState(null);
  const [historyPeriod, setHistoryPeriod] = useState({});
  const [buildingFilter, setBuildingFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [managementView, setManagementView] = useState('overview');

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError('');
    lotProductionService.getLots().then((data) => {
      if (!cancelled) { setLots(data || []); setLoaded(true); }
    }).catch((err) => { if (!cancelled) setError(message(err)); });
    return () => { cancelled = true; };
  }, [refreshKey, revision]);

  const activeLots = lots.filter((lot) => lot.statut !== 'termine');
  const filteredLots = managementMode ? lots.filter((lot) => {
    const cycle = lot.repartitions?.[0];
    const isFinished = lot.statut === 'termine';
    const matchesStatus = statusFilter === 'finished' ? isFinished : !isFinished;
    const matchesBuilding = statusFilter !== 'finished' || !buildingFilter
      || String(cycle?.id_batiment) === buildingFilter;
    return matchesStatus && matchesBuilding;
  }) : lots;
  const selected = managementMode
    ? lots.find((lot) => String(lot.id_lot) === selectedId) || activeLots[0] || lots[0]
    : lots.find((lot) => String(lot.id_lot) === selectedId) || activeLots[0] || lots[0];
  const occupied = new Set(activeLots.map((lot) => Number(lot.repartitions?.[0]?.id_batiment)));
  const available = buildings.filter((building) => building.est_actif !== false
    && !occupied.has(Number(building.id_batiment)));
  const selectedCycle = selected?.repartitions?.[0];

  const open = (kind) => {
    if (kind === 'create' && (!loaded || !available.length)) return;
    setError('');
    setValues(kind === 'create' ? {
      nom_lot: 'Lot du ' + formatShortDate(localToday()), date_debut: localToday(),
      id_batiment: available[0]?.id_batiment || '', effectif_initial: '',
      age_depart_semaines: 0, souche: '', notes: '', duree_semaines: 100, date_fin_prevue: '',
    } : kind === 'edit' ? {
      ...selected, id_batiment: selectedCycle?.id_batiment,
      effectif_initial: selected?.effectif_initial ?? '',
    } : { date_fin_reelle: localToday() });
    setDialog(kind);
  };
  const field = (name, value) => setValues((old) => ({
    ...old,
    [name]: value,
    ...(dialog === 'edit' && ['date_debut', 'duree_semaines'].includes(name) ? { date_fin_prevue: '' } : {}),
  }));

  const submitHistory = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await cycleProductionService.assignHistory(historyCycle.id_cycle, historyPeriod);
      setHistoryCycle(null);
      setRevision((old) => old + 1);
      onChange?.();
    } catch (err) { setError(message(err)); }
    finally { setSaving(false); }
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      let result;
      if (dialog === 'end') {
        result = await lotProductionService.terminateLot(selected.id_lot, {
          date_fin_reelle: values.date_fin_reelle,
        });
      } else {
        const count = Number(values.effectif_initial);
        const data = {
          nom_lot: values.nom_lot.trim(), date_debut: values.date_debut,
          age_depart_semaines: Number(values.age_depart_semaines), effectif_initial: count,
          souche: values.souche || null, notes: values.notes || null,
          duree_semaines: Number(values.duree_semaines || 100),
          date_fin_prevue: values.date_fin_prevue || null,
          repartitions: [{ id_batiment: Number(values.id_batiment), effectif_initial: count }],
        };
        result = dialog === 'create' ? await lotProductionService.createLot(data)
          : await lotProductionService.updateLot(selected.id_lot, data);
      }
      setSelectedId(String(result.id_lot));
      if (managementMode) setManagementView('details');
      setDialog('');
      setValues({});
      setRevision((old) => old + 1);
      onChange?.();
    } catch (err) { setError(message(err)); }
    finally { setSaving(false); }
  };

  return (
    <Box component="section" aria-label="Lots de volailles" sx={{ mb: 3, p: { xs: 2, md: 2.5 }, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={1.5}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Typography component="h2" variant="h6" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>
              {managementMode ? (managementView === 'overview' ? 'Gestion des lots' : selected?.nom_lot || 'Détail du lot') : (loaded && selected ? selected.nom_lot : 'Lots de volailles')}
            </Typography>
            {!managementMode && loaded && selected && <Chip size="small" variant="outlined" label={selected.statut === 'termine' ? 'Terminé' : 'Actif'}
              color={selected.statut === 'termine' ? 'default' : 'success'} />}
          </Stack>
          {!managementMode && loaded && selected && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
            {selectedCycle?.nom_batiment || 'Bâtiment'} | Arrivée le {formatShortDate(selected.date_debut)}
            {selected.souche ? ' | Souche : ' + selected.souche : ''}
            {selected.date_fin_prevue ? ' | Fin prévue le ' + formatShortDate(selected.date_fin_prevue) : ''}
            {selected.date_fin_reelle ? ' | Fin le ' + formatShortDate(selected.date_fin_reelle) : ''}
          </Typography>}
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', flexShrink: 0 }}>
          {!managementMode && loaded && lots.length > 0 && <Button size="small" startIcon={<History />} onClick={() => setHistoryOpen(true)}>Historique</Button>}
          {managementMode && loaded && managementView === 'details' && <Button size="small" onClick={() => { setManagementView('overview'); setStatusFilter(selected?.statut === 'termine' ? 'finished' : 'active'); }}>Tous les lots</Button>}
          {loaded && <Button variant="contained" onClick={() => open('create')} disabled={!!error || !available.length}>Démarrer un lot</Button>}
        </Stack>
      </Stack>
      {managementMode && loaded && managementView === 'overview' && <>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} sx={{ mt: 2 }}>
          <Stack direction="row" spacing={1} role="tablist" aria-label="État des lots">
            <Button role="tab" aria-selected={statusFilter === 'active'} variant={statusFilter === 'active' ? 'contained' : 'outlined'}
              onClick={() => { setStatusFilter('active'); setSelectedId(''); }}>En cours ({activeLots.length})</Button>
            <Button role="tab" aria-selected={statusFilter === 'finished'} variant={statusFilter === 'finished' ? 'contained' : 'outlined'}
              onClick={() => { setStatusFilter('finished'); setSelectedId(''); }}>Terminés ({lots.length - activeLots.length})</Button>
          </Stack>
          {statusFilter === 'finished' && <TextField select SelectProps={{ native: true }} size="small" label="Filtrer par bâtiment"
            value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)}
            sx={{ minWidth: { xs: '100%', sm: 220 } }}>
            <option value="">Tous les bâtiments</option>
            {buildings.map((building) => <option key={building.id_batiment} value={building.id_batiment}>{building.nom}</option>)}
          </TextField>}
        </Stack>
        {filteredLots.length ? <Box component="section" aria-label={statusFilter === 'active' ? 'Lots en cours' : 'Lots terminés'}
          sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
          {filteredLots.map((lot) => {
            const cycle = lot.repartitions?.[0];
            const finished = lot.statut === 'termine';
            return <Box component="article" key={lot.id_lot} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="overline" color="text.secondary">{cycle?.nom_batiment || 'Bâtiment'}</Typography>
                  <Typography variant="h6" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{lot.nom_lot}</Typography>
                </Box>
                <Chip size="small" label={finished ? 'Terminé' : 'En cours'} color={finished ? 'default' : 'success'} />
              </Stack>
              <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <Fact label={finished ? 'Volailles à la fin' : 'Volailles présentes'} value={number(lot.effectif_actuel)} />
                <Fact label={finished ? 'Âge à la fin' : 'Âge aujourd’hui'} value={lot.age_semaines == null ? '-' : lot.age_semaines + ' semaines'} />
              </Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mt: 1.5 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">Arrivée le {formatShortDate(lot.date_debut)}</Typography>
                  {finished && lot.date_fin_reelle && <Typography variant="body2" color="text.secondary">Fin le {formatShortDate(lot.date_fin_reelle)}</Typography>}
                </Box>
                <Button size="small" onClick={() => { setSelectedId(String(lot.id_lot)); setManagementView('details'); }}>
                  Voir le lot
                </Button>
              </Stack>
            </Box>;
          })}
        </Box> : <Box sx={{ mt: 3, p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
          <Typography fontWeight={700}>Aucun lot {statusFilter === 'active' ? 'en cours' : 'terminé'}{statusFilter === 'finished' && buildingFilter ? ' dans ce bâtiment' : ''}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {statusFilter === 'active' ? 'Démarrez un lot pour accueillir de nouvelles volailles.' : 'Les lots terminés apparaîtront ici.'}
          </Typography>
        </Box>}
      </>}
      {error && !dialog && <Alert severity="error" sx={{ mt: 2 }} action={<Button onClick={() => setRevision((old) => old + 1)}>Réessayer</Button>}>{error}</Alert>}
      {!loaded && !error && <Typography sx={{ mt: 2 }}>Chargement des lots...</Typography>}
      {loaded && !selected && !managementMode && <Typography color="text.secondary" sx={{ mt: 2 }}>Démarrez un lot indépendant pour chaque bâtiment actif.</Typography>}
      {loaded && selected && (!managementMode || managementView === 'details') && <>
        {managementMode && <Box sx={{ mt: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Typography variant="subtitle1" fontWeight={800}>{selectedCycle?.nom_batiment || 'Bâtiment'} · {selected.statut === 'termine' ? 'Lot terminé' : 'Lot en cours'}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Arrivée le {formatShortDate(selected.date_debut)}{selected.date_fin_reelle ? ' · Fin le ' + formatShortDate(selected.date_fin_reelle) : ''}</Typography>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="body2">Souche : {selected.souche || 'Non renseignée'} · Âge à l’arrivée : {selected.age_depart_semaines ?? 0} semaines</Typography>
          {selected.date_fin_prevue && <Typography variant="body2" sx={{ mt: 0.5 }}>Fin prévue : {formatShortDate(selected.date_fin_prevue)} (indicative)</Typography>}
          {selected.notes && <Typography variant="body2" sx={{ mt: 0.5 }}>Notes : {selected.notes}</Typography>}
        </Box>}
        {!managementMode && selected.statut === 'termine' && activeLots.length > 0 && <Button size="small" onClick={() => setSelectedId(String(activeLots[0].id_lot))} sx={{ mt: 1 }}>Revenir aux lots en cours</Button>}
        <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 2, md: 3 } }}>
          <Fact label={selected.statut === 'termine' ? 'Volailles à la fin' : 'Volailles présentes'} value={number(selected.effectif_actuel)} detail={'sur ' + number(selected.effectif_initial) + ' à l’arrivée'} color="primary.main" />
          <Fact label="Mortalité cumulée" value={number(selected.mortalite_totale)} />
          <Fact label={selected.statut === 'termine' ? 'Âge à la fin' : 'Âge aujourd’hui'} value={selected.age_semaines == null ? '-' : selected.age_semaines + ' semaines'} />
          <Fact label="Formule d'aliment" value={selected.formule_suggeree || '-'} />
        </Box>
        <Divider sx={{ mt: 2.5, mb: 2 }} />
        {selectedCycle && !managementMode && <Box component="section" aria-label="Bâtiment du lot" sx={{ mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>Bâtiment rattaché</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1}>
            <Typography fontWeight={600}>{selectedCycle.nom_batiment}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={1}>
              <Typography variant="body2" color="text.secondary">{number(selectedCycle.effectif_initial)} entrants | {number(selectedCycle.effectif_actuel)} restants</Typography>
              <Button size="small" onClick={() => {
                setError('');
                setHistoryCycle(selectedCycle);
                setHistoryPeriod({ date_debut: selected.date_debut, date_fin: selected.date_fin_reelle || localToday() });
              }}>Rattacher les saisies sans cycle</Button>
            </Stack>
          </Stack>
        </Box>}
        {selected.statut !== 'termine' ? <Stack direction="row" justifyContent="flex-end" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button variant="outlined" startIcon={<EditOutlined />} onClick={() => open('edit')}>Modifier le lot</Button>
          <Button variant="outlined" color="error" startIcon={<StopCircleOutlined />} onClick={() => open('end')}
            sx={{ color: 'error.main', borderColor: 'error.main', '&:hover': { color: 'error.dark', borderColor: 'error.dark', bgcolor: 'action.hover' } }}>Terminer ce lot</Button>
        </Stack> : <Typography variant="body2" color="text.secondary">Ce lot est terminé pour son bâtiment.</Typography>}
      </>}
      <Dialog open={!!historyCycle} onClose={() => { if (!saving) { setHistoryCycle(null); setError(''); } }} maxWidth="sm" fullWidth>
        <Box component="form" onSubmit={submitHistory}>
          <DialogTitle>Rattacher les saisies à {historyCycle?.nom_batiment}</DialogTitle>
          <DialogContent>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Seules les saisies sans cycle de ce bâtiment seront rattachées. Leurs valeurs restent conservées.</Typography>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <DateField label="Début de la période" required value={historyPeriod.date_debut || ''} onChange={(event) => setHistoryPeriod((old) => ({ ...old, date_debut: event.target.value }))} />
              <DateField label="Fin de la période" required value={historyPeriod.date_fin || ''} onChange={(event) => setHistoryPeriod((old) => ({ ...old, date_fin: event.target.value }))} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button color="inherit" disabled={saving} onClick={() => { setHistoryCycle(null); setError(''); }}>Annuler</Button>
            <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Enregistrement...' : 'Rattacher'}</Button>
          </DialogActions>
        </Box>
      </Dialog>
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Historique des lots</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ pt: 1 }}>
            {lots.map((lot) => <Button key={lot.id_lot} color="inherit" onClick={() => { setSelectedId(String(lot.id_lot)); setHistoryOpen(false); }}
              sx={{ justifyContent: 'space-between', gap: 2, textAlign: 'left', p: 1.5 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{lot.repartitions?.[0]?.nom_batiment || 'Bâtiment'} | {lot.nom_lot}</Typography>
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
                <Typography>Cette action termine uniquement ce lot et son bâtiment. Les autres lots restent actifs.</Typography>
                <DateField label="Date de fin" required value={values.date_fin_reelle || ''} onChange={(event) => field('date_fin_reelle', event.target.value)} />
              </> : <>
                <TextField label="Nom du lot" required inputProps={{ maxLength: 100 }} value={values.nom_lot || ''} onChange={(event) => field('nom_lot', event.target.value)} />
                <TextField select label="Bâtiment" required value={values.id_batiment ?? ''} disabled={dialog === 'edit'} onChange={(event) => field('id_batiment', event.target.value)}>
                  {(dialog === 'edit' ? buildings.filter((row) => Number(row.id_batiment) === Number(values.id_batiment)) : available)
                    .map((building) => <MenuItem key={building.id_batiment} value={building.id_batiment}>{building.nom}</MenuItem>)}
                </TextField>
                <DateField label="Date d'arrivée" required value={values.date_debut || ''} onChange={(event) => field('date_debut', event.target.value)} />
                <TextField label="Effectif initial dans ce bâtiment" required type="number" inputProps={{ min: 1, step: 1 }} value={values.effectif_initial ?? ''} onChange={(event) => field('effectif_initial', event.target.value)} />
                <TextField label="Âge à l'arrivée (semaines)" required type="number" inputProps={{ min: 0, step: 1 }} value={values.age_depart_semaines ?? 0} onChange={(event) => field('age_depart_semaines', event.target.value)} helperText="L'âge est propre à ce lot." />
                <TextField label="Durée prévue (semaines)" required type="number" inputProps={{ min: 1, step: 1 }} value={values.duree_semaines ?? 100} onChange={(event) => field('duree_semaines', event.target.value)} />
                <DateField label="Date de fin prévue (facultatif)" value={values.date_fin_prevue || ''} onChange={(event) => field('date_fin_prevue', event.target.value)} helperText="Cette date est indicative. La clôture reste une action manuelle." />
                <TextField label="Souche (facultatif)" inputProps={{ maxLength: 100 }} value={values.souche || ''} onChange={(event) => field('souche', event.target.value)} />
                <TextField label="Notes (facultatif)" multiline minRows={2} value={values.notes || ''} onChange={(event) => field('notes', event.target.value)} />
              </>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button color="inherit" disabled={saving} onClick={() => { setDialog(''); setError(''); }}>Annuler</Button>
            <Button type="submit" variant="contained" color={dialog === 'end' ? 'error' : 'primary'} disabled={saving || (dialog === 'create' && !available.length) || (dialog !== 'end' && (!values.id_batiment || Number(values.effectif_initial) <= 0))}>
              {saving ? 'Enregistrement...' : dialog === 'end' ? 'Terminer le lot' : 'Enregistrer'}
            </Button>
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
