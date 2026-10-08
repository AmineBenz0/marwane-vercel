import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Collapse, Divider, Stack, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
} from '@mui/material';
import { HistoryOutlined, KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import DateField from '../../utils/DateField';
import { formatShortDate } from '../../utils/dateFormatting';
import { cycleProductionService } from '../../services/productionService';
import useProductionView, { localToday, productionLink } from './useProductionView';

const number = (value) => value == null ? '—' : Number(value).toLocaleString('fr-FR');
const errorMessage = (error) => {
  const detail = error.data?.detail || error.response?.data?.detail;
  return typeof detail === 'string' ? detail : error.message || 'Impossible d’enregistrer le cycle.';
};

export default function CyclePanel({ buildingId, refreshKey, onChange, onSelectCycle, stockContent }) {
  const { selectedDate } = useProductionView();
  const [cycles, setCycles] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
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
    <Box component="section" aria-label="Cycle des volailles" sx={{ mb: 3, minWidth: 0 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap', minWidth: 0 }}>
          {loaded && selected ? <>
            <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{selected.nom_cycle}</Typography>
            <Chip size="small" variant="outlined" label={selected.statut === 'termine' ? 'Terminé' : 'Actif'} color={selected.statut === 'termine' ? 'default' : 'success'} />
            <Typography variant="body2" color="text.secondary">{selected.age_semaines == null ? '—' : selected.age_semaines + ' semaines'} · {selected.formule_suggeree || '—'}</Typography>
          </> : <Typography variant="body2" color="text.secondary">{loaded ? 'Aucun lot actif dans ce bâtiment.' : 'Chargement du lot…'}</Typography>}
        </Stack>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {cycles.length > 1 && <Button size="small" startIcon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>Historique des lots</Button>}
          <Button component={RouterLink} to={productionLink(null, selectedDate)} size="small">Gérer les lots</Button>
        </Stack>
      </Stack>
      {error && !dialog && <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={() => setRevision((old) => old + 1)}>Réessayer le lot</Button>}>{error}</Alert>}
      <Box sx={{ p: { xs: 2, md: 2.5 }, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper' }}>
        <Typography component="h2" variant="h6" fontWeight={800} sx={{ mb: 2 }}>{selected?.statut === 'termine' ? 'Situation en fin de lot' : 'Situation actuelle'}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: { xs: 2, md: 4 } }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body1" fontWeight={700}>{selected?.statut === 'termine' ? 'Volailles en fin de lot' : 'Volailles restantes'}</Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 0.5 }}>{loaded && selected ? number(selected.effectif_actuel) : '—'}</Typography>
            {loaded && selected && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              sur {number(selected.effectif_initial)} entrantes · {selected.effectif_initial == null ? '—' : number(selected.effectif_initial - selected.effectif_actuel)} mortalités cumulées
              {selected.effectif_initial > 0 ? ' (' + number(((selected.effectif_initial - selected.effectif_actuel) / selected.effectif_initial * 100).toFixed(2)) + ' %)' : ''}
            </Typography>}
            {loaded && selected && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Arrivée le {formatShortDate(selected.date_debut)}{selected.date_fin_reelle ? ' · Fin le ' + formatShortDate(selected.date_fin_reelle) : ''}
            </Typography>}
            {loaded && !selected && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Affectez les poussins depuis la gestion des lots.</Typography>}
          </Box>
          <Box sx={{ minWidth: 0, borderLeft: { md: '1px solid' }, borderTop: { xs: '1px solid', md: 'none' }, borderColor: 'divider', pl: { md: 3 }, pt: { xs: 2, md: 0 } }}>{stockContent}</Box>
        </Box>
        {loaded && selected && <>
          <Divider sx={{ mt: 2, mb: 1 }} />
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {selected.statut === 'termine' && <Typography variant="caption" color="text.secondary">Âge et effectif arrêtés à la date de fin du lot.</Typography>}
            <Button size="small" onClick={() => { setError(''); setValues({ date_debut: selected.date_debut, date_fin: selected.date_fin_reelle || localToday() }); setDialog(true); }}>Rattacher des saisies antérieures</Button>
          </Stack>
        </>}
      </Box>
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Historique des lots du bâtiment</DialogTitle>
        <DialogContent><Stack spacing={1} sx={{ pt: 1 }}>
          {cycles.map((item) => <Button key={item.id_cycle} color="inherit" onClick={() => { setSelectedId(String(item.id_cycle)); setHistoryOpen(false); }}
            sx={{ justifyContent: 'space-between', gap: 2, textAlign: 'left' }}>
            <Box sx={{ minWidth: 0 }}><Typography fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{item.nom_cycle}</Typography>
              <Typography variant="body2" color="text.secondary">Arrivée le {formatShortDate(item.date_debut)}</Typography></Box>
            <Chip size="small" variant="outlined" label={item.statut === 'termine' ? 'Terminé' : 'Actif'} color={item.statut === 'termine' ? 'default' : 'success'} />
          </Button>)}
        </Stack></DialogContent>
        <DialogActions><Button onClick={() => setHistoryOpen(false)}>Fermer</Button></DialogActions>
      </Dialog>
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
  const [expandedWeek, setExpandedWeek] = useState(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((old) => old + 1), []);
  useEffect(() => {
    if (!cycleId) { setData(null); return undefined; }
    let cancelled = false;
    setData(null);
    setError('');
    setPage(0);
    setExpandedWeek(null);
    cycleProductionService.getInsights(cycleId).then((value) => { if (!cancelled) setData(value); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); });
    return () => { cancelled = true; };
  }, [cycleId, refreshKey, revision]);
  if (!cycleId) return null;
  const weeks = [...(data?.semaines || [])].reverse();
  return (
    <Box component="section" aria-label="Suivi hebdomadaire du cycle" sx={{ mt: 3, p: { xs: 2, md: 2.5 }, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper' }}>
      <Typography component="h2" variant="h6" fontWeight={800}>Progression hebdomadaire</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>Depuis l’arrivée du lot. Les détails de chaque semaine incluent la période, la formule et les moyennes.</Typography>
      {error ? <Alert severity="error" action={<Button onClick={reload}>Réessayer</Button>}>{error}</Alert> : !data ? <Typography>Chargement du suivi...</Typography> : <>
        <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Table size="small" aria-label="Progression hebdomadaire des volailles" sx={{ minWidth: 680 }}>
            <TableHead><TableRow>{['Âge / semaine', 'Volailles restantes', 'Mortalité', 'Œufs collectés', 'Aliment (kg)', 'Jours saisis', 'Détails'].map((label) => <TableCell key={label} sx={{ textTransform: 'none !important' }}>{label}</TableCell>)}</TableRow></TableHead>
            <TableBody>{weeks.slice(page * 5, page * 5 + 5).map((week) => <Fragment key={week.semaine}>
              <TableRow>
                <TableCell>{week.age_semaines} sem. / S{week.semaine}</TableCell>
                <TableCell>{number(week.effectif_fin)}</TableCell>
                <TableCell>{week.jours_saisis ? number(week.mortalite) : '—'}</TableCell>
                <TableCell>{week.jours_saisis ? number(week.oeufs) : '—'}</TableCell>
                <TableCell>{week.jours_aliment ? number(week.aliment_kg) : '—'}</TableCell>
                <TableCell><Chip size="small" variant="outlined" color={week.jours_saisis < week.jours_attendus ? 'warning' : 'success'} label={week.jours_saisis + '/' + week.jours_attendus} /></TableCell>
                <TableCell><Button size="small" aria-label={'Détails de la semaine ' + week.semaine} aria-expanded={expandedWeek === week.semaine}
                  aria-controls={'week-detail-' + cycleId + '-' + week.semaine} onClick={() => setExpandedWeek(expandedWeek === week.semaine ? null : week.semaine)}
                  endIcon={expandedWeek === week.semaine ? <KeyboardArrowUp /> : <KeyboardArrowDown />}>Détails</Button></TableCell>
              </TableRow>
              <TableRow><TableCell colSpan={7} sx={{ py: 0 }}>
                <Collapse in={expandedWeek === week.semaine} unmountOnExit>
                  <Box id={'week-detail-' + cycleId + '-' + week.semaine} sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2, py: 2 }}>
                    <Fact label="Période" value={formatShortDate(week.date_debut) + ' – ' + formatShortDate(week.date_fin)} />
                    <Fact label="Formule utilisée" value={(week.formules || []).join(', ') || '—'} />
                    <Fact label="Ponte moyenne (%)" value={number(week.ponte_pct)} />
                    <Fact label="Aliment (g / volaille / jour)" value={number(week.g_poule_jour)} />
                    <Typography variant="caption" color="text.secondary" sx={{ gridColumn: '1 / -1' }}>Les moyennes utilisent les journées renseignées. Les œufs cassés sont inclus dans le taux de ponte.</Typography>
                  </Box>
                </Collapse>
              </TableCell></TableRow>
            </Fragment>)}</TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={weeks.length} page={page} onPageChange={(_, next) => { setPage(next); setExpandedWeek(null); }} rowsPerPage={5} rowsPerPageOptions={[5]} getItemAriaLabel={(type) => type === 'next' ? 'Page suivante' : 'Page précédente'} labelDisplayedRows={({ from, to, count }) => from + '–' + to + ' sur ' + count}
          sx={{ '& .MuiTablePagination-toolbar': { flexWrap: 'wrap' } }} />
        <Typography variant="body2" color="text.secondary">Total du lot dans ce bâtiment : {number(data.total_oeufs)} œufs · {number(data.total_aliment_kg)} kg d’aliment · {number(data.jours_saisis)} journées saisies</Typography>
      </>}
    </Box>
  );
}
