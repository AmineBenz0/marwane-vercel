import { useEffect, useId, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Stack, Tab, Tabs, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Typography, useTheme,
} from '@mui/material';
import { ArrowBack, ArrowForward, DownloadOutlined, EditOutlined, StopCircleOutlined } from '@mui/icons-material';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { productionService } from '../../services/productionService';
import DateField from '../../utils/DateField';
import { formatShortDate } from '../../utils/dateFormatting';
import { localToday } from './useProductionView';
import { downloadLotCsv, lotChartDays, lotDailyRows, shiftLotDate } from './lotDetailsData';

const number = (value) => value == null ? '—' : Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const panel = { p: { xs: 2, md: 2.5 }, border: '1px solid', borderColor: 'divider', borderRadius: 2, minWidth: 0, bgcolor: 'background.paper' };
const failure = (error) => error?.response?.data?.detail || error?.message || 'Chargement impossible.';

export default function LotDetails({ lot, refreshKey, onBack, onEdit, onEnd }) {
  const ids = useId();
  const cycle = lot.repartitions?.[0];
  const cycleId = cycle?.id_cycle;
  const buildingId = cycle?.id_batiment;
  const finished = lot.statut === 'termine';
  const start = lot.date_debut;
  const end = lot.date_fin_reelle && lot.date_fin_reelle < localToday() ? lot.date_fin_reelle : localToday();
  const [tab, setTab] = useState('overview');
  const [period, setPeriod] = useState(finished ? 'all' : '7');
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  const [limit, setLimit] = useState(7);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState({ rows: [], vaccines: [], loading: true, productionError: '', vaccineError: '' });

  useEffect(() => {
    let cancelled = false;
    setData({ rows: [], vaccines: [], loading: true, productionError: '', vaccineError: '' });
    if (!cycleId || !buildingId) {
      setData({ rows: [], vaccines: [], loading: false, productionError: 'Aucun bâtiment rattaché à ce lot.', vaccineError: 'Aucun bâtiment rattaché à ce lot.' });
      return undefined;
    }
    const loadProduction = async () => {
      const rows = [];
      let page;
      do {
        page = await productionService.getProductions({ id_cycle: cycleId, date_debut: start, date_fin: end, skip: rows.length, limit: 500 });
        rows.push(...page);
      } while (page.length === 500);
      return rows;
    };
    Promise.allSettled([loadProduction(), productionService.getBuildingVaccineExpenses(buildingId)]).then(([production, vaccines]) => {
      if (cancelled) return;
      setData({
        loading: false,
        rows: production.status === 'fulfilled' ? production.value : [],
        vaccines: vaccines.status === 'fulfilled' ? (vaccines.value || []).filter((charge) => Number(charge.id_cycle) === Number(cycleId)
          && charge.date_charge >= start && charge.date_charge <= end && charge.est_actif !== false) : [],
        productionError: production.status === 'rejected' ? String(failure(production.reason)) : '',
        vaccineError: vaccines.status === 'rejected' ? String(failure(vaccines.reason)) : '',
      });
    });
    return () => { cancelled = true; };
  }, [cycleId, buildingId, start, end, refreshKey, retry]);

  const days = useMemo(() => lotDailyRows(data.rows, cycleId, start, end), [data.rows, cycleId, start, end]);
  const rangeStart = period === 'all' ? start : period === 'custom' ? from : [start, shiftLotDate(end, 1 - Number(period))].sort().at(-1);
  const rangeEnd = period === 'custom' ? to : end;
  const validRange = rangeStart >= start && rangeEnd <= end && rangeStart <= rangeEnd;
  const filtered = validRange ? days.filter((day) => day.date >= rangeStart && day.date <= rangeEnd) : [];
  const recentStart = [start, shiftLotDate(end, -6)].sort().at(-1);
  const recent = days.filter((day) => day.date >= recentStart);
  const total = filtered.length ? filtered.reduce((sum, day) => sum + day.eggs, 0) : null;
  const last = days.at(-1)?.date;
  const losses = lot.mortalite_totale;
  const rate = losses != null && Number(lot.effectif_initial) > 0 ? Number(losses) * 100 / Number(lot.effectif_initial) : null;
  const title = finished ? lot.nom_lot : lot.nom_lot?.replace(/\s+en cours$/i, '').trim() || lot.nom_lot;
  const choosePeriod = (value) => { setPeriod(value); setLimit(7); };
  const retryButton = <Button color="inherit" onClick={() => setRetry((value) => value + 1)}>Réessayer</Button>;
  const productionState = data.loading ? <Stack alignItems="center" sx={{ py: 5 }}><CircularProgress size={26} aria-label="Chargement de la production" /></Stack>
    : data.productionError ? <Alert severity="error" action={retryButton}>{data.productionError}</Alert> : null;

  return <Box component="section" aria-label="Détails du lot" sx={{ minWidth: 0 }}>
    <Button color="inherit" startIcon={<ArrowBack />} onClick={onBack} sx={{ mb: 2 }}>Retour aux lots</Button>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Typography component="h1" variant="h4" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{title}</Typography>
          <Chip size="small" variant="outlined" label={finished ? 'Terminé' : 'En cours'} color={finished ? 'default' : 'success'} />
        </Stack>
        <Typography color="text.secondary" variant="body2" sx={{ mt: 0.75 }}>{cycle?.nom_batiment || 'Bâtiment'} · Arrivé le {formatShortDate(start)}{finished && lot.date_fin_reelle ? ' · Terminé le ' + formatShortDate(lot.date_fin_reelle) : ''}</Typography>
      </Box>
      {!finished && <Button variant="outlined" startIcon={<EditOutlined />} onClick={onEdit}>Modifier le lot</Button>}
    </Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, mb: 3 }}>
      <Metric label={finished ? 'Volailles à la fin' : 'Volailles présentes'} value={number(lot.effectif_actuel)} detail={number(lot.effectif_initial) + ' à l’arrivée'} />
      <Metric label={finished ? 'Âge à la fin' : 'Âge actuel'} value={lot.age_semaines == null ? '—' : number(lot.age_semaines) + ' semaines'} detail={lot.age_depart_semaines == null ? 'Âge à l’arrivée non renseigné' : number(lot.age_depart_semaines) + ' semaines à l’arrivée'} />
      <Metric label="Pertes depuis l’arrivée" value={losses == null ? '—' : number(losses) + (Number(losses) === 1 ? ' volaille' : ' volailles')} detail={rate == null ? 'Taux indisponible' : number(rate) + ' % de l’effectif initial'} />
    </Box>
    <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="fullWidth" aria-label="Détails du lot" sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 2.5 }}>
      {[['overview', 'Vue d’ensemble'], ['production', 'Production'], ['vaccines', 'Vaccins et dépenses']].map(([value, label]) => <Tab key={value} id={ids + '-tab-' + value} aria-controls={ids + '-panel-' + value} value={value} label={label} sx={{ textTransform: 'none', minWidth: 0, px: 1 }} />)}
    </Tabs>
    <Box role="tabpanel" hidden={tab !== 'overview'} id={ids + '-panel-overview'} aria-labelledby={ids + '-tab-overview'}>
      {tab === 'overview' && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.7fr) minmax(260px, 1fr)' }, gap: 2 }}>
        <Box sx={panel}>
          <Stack direction="row" justifyContent="space-between" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 1 }}>
            <Box><Typography variant="h6" component="h2" fontWeight={700}>{finished ? 'Dernière semaine du lot' : 'Production récente'}</Typography><Typography variant="caption" color="text.secondary">{formatShortDate(recentStart)} – {formatShortDate(end)} · tous types d’œufs</Typography></Box>
            <Button endIcon={<ArrowForward />} onClick={() => { choosePeriod('7'); setTab('production'); }}>Voir le détail</Button>
          </Stack>
          {productionState || <DailyChart rows={recent} start={recentStart} end={end} />}
          {!data.loading && !data.productionError && <><Divider sx={{ my: 1.5 }} /><Stack direction="row" justifyContent="space-between" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}><Typography variant="caption" color="text.secondary">{last ? 'Dernière saisie : ' + formatShortDate(last) : 'Aucune saisie enregistrée'}</Typography>{recent.length > 0 && <Typography variant="caption">{number(recent.reduce((sum, day) => sum + day.eggs, 0))} œufs sur la période</Typography>}</Stack></>}
        </Box>
        <Stack spacing={2}>
          {!finished && <Box sx={panel}><Typography component="h2" variant="subtitle1" fontWeight={700}>Alimentation conseillée</Typography><Typography color="primary.main" fontWeight={700} sx={{ mt: 1 }}>{lot.formule_suggeree || 'Aucune formule suggérée'}</Typography><Typography variant="caption" color="text.secondary">Formule suggérée selon l’âge du lot</Typography></Box>}
          <Box sx={panel}>
            <Typography component="h2" variant="subtitle1" fontWeight={700}>Informations du lot</Typography>
            <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 1.5, m: 0, mt: 2, '& dt': { color: 'text.secondary' }, '& dd': { m: 0, textAlign: 'right', overflowWrap: 'anywhere' } }}>
              <Typography component="dt" variant="body2">Souche</Typography><Typography component="dd" variant="body2">{lot.souche || 'Non renseignée'}</Typography>
              <Typography component="dt" variant="body2">Arrivée</Typography><Typography component="dd" variant="body2">{formatShortDate(start)}</Typography>
              <Typography component="dt" variant="body2">{finished ? 'Fin du lot' : 'Fin prévue'}</Typography><Box component="dd"><Typography variant="body2">{(finished ? lot.date_fin_reelle : lot.date_fin_prevue) ? formatShortDate(finished ? lot.date_fin_reelle : lot.date_fin_prevue) : 'Non renseignée'}</Typography>{!finished && lot.date_fin_prevue && <Typography variant="caption" color="text.secondary">Date indicative</Typography>}</Box>
            </Box>
            {lot.notes && <><Divider sx={{ my: 2 }} /><Typography variant="caption" color="text.secondary">Notes</Typography><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{lot.notes}</Typography></>}
          </Box>
        </Stack>
      </Box>}
    </Box>
    <Box role="tabpanel" hidden={tab !== 'production'} id={ids + '-panel-production'} aria-labelledby={ids + '-tab-production'}>
      {tab === 'production' && <>
        <Stack direction="row" justifyContent="space-between" alignItems="center" useFlexGap sx={{ flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }} aria-label="Période de production">{[['7', '7 jours'], ['30', '30 jours'], ['all', 'Toute la période']].map(([value, label]) => <Button key={value} variant={period === value ? 'contained' : 'outlined'} aria-pressed={period === value} onClick={() => choosePeriod(value)}>{label}</Button>)}</Stack>
          <Button variant="outlined" startIcon={<DownloadOutlined />} disabled={data.loading || !!data.productionError || !filtered.length} onClick={() => downloadLotCsv(lot, filtered)}>Exporter</Button>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
          <DateField label="Du" size="small" value={rangeStart} inputProps={{ min: start, max: rangeEnd }} onChange={(event) => { setFrom(event.target.value); setTo(rangeEnd); choosePeriod('custom'); }} />
          <DateField label="Au" size="small" value={rangeEnd} inputProps={{ min: rangeStart, max: end }} onChange={(event) => { setTo(event.target.value); setFrom(rangeStart); choosePeriod('custom'); }} />
        </Stack>
        {!validRange && <Alert severity="warning" sx={{ mb: 2 }}>Choisissez une période comprise entre le {formatShortDate(start)} et le {formatShortDate(end)}, avec une date de début antérieure à la date de fin.</Alert>}
        {productionState || (validRange && <>
          <Box sx={panel}><Typography component="h2" variant="h6" fontWeight={700}>Œufs produits</Typography><Typography variant="caption" color="text.secondary">{formatShortDate(rangeStart)} – {formatShortDate(rangeEnd)} · tous types d’œufs</Typography><DailyChart rows={filtered} start={rangeStart} end={rangeEnd} /><Divider sx={{ my: 1.5 }} /><Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap' }}><Typography variant="body2"><strong>{number(total)}</strong> œufs produits</Typography><Typography variant="body2"><strong>{filtered.length}</strong> journées renseignées</Typography>{filtered.length > 0 && <Typography variant="body2"><strong>{number(total / filtered.length)}</strong> œufs / jour renseigné</Typography>}</Stack></Box>
          <Box sx={{ ...panel, mt: 2 }}><Typography component="h2" variant="h6" fontWeight={700}>Saisies quotidiennes</Typography><Typography variant="caption" color="text.secondary">Une ligne par jour · {Math.min(limit, filtered.length)} sur {filtered.length} journées renseignées</Typography>
            <TableContainer sx={{ mt: 1.5 }}><Table size="small" aria-label="Saisies quotidiennes du lot"><TableHead><TableRow><TableCell>Date</TableCell>{['Normaux', 'Doubles jaunes', 'Blancs', 'Cassés / perdus', 'Pertes de volailles', 'Aliment (kg)'].map((label) => <TableCell key={label} align="right">{label}</TableCell>)}</TableRow></TableHead><TableBody>{filtered.slice(-limit).reverse().map((day) => <TableRow key={day.date}><TableCell sx={{ whiteSpace: 'nowrap' }}>{formatShortDate(day.date)}</TableCell>{['normal', 'double_jaune', 'blanc', 'casse'].map((key) => <TableCell key={key} align="right">{number(day.counts[key] || 0)}</TableCell>)}<TableCell align="right">{number(day.mortality)}</TableCell><TableCell align="right">{number(day.feed)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
            {!filtered.length && <Typography color="text.secondary" sx={{ py: 2 }}>Aucune saisie sur cette période.</Typography>}
            {limit < filtered.length && <Button sx={{ mt: 1 }} onClick={() => setLimit((value) => value + 25)}>Afficher plus de journées</Button>}
          </Box>
        </>)}
      </>}
    </Box>
    <Box role="tabpanel" hidden={tab !== 'vaccines'} id={ids + '-panel-vaccines'} aria-labelledby={ids + '-tab-vaccines'}>
      {tab === 'vaccines' && <Box sx={panel}><Stack direction="row" justifyContent="space-between" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}><Box><Typography component="h2" variant="h6" fontWeight={700}>Vaccins et dépenses</Typography><Typography variant="caption" color="text.secondary">{formatShortDate(start)} – {formatShortDate(end)} · ce lot uniquement</Typography></Box>{!data.loading && !data.vaccineError && <Box><Typography variant="h6" fontWeight={800}>{number(data.vaccines.reduce((sum, charge) => sum + Number(charge.montant || 0), 0))} MAD</Typography><Typography variant="caption" color="text.secondary">Total des dépenses de vaccins</Typography></Box>}</Stack>
        {data.loading ? <CircularProgress size={26} aria-label="Chargement des vaccins" /> : data.vaccineError ? <Alert severity="error" action={retryButton}>{data.vaccineError}</Alert> : !data.vaccines.length ? <Typography color="text.secondary">Aucune dépense de vaccin enregistrée pour ce lot.</Typography> : <TableContainer><Table size="small" aria-label="Dépenses de vaccins du lot"><TableHead><TableRow><TableCell>Date</TableCell><TableCell>Vaccin</TableCell><TableCell align="right">Quantité</TableCell><TableCell align="right">Montant</TableCell></TableRow></TableHead><TableBody>{[...data.vaccines].sort((a, b) => b.date_charge.localeCompare(a.date_charge)).map((charge) => <TableRow key={charge.id_charge}><TableCell sx={{ whiteSpace: 'nowrap' }}>{formatShortDate(charge.date_charge)}</TableCell><TableCell>{charge.nom_vaccin || charge.libelle}</TableCell><TableCell align="right">{number(charge.quantite)} {charge.unite || ''}</TableCell><TableCell align="right">{number(charge.montant)} MAD</TableCell></TableRow>)}</TableBody></Table></TableContainer>}
      </Box>}
    </Box>
    <Divider sx={{ mt: 3, mb: 2 }} />
    <Stack direction="row" alignItems="center" justifyContent="space-between" useFlexGap sx={{ gap: 2, flexWrap: 'wrap' }}><Typography variant="caption" color="text.secondary">{finished ? 'Lot terminé le ' + formatShortDate(lot.date_fin_reelle) + ' · Historique conservé' : 'Lot suivi depuis le ' + formatShortDate(start)}</Typography>{!finished && <Button color="error" variant="outlined" startIcon={<StopCircleOutlined />} onClick={onEnd} sx={{ color: 'error.main', borderColor: 'error.main', '&:hover': { color: 'error.dark', borderColor: 'error.dark', bgcolor: 'action.hover' } }}>Terminer le lot</Button>}</Stack>
  </Box>;
}

function Metric({ label, value, detail }) {
  return <Box sx={panel}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h5" fontWeight={800} sx={{ mt: 1, mb: 0.5, overflowWrap: 'anywhere' }}>{value}</Typography><Typography variant="caption" color="text.secondary">{detail}</Typography></Box>;
}

function DailyChart({ rows, start, end }) {
  const theme = useTheme();
  const chartDays = useMemo(() => lotChartDays(rows, start, end), [rows, start, end]);
  if (!rows.length) return <Typography color="text.secondary" sx={{ py: 5 }}>Aucune production enregistrée sur cette période.</Typography>;
  return <Box component="figure" aria-label="Production quotidienne d’œufs" sx={{ m: 0, mt: 2 }}><Box sx={{ width: '100%', height: { xs: 240, sm: 280 }, minWidth: 0 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={chartDays} accessibilityLayer margin={{ top: 8, right: 12, bottom: 4, left: 0 }}><CartesianGrid stroke={theme.palette.divider} vertical={false} /><XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={35} tick={{ fill: theme.palette.text.secondary, fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis width={55} allowDecimals={false} tick={{ fill: theme.palette.text.secondary, fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip labelFormatter={formatShortDate} formatter={(value) => [number(value), 'Œufs']} /><Line name="Œufs" type="linear" dataKey="eggs" stroke={theme.palette.primary.main} strokeWidth={2.5} dot={{ r: chartDays.length > 30 ? 2 : 3 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></Box><Typography variant="caption" color="text.secondary">Œufs par jour · Les journées sans saisie restent vides.</Typography></Box>;
}
