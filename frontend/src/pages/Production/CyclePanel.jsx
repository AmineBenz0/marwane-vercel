import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
} from '@mui/material';
import DateField from '../../utils/DateField';
import { formatShortDate } from '../../utils/dateFormatting';
import { cycleProductionService } from '../../services/productionService';
import { localToday } from './useProductionView';

const number = (value) => value == null ? '—' : Number(value).toLocaleString('fr-FR');
const errorMessage = (error) => {
  const detail = error.data?.detail || error.response?.data?.detail;
  return typeof detail === 'string' ? detail : error.message || 'Impossible d’enregistrer le cycle.';
};

export default function CyclePanel({ buildingId, refreshKey, onChange, onSelectCycle }) {
  const [cycles, setCycles] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(false);
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

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await cycleProductionService.assignHistory(selected.id_cycle, values);
      setDialog(false);
      setRevision((old) => old + 1);
      onChange();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };
  return (
    <Box component="section" aria-label="Cycle des volailles" sx={{ mb: 3, p: { xs: 2, md: 2.5 }, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
        <Typography component="h2" variant="h6" fontWeight={900}>Cycle des volailles</Typography>
        <Button component={RouterLink} to="/production" size="small" sx={{ alignSelf: 'start' }}>Gérer les lots</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>L’arrivée, l’âge et la formule sont communs au lot. Les effectifs et résultats ci-dessous concernent ce bâtiment.</Typography>
      {error && !dialog && <Alert severity="error" sx={{ mt: 1 }} action={<Button onClick={() => setRevision((old) => old + 1)}>Réessayer</Button>}>{error}</Alert>}
      {!loaded && !error && <Typography color="text.secondary" sx={{ mt: 1 }}>Chargement du cycle...</Typography>}
      {loaded && !active && <Typography color="text.secondary" sx={{ mt: 1 }}>Aucun lot actif dans ce bâtiment. Affectez les poussins depuis la gestion des lots.</Typography>}
      {loaded && selected && <>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mt: 2 }}>
          {cycles.length > 1 ? <TextField select size="small" label="Lot / historique" value={selected.id_cycle} onChange={(event) => setSelectedId(String(event.target.value))} sx={{ minWidth: 230, maxWidth: '100%' }}>
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
        {selected.statut === 'termine' && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Âge et effectif arrêtés à la date de fin du lot.</Typography>}
        <Button size="small" onClick={() => { setError(''); setValues({ date_debut: selected.date_debut, date_fin: selected.date_fin_reelle || localToday() }); setDialog(true); }} sx={{ mt: 1.5 }}>Rattacher des saisies antérieures</Button>
      </>}
      <Dialog open={dialog} onClose={() => { if (!saving) { setDialog(false); setError(''); } }} maxWidth="sm" fullWidth>
        <Box component="form" onSubmit={submit}>
          <DialogTitle>Rattacher les saisies antérieures</DialogTitle>
          <DialogContent>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography color="text.secondary">Seules les saisies de ce bâtiment sans lot seront rattachées sur cette période. Les formules et quantités enregistrées restent conservées.</Typography>
              <DateField label="Début de la période" required value={values.date_debut || ''} onChange={(event) => setValues((old) => ({ ...old, date_debut: event.target.value }))} />
              <DateField label="Fin de la période" required value={values.date_fin || ''} onChange={(event) => setValues((old) => ({ ...old, date_fin: event.target.value }))} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button color="inherit" disabled={saving} onClick={() => { setDialog(false); setError(''); }}>Annuler</Button>
            <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Enregistrement...' : 'Rattacher'}</Button>
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
