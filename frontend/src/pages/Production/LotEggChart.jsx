import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Collapse, IconButton, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography, useTheme,
} from '@mui/material';
import { Brush, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { lotProductionService } from '../../services/productionService';
import { EGG_TYPE_LABELS } from '../../utils/dailyProduction';
import { formatShortDate } from '../../utils/dateFormatting';
import { createLotEggDemo, LOT_EGG_DEMO_SCENARIOS } from './lotEggDemo';
import { axisEggValue, eggAxis, plotEggValue } from './lotEggChartScale';
import { ExpandLessRounded, ExpandMoreRounded, InfoOutlined, TableChartOutlined, TuneRounded } from '@mui/icons-material';
import ExpandableDetails from '../../components/ExpandableDetails';
import MuiTooltip from '@mui/material/Tooltip';

const SERIES = [
  { key: 'normal', color: '#2563eb' },
  { key: 'blanc', color: '#0f766e', dash: '6 3' },
  { key: 'double_jaune', color: '#a16207', dash: '3 3' },
  { key: 'casse', color: '#dc2626', dash: '10 4' },
];
const number = (value) => value == null ? '—' : Number(value).toLocaleString('fr-FR');
const period = (week) => `${formatShortDate(week.date_debut)} – ${formatShortDate(week.date_fin)}`;
const coverage = (week) => `${week.saisies} / ${week.saisies_attendues} saisies`;

export function WeekTooltip({ active, payload }) {
  const week = payload?.[0]?.payload;
  if (!active || !week) return null;
  return <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', boxShadow: 3, maxWidth: 280 }}>
    <Typography fontWeight={700}>Semaine {week.semaine}{week.partielle ? ' (partielle)' : ''}</Typography>
    <Typography variant="caption" color="text.secondary">{period(week)}</Typography>
    <Stack spacing={0.5} sx={{ mt: 1 }}>
      {payload.filter((item) => item.value != null).map((item) => {
        const key = String(item.dataKey).replace(/^plot_/, '');
        const value = String(item.dataKey).startsWith('plot_') ? week[key] : item.value;
        return <Typography key={item.dataKey} variant="body2" sx={{ color: item.color }}>
          {item.name} : <strong>{number(value)}</strong>
        </Typography>;
      })}
    </Stack>
    <Typography variant="caption" color={week.incomplete ? 'warning.dark' : 'text.secondary'} sx={{ display: 'block', mt: 1 }}>
      {coverage(week)}{week.incomplete ? ' · Données incomplètes' : ''}
    </Typography>
  </Box>;
}

// The parent keys this component by lot ID, resetting controls and discarding
// the previous lot's chart immediately when switching to history.
export default function LotEggChart({ lotId, refreshKey }) {
  const theme = useTheme();
  const demosEnabled = import.meta.env.VITE_DEPLOYMENT_ENV === 'preview'
    || import.meta.env.VITE_DEPLOYMENT_ENV === 'development';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [hidden, setHidden] = useState([]);
  const [details, setDetails] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [demoScenario, setDemoScenario] = useState('');
  const [scaleMode, setScaleMode] = useState('adapted');
  const [range, setRange] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    lotProductionService.getEggEvolution(lotId).then((result) => {
      if (!cancelled) setData(result);
    }).catch(() => {
      if (!cancelled) setError("Impossible de charger l'évolution des œufs de ce lot.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lotId, refreshKey, retry]);

  const activeDemo = demosEnabled ? demoScenario : '';
  const chartData = activeDemo ? createLotEggDemo(activeDemo) : data;
  const weeks = (chartData?.semaines || []).map((week) => ({ ...week, ...week.quantites }));
  const recorded = weeks.some((week) => week.saisies > 0);
  const incomplete = weeks.some((week) => week.incomplete);
  const visible = SERIES.filter((series) => !hidden.includes(series.key));
  const startIndex = Math.min(range?.startIndex ?? 0, Math.max(0, weeks.length - 1));
  const endIndex = Math.max(startIndex, Math.min(range?.endIndex ?? weeks.length - 1, weeks.length - 1));
  const periodLabel = weeks.length > 1
    ? `Semaines ${weeks[startIndex]?.semaine}–${weeks[endIndex]?.semaine} · ${formatShortDate(weeks[startIndex]?.date_debut)} – ${formatShortDate(weeks[endIndex]?.date_fin)}`
    : weeks.length === 1
      ? `Semaine ${weeks[0].semaine} · ${formatShortDate(weeks[0].date_debut)}`
      : '';
  const displayedWeeks = weeks.slice(startIndex, endIndex + 1);
  const axis = eggAxis(displayedWeeks, visible, scaleMode === 'adapted');
  const plottedWeeks = displayedWeeks.map((week) => ({ ...week,
    ...Object.fromEntries(visible.map(({ key }) => [`plot_${key}`, plotEggValue(week[key], axis.compressed)])),
  }));
  const setPeriod = (next) => {
    if (next?.startIndex != null && next?.endIndex != null) setRange(next);
  };
  const toggle = (key) => setHidden((old) => old.includes(key) ? old.filter((item) => item !== key) : [...old, key]);
  const changeDemo = (scenario) => { setDemoScenario(scenario); setHidden([]); setDetails(false); setRange(null); };
  return <Box component="section" aria-label="Évolution des œufs par semaine" aria-busy={loading && !activeDemo} sx={{ mt: 3, pt: 2.5, borderTop: '1px solid', borderColor: 'divider', minWidth: 0 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography component="h3" variant="h6" fontWeight={700}>Évolution des œufs</Typography>
        {periodLabel && <Typography variant="caption" color="text.secondary">{periodLabel}</Typography>}
      </Box>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {demosEnabled && <Button size="small" variant="outlined" onClick={() => changeDemo(activeDemo ? '' : 'mixed')} sx={{ flexShrink: 0 }}>
        {activeDemo ? 'Revenir aux données du lot' : 'Voir un exemple'}
      </Button>}
      <Button size="small" variant="outlined" startIcon={<TuneRounded />} endIcon={optionsOpen ? <ExpandLessRounded /> : <ExpandMoreRounded />}
        aria-expanded={optionsOpen} onClick={() => setOptionsOpen((open) => !open)}>
        Options
      </Button>
      </Stack>
    </Stack>
    {activeDemo && <Box sx={{ mt: 2 }}>
      <Alert severity="info" sx={{ mb: 1.5 }}>
        <Typography variant="body2" fontWeight={700}>Lot fictif · Données de démonstration</Typography>
        <Typography variant="body2">Ces chiffres servent uniquement à tester le graphique.</Typography>
      </Alert>
      <TextField select fullWidth size="small" label="Exemple à visualiser" value={activeDemo} SelectProps={{ native: true }} onChange={(event) => changeDemo(event.target.value)}>
        {LOT_EGG_DEMO_SCENARIOS.map((scenario) => <option key={scenario.value} value={scenario.value}>{scenario.label}</option>)}
      </TextField>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{LOT_EGG_DEMO_SCENARIOS.find((scenario) => scenario.value === activeDemo)?.description}</Typography>
    </Box>}
    {loading && !activeDemo ? <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={26} aria-label="Chargement du graphique" /></Box>
      : error && !activeDemo ? <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" onClick={() => setRetry((old) => old + 1)}>Réessayer</Button>}>{error}</Alert>
      : !recorded ? <Typography color="text.secondary" sx={{ py: 3 }}>Aucune production enregistrée pour ce lot.</Typography>
      : <>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', my: 2 }} aria-label="Types d'œufs affichés">
          {SERIES.map(({ key, color }) => <Button key={key} size="small" variant="outlined" aria-pressed={!hidden.includes(key)} onClick={() => toggle(key)}
            sx={{ textTransform: 'none', fontWeight: 600,
              color: hidden.includes(key) ? 'text.secondary' : color,
              borderColor: hidden.includes(key) ? 'divider' : color,
              bgcolor: hidden.includes(key) ? 'transparent' : `${color}12`,
              opacity: hidden.includes(key) ? 0.6 : 1,
              '&:hover': { borderColor: color, bgcolor: `${color}20` } }}>
            {EGG_TYPE_LABELS[key]} · {number(chartData.totaux?.[key])}
          </Button>)}
        </Stack>
        {visible.length ? <>
          <Collapse in={optionsOpen} unmountOnExit>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 2, mt: 1 }}>
              <ToggleButtonGroup value={scaleMode} exclusive size="small" aria-label="Échelle du graphique"
                onChange={(_, value) => { if (value) setScaleMode(value); }}
                sx={{ '& .MuiToggleButton-root.Mui-selected': { bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } } }}>
                <ToggleButton value="adapted" sx={{ textTransform: 'none' }}>Adaptée</ToggleButton>
                <ToggleButton value="common" sx={{ textTransform: 'none' }}>Linéaire</ToggleButton>
              </ToggleButtonGroup>
              {weeks.length > 1 && <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, width: { xs: '100%', sm: 'auto' } }}>
                <TextField select size="small" label="De" value={startIndex} SelectProps={{ native: true }} sx={{ width: { xs: 'calc(50% - 12px)', sm: 112 } }}
                  onChange={(event) => setPeriod({ startIndex: Number(event.target.value), endIndex: Math.max(endIndex, Number(event.target.value)) })}>
                  {weeks.map((week, index) => <option key={week.semaine} value={index}>S. {week.semaine}</option>)}
                </TextField>
                <Typography variant="body2" color="text.secondary">à</Typography>
                <TextField select size="small" label="À" value={endIndex} SelectProps={{ native: true }} sx={{ width: { xs: 'calc(50% - 12px)', sm: 112 } }}
                  onChange={(event) => setPeriod({ startIndex: Math.min(startIndex, Number(event.target.value)), endIndex: Number(event.target.value) })}>
                  {weeks.map((week, index) => <option key={week.semaine} value={index}>S. {week.semaine}</option>)}
                </TextField>
                {range && <Button size="small" onClick={() => setRange(null)}>Tout le lot</Button>}
              </Stack>}
            </Stack>
          </Collapse>
          <Box component="figure" aria-label="Graphique des quantités d’œufs" sx={{ m: 0, minWidth: 0 }}>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {axis.compressed ? 'Échelle adaptée' : 'Échelle linéaire'} · 0–{number(axis.upper)} œufs / semaine
              </Typography>
              {axis.compressed && <MuiTooltip title="L’échelle adaptée agrandit les petits volumes. Les chiffres affichés restent exacts.">
                <IconButton size="small" aria-label="À propos de l’échelle adaptée" sx={{ p: 0.25 }}><InfoOutlined sx={{ fontSize: 16 }} /></IconButton>
              </MuiTooltip>}
            </Stack>
            <Box sx={{ width: '100%', height: { xs: 320, sm: 380 }, minWidth: 0, mt: 1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={plottedWeeks} accessibilityLayer margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="semaine" padding={{ left: 8, right: 8 }} tickFormatter={(value) => `S. ${value}`} minTickGap={24}
                    tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis width={64} domain={axis.domain} ticks={axis.ticks} minTickGap={8} interval="preserveStartEnd"
                    tickFormatter={(value) => Number(axisEggValue(value, axis.compressed)).toLocaleString('fr-FR', { notation: 'compact' })}
                    tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<WeekTooltip />} filterNull={false} />
                  {visible.map(({ key, color, dash }) => <Line key={key} type="linear" dataKey={`plot_${key}`} name={EGG_TYPE_LABELS[key]} stroke={color} strokeWidth={2.5} strokeDasharray={dash}
                    dot={{ r: displayedWeeks.length === 1 ? 6 : displayedWeeks.length > 30 ? 1.5 : 3, stroke: theme.palette.background.paper, strokeWidth: 2, fill: color }} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </Box>
            {!displayedWeeks.some((week) => week.saisies > 0) && <Typography variant="caption" color="text.secondary">Aucune saisie sur cette période.</Typography>}
          </Box>
          {weeks.length > 16 && <Box sx={{ width: '100%', height: 52, mt: 2 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeks} margin={{ top: 5, right: 12, left: 60, bottom: 5 }}>
                <Brush dataKey="semaine" height={30} stroke={theme.palette.primary.main} tickFormatter={(value) => `S. ${value}`}
                  startIndex={startIndex} endIndex={endIndex} onChange={setPeriod} travellerWidth={10} />
              </LineChart>
            </ResponsiveContainer>
          </Box>}
        </> : <Typography sx={{ py: 4 }} color="text.secondary">Sélectionnez un type d'œuf pour afficher sa courbe.</Typography>}
        {incomplete && <Typography variant="caption" color="warning.dark" sx={{ display: 'block', mt: 1 }}>
          Données incomplètes · les semaines sans saisie restent vides.
        </Typography>}
        <ExpandableDetails label="Chiffres par semaine" icon={<TableChartOutlined />} meta={`${weeks.length} semaines`}
          expanded={details} onChange={(_, next) => setDetails(next)} sx={{ mt: 2 }} contentSx={{ p: 0 }}>
          <TableContainer sx={{ maxHeight: 360 }}>
            <Table size="small" stickyHeader aria-label="Quantités d'œufs par semaine">
              <TableHead><TableRow><TableCell>Semaine / dates</TableCell>{SERIES.map(({ key }) => <TableCell key={key} align="right">{EGG_TYPE_LABELS[key]}</TableCell>)}<TableCell>Saisies</TableCell></TableRow></TableHead>
              <TableBody>{weeks.map((week) => <TableRow key={week.semaine}>
                <TableCell component="th" scope="row" sx={{ whiteSpace: 'nowrap' }}>S. {week.semaine}{week.partielle ? ' · Partielle' : ''}<Typography variant="caption" display="block">{period(week)}</Typography></TableCell>
                {SERIES.map(({ key }) => <TableCell key={key} align="right">{number(week[key])}</TableCell>)}
                <TableCell sx={{ whiteSpace: 'nowrap', color: week.incomplete ? 'warning.dark' : 'text.secondary' }}>{coverage(week)}{week.incomplete ? ' · Incomplète' : ''}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </TableContainer>
        </ExpandableDetails>
      </>}
  </Box>;
}
