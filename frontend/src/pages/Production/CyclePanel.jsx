import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Menu, MenuItem, Stack, TextField, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
} from '@mui/material';
import { MoreVert } from '@mui/icons-material';
import DateField from '../../utils/DateField';
import { formatShortDate } from '../../utils/dateFormatting';
import { cycleProductionService } from '../../services/productionService';
import { localToday } from './useProductionView';

const number = (value) => value == null ? '—' : Number(value).toLocaleString('fr-FR');
const errorMessage = (error) => {
  const detail = error.data?.detail || error.response?.data?.detail;
  return typeof detail === 'string' ? detail : error.message || 'Impossible d’enregistrer le cycle.';
};

export default function CyclePanel({ buildingId, buildingName, refreshKey, onChange, onSelectCycle }) {
  const [cycles, setCycles] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [anchor, setAnchor] = useState(null);
  const [dialog, setDialog] = useState('');
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError('');
    cycleProductionService.getCycles({ id_batiment: buildingId }).then((data) => {
      if (!cancelled) { setCycles(data || []); setLoaded(true); }
    }).catch((err) => { if (!cancelled) setError(errorMessage(err)); });
    return () => { cancelled = true; };
  }, [buildingId, refreshKey, revision]);
  const active = cycles.find((cycle) => cycle.statut !== 'termine');
  const selected = cycles.find((cycle) => String(cycle.id_cycle) === String(selectedId)) || active || cycles[0];
  useEffect(() => { onSelectCycle(selected?.id_cycle || null); }, [selected?.id_cycle, onSelectCycle]);

  const openDialog = (kind) => {
    setAnchor(null);
    setError('');
    setValues(kind === 'create'
      ? { date_debut: localToday(), effectif_initial: '', age_depart_semaines: 0, souche: '', notes: '' }
      : kind === 'edit' ? { ...active }
        : kind === 'assign' ? { date_debut: selected.date_debut, date_fin: selected.date_fin_reelle || localToday() }
          : { date_fin_reelle: localToday() });
    setDialog(kind);
  };
  const field = (name, value) => setValues((old) => ({ ...old, [name]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (dialog === 'create' || dialog === 'edit') {
        const data = {
          date_debut: values.date_debut,
          effectif_initial: Number(values.effectif_initial),
          age_depart_semaines: Number(values.age_depart_semaines),
          souche: values.souche || null, notes: values.notes || null,
        };
        if (dialog === 'create') {
          const created = await cycleProductionService.createCycle({
            ...data, id_batiment: buildingId,
            nom_cycle: (buildingName || 'Bâtiment') + ' · ' + formatShortDate(values.date_debut),
          });
          setSelectedId(String(created.id_cycle));
        } else await cycleProductionService.updateCycle(active.id_cycle, data);
      } else if (dialog === 'end') {
        await cycleProductionService.terminateCycle(active.id_cycle, { date_fin_reelle: values.date_fin_reelle });
      } else await cycleProductionService.assignHistory(selected.id_cycle, values);
      setDialog('');
      setRevision((old) => old + 1);
      onChange();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  return (
    <Box component="section" aria-label="Cycle des volailles" sx={{ mb: 3, p: { xs: 2, md: 2.5 }, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Typography component="h2" variant="h6" fontWeight={900}>Cycle des volailles</Typography>
        {loaded && active && <IconButton aria-label="Actions du cycle" onClick={(event) => setAnchor(event.currentTarget)}><MoreVert /></IconButton>}
      </Stack>
      {error && !dialog && <Alert severity="error" sx={{ mt: 1 }} action={<Button onClick={() => setRevision((old) => old + 1)}>Réessayer</Button>}>{error}</Alert>}
      {!loaded && !error && <Typography color="text.secondary" sx={{ mt: 1 }}>Chargement du cycle...</Typography>}
      {loaded && !active && <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ mt: 1 }}>
        <Typography color="text.secondary">Aucun cycle actif. Enregistrez l’arrivée des poussins pour commencer leur suivi.</Typography>
        <Button variant="contained" onClick={() => openDialog('create')} sx={{ flexShrink: 0 }}>Démarrer un cycle</Button>
      </Stack>}
      {loaded && selected && <>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mt: 2 }}>
          {cycles.length > 1 ? <TextField select size="small" label="Cycle / historique" value={selected.id_cycle} onChange={(event) => setSelectedId(String(event.target.value))} sx={{ minWidth: 230, maxWidth: '100%' }}>
            {cycles.map((cycle) => <MenuItem key={cycle.id_cycle} value={cycle.id_cycle}>{cycle.nom_cycle}</MenuItem>)}
          </TextField> : <Typography fontWeight={800}>{selected.nom_cycle}</Typography>}
          <Chip size="small" label={selected.statut === 'termine' ? 'Terminé' : 'Actif'} color={selected.statut === 'termine' ? 'default' : 'success'} />
          <Typography variant="body2" color="text.secondary">Depuis le {formatShortDate(selected.date_debut)}{selected.date_fin_reelle ? ' · terminé le ' + formatShortDate(selected.date_fin_reelle) : ''}</Typography>
        </Stack>
        <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
          <Fact label="Âge des volailles" value={selected.age_semaines + ' semaines'} />
          <Fact label="Effectif restant" value={number(selected.effectif_actuel) + ' / ' + number(selected.effectif_initial)} />
          <Fact label="Mortalité cumulée" value={selected.effectif_initial == null ? '—' : number(selected.effectif_initial - selected.effectif_actuel) + ' · ' + number(((selected.effectif_initial - selected.effectif_actuel) / selected.effectif_initial * 100).toFixed(2)) + ' %'} />
          <Fact label="Formule selon l’âge" value={selected.formule_suggeree || '—'} />
        </Box>
        {selected.statut === 'termine' && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Âge et effectif arrêtés à la date de fin.</Typography>}
        <Button size="small" onClick={() => openDialog('assign')} sx={{ mt: 1.5 }}>Rattacher des saisies antérieures</Button>
      </>}
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => openDialog('edit')}>Modifier le cycle actif</MenuItem>
        <MenuItem onClick={() => openDialog('end')} sx={{ color: 'error.main' }}>Terminer le cycle actif</MenuItem>
      </Menu>
      <Dialog open={!!dialog} onClose={() => { if (!saving) { setDialog(''); setError(''); } }} maxWidth="sm" fullWidth>
        <Box component="form" onSubmit={submit}>
          <DialogTitle>{dialog === 'create' ? 'Démarrer un cycle' : dialog === 'edit' ? 'Modifier le cycle' : dialog === 'assign' ? 'Rattacher les saisies antérieures' : 'Terminer le cycle'}</DialogTitle>
          <DialogContent>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Stack spacing={2} sx={{ pt: 1 }}>
              {(dialog === 'create' || dialog === 'edit') ? <>
                <DateField label="Date d’arrivée" required value={values.date_debut || ''} onChange={(event) => field('date_debut', event.target.value)} />
                <TextField label="Nombre de poussins entrants" required type="number" inputProps={{ min: 1, step: 1 }} value={values.effectif_initial ?? ''} onChange={(event) => field('effectif_initial', event.target.value)} />
                <TextField label="Âge à l’arrivée (semaines)" required type="number" inputProps={{ min: 0, step: 1 }} value={values.age_depart_semaines ?? 0} onChange={(event) => field('age_depart_semaines', event.target.value)} helperText="0 pour des poussins nouveau-nés" />
                <TextField label="Souche (facultatif)" inputProps={{ maxLength: 100 }} value={values.souche || ''} onChange={(event) => field('souche', event.target.value)} />
                <TextField label="Notes (facultatif)" multiline minRows={2} value={values.notes || ''} onChange={(event) => field('notes', event.target.value)} />
              </> : dialog === 'assign' ? <>
                <Typography color="text.secondary">Seules les saisies de ce bâtiment sans cycle seront rattachées sur cette période. Les formules et quantités enregistrées restent conservées.</Typography>
                <DateField label="Début de la période" required value={values.date_debut || ''} onChange={(event) => field('date_debut', event.target.value)} />
                <DateField label="Fin de la période" required value={values.date_fin || ''} onChange={(event) => field('date_fin', event.target.value)} />
              </> : <>
                <Typography color="text.secondary">Le cycle sera clôturé et son historique conservé. Vous pourrez ensuite démarrer un nouveau cycle.</Typography>
                <DateField label="Date de fin" required value={values.date_fin_reelle || ''} onChange={(event) => field('date_fin_reelle', event.target.value)} />
              </>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button color="inherit" disabled={saving} onClick={() => { setDialog(''); setError(''); }}>Annuler</Button>
            <Button type="submit" variant="contained" color={dialog === 'end' ? 'error' : 'primary'} disabled={saving}>{saving ? 'Enregistrement...' : dialog === 'end' ? 'Terminer le cycle' : dialog === 'assign' ? 'Rattacher' : 'Enregistrer'}</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}

function Fact({ label, value }) {
  return <Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>;
}

export function CycleWeeklyInsights({ cycleId, refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((old) => old + 1), []);
  useEffect(() => {
    if (!cycleId) { setData(null); return undefined; }
    let cancelled = false;
    setData(null);
    setError('');
    setPage(0);
    cycleProductionService.getInsights(cycleId).then((value) => { if (!cancelled) setData(value); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); });
    return () => { cancelled = true; };
  }, [cycleId, refreshKey, revision]);
  if (!cycleId) return null;
  const weeks = [...(data?.semaines || [])].reverse();
  return (
    <Box component="section" aria-label="Suivi hebdomadaire du cycle" sx={{ mt: 3, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper' }}>
      <Typography component="h2" variant="h6" fontWeight={900}>Suivi hebdomadaire du cycle</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>Semaines depuis l’arrivée. Les moyennes utilisent les journées renseignées. Les œufs cassés sont inclus dans le taux de ponte.</Typography>
      {error ? <Alert severity="error" action={<Button onClick={reload}>Réessayer</Button>}>{error}</Alert> : !data ? <Typography>Chargement du suivi...</Typography> : <>
        <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
          <Fact label="Œufs du cycle" value={number(data.total_oeufs)} />
          <Fact label="Aliment consommé" value={number(data.total_aliment_kg) + ' kg'} />
          <Fact label="Journées saisies" value={number(data.jours_saisis)} />
        </Stack>
        <TableContainer>
          <Table size="small" aria-label="Progression hebdomadaire des volailles" sx={{ minWidth: 900 }}>
            <TableHead><TableRow>{['Âge / semaine', 'Période', 'Effectif restant', 'Mortalité', 'Œufs', 'Aliment (kg)', 'Formule utilisée', 'Jours saisis', 'Ponte moyenne (%)', 'Aliment (g / volaille / jour)'].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
            <TableBody>{weeks.slice(page * 5, page * 5 + 5).map((week) => <TableRow key={week.semaine}>
              <TableCell>{week.age_semaines} sem. / S{week.semaine}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatShortDate(week.date_debut)} – {formatShortDate(week.date_fin)}</TableCell>
              <TableCell>{number(week.effectif_fin)}</TableCell>
              <TableCell>{week.jours_saisis ? number(week.mortalite) : '—'}</TableCell>
              <TableCell>{week.jours_saisis ? number(week.oeufs) : '—'}</TableCell>
              <TableCell>{week.jours_aliment ? number(week.aliment_kg) : '—'}</TableCell>
              <TableCell>{week.formules.join(', ') || '—'}</TableCell>
              <TableCell><Chip size="small" variant="outlined" color={week.jours_saisis < week.jours_attendus ? 'warning' : 'success'} label={week.jours_saisis + '/' + week.jours_attendus} /></TableCell>
              <TableCell>{number(week.ponte_pct)}</TableCell>
              <TableCell>{number(week.g_poule_jour)}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={weeks.length} page={page} onPageChange={(_, next) => setPage(next)} rowsPerPage={5} rowsPerPageOptions={[5]} labelDisplayedRows={({ from, to, count }) => from + '–' + to + ' sur ' + count} />
      </>}
    </Box>
  );
}
