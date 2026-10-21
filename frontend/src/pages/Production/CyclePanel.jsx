import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Collapse, MenuItem, Stack, TextField, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { formatShortDate } from '../../utils/dateFormatting';
import { cycleProductionService } from '../../services/productionService';

const number = (value) => value == null ? '-' : Number(value).toLocaleString('fr-FR');
const errorMessage = (error) => {
  const detail = error.data?.detail || error.response?.data?.detail;
  return typeof detail === 'string' ? detail : error.message || 'Impossible de charger le lot.';
};

export default function CyclePanel({ buildingId, refreshKey, onSelectCycle, stockContent, actions }) {
  const navigate = useNavigate();
  const [cycles, setCycles] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError('');
    cycleProductionService.getCycles({ id_batiment: buildingId }).then((rows) => {
      if (!cancelled) { setCycles(rows || []); setLoaded(true); }
    }).catch((err) => { if (!cancelled) setError(errorMessage(err)); });
    return () => { cancelled = true; };
  }, [buildingId, refreshKey, revision]);
  const active = cycles.find((cycle) => cycle.statut !== 'termine');
  const selected = cycles.find((cycle) => String(cycle.id_cycle) === selectedId) || active || cycles[0];
  useEffect(() => { onSelectCycle(selected?.id_cycle || null); }, [selected?.id_cycle, onSelectCycle]);

  return (
    <Box component="section" aria-label="Production du bâtiment" sx={{ mb: 3, minWidth: 0 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          {loaded && active ? <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Typography variant="body2" fontWeight={600}>{active.nom_cycle}</Typography>
            <Chip size="small" variant="outlined" label="Actif" color="success" />
          </Stack> : <Typography variant="body2" color="text.secondary">{loaded ? 'Aucun lot actif dans ce bâtiment.' : 'Chargement du lot...'}</Typography>}
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button size="small" onClick={() => navigate('/production/lots')}>Gestion des lots</Button>
          {actions}
        </Stack>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={() => setRevision((old) => old + 1)}>Réessayer</Button>}>{error}</Alert>}
      <Box sx={{ p: { xs: 2, md: 2.5 }, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper' }}>
        {stockContent}
      </Box>
      {loaded && cycles.length > 1 && <TextField select size="small" label="Lot pour la progression hebdomadaire"
        value={selected?.id_cycle || ''} onChange={(event) => setSelectedId(String(event.target.value))}
        sx={{ mt: 2, minWidth: { xs: '100%', sm: 300 } }}>
        {cycles.map((cycle) => <MenuItem key={cycle.id_cycle} value={cycle.id_cycle}>{cycle.nom_cycle} ({cycle.statut === 'termine' ? 'terminé' : 'actif'})</MenuItem>)}
      </TextField>}
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
