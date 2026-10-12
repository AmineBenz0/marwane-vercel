import { useEffect, useId, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Collapse, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography, useTheme,
} from '@mui/material';
import { Brush, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { lotProductionService } from '../../services/productionService';
import { EGG_TYPE_LABELS } from '../../utils/dailyProduction';
import { formatShortDate } from '../../utils/dateFormatting';
import { createLotEggDemo, LOT_EGG_DEMO_SCENARIOS } from './lotEggDemo';
import { eggAxis, groupEggSeries } from './lotEggChartScale';

const SERIES = [
  { key: 'normal', color: '#2563eb' },
  { key: 'blanc', color: '#0f766e', dash: '6 3' },
  { key: 'double_jaune', color: '#a16207', dash: '3 3' },
  { key: 'double_jaune_demarrage', color: '#7c3aed', dash: '8 3 2 3' },
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
      {payload.filter((item) => item.value != null).map((item) => <Typography key={item.dataKey} variant="body2" sx={{ color: item.color }}>
        {item.name} : <strong>{number(item.value)}</strong>
      </Typography>)}
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
  const syncId = useId();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [hidden, setHidden] = useState([]);
  const [details, setDetails] = useState(false);
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

  const chartData = demoScenario ? createLotEggDemo(demoScenario) : data;
  const weeks = (chartData?.semaines || []).map((week) => ({ ...week, ...week.quantites }));
  const recorded = weeks.some((week) => week.saisies > 0);
  const incomplete = weeks.some((week) => week.incomplete);
  const visible = SERIES.filter((series) => !hidden.includes(series.key));
  const startIndex = Math.min(range?.startIndex ?? 0, Math.max(0, weeks.length - 1));
  const endIndex = Math.max(startIndex, Math.min(range?.endIndex ?? weeks.length - 1, weeks.length - 1));
  const displayedWeeks = weeks.slice(startIndex, endIndex + 1);
  const groups = groupEggSeries(weeks, visible, scaleMode === 'common');
  const setPeriod = (next) => {
    if (next?.startIndex != null && next?.endIndex != null) setRange(next);
  };
  const toggle = (key) => setHidden((old) => old.includes(key) ? old.filter((item) => item !== key) : [...old, key]);
  const changeDemo = (scenario) => { setDemoScenario(scenario); setHidden([]); setDetails(false); setRange(null); };
  return <Box component="section" aria-label="Évolution des œufs par semaine" aria-busy={loading && !demoScenario} sx={{ mt: 3, pt: 2.5, borderTop: '1px solid', borderColor: 'divider', minWidth: 0 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
    <Typography component="h3" variant="h6" fontWeight={700}>Évolution des œufs par semaine</Typography>
      <Button size="small" onClick={() => changeDemo(demoScenario ? '' : 'mixed')} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, flexShrink: 0 }}>
        {demoScenario ? 'Revenir aux données du lot' : 'Voir un exemple'}
      </Button>
    </Stack>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
      Quantités hebdomadaires de tous les bâtiments du lot. La semaine 1 commence à l'arrivée.
    </Typography>
    {demoScenario && <Box sx={{ mt: 2 }}>
      <Alert severity="info" sx={{ mb: 1.5 }}>
        <Typography variant="body2" fontWeight={700}>Lot fictif · Données de démonstration</Typography>
        <Typography variant="body2">Ces chiffres servent uniquement à tester le graphique.</Typography>
      </Alert>
      <TextField select fullWidth size="small" label="Exemple à visualiser" value={demoScenario} SelectProps={{ native: true }} onChange={(event) => changeDemo(event.target.value)}>
        {LOT_EGG_DEMO_SCENARIOS.map((scenario) => <option key={scenario.value} value={scenario.value}>{scenario.label}</option>)}
      </TextField>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{LOT_EGG_DEMO_SCENARIOS.find((scenario) => scenario.value === demoScenario)?.description}</Typography>
    </Box>}
    {loading && !demoScenario ? <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={26} aria-label="Chargement du graphique" /></Box>
      : error && !demoScenario ? <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" onClick={() => setRetry((old) => old + 1)}>Réessayer</Button>}>{error}</Alert>
      : !recorded ? <Typography color="text.secondary" sx={{ py: 3 }}>Aucune production enregistrée pour ce lot.</Typography>
      : <>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', my: 2 }} aria-label="Types d'œufs affichés">
          {SERIES.map(({ key, color }) => <Button key={key} size="small" variant="outlined" aria-pressed={!hidden.includes(key)} onClick={() => toggle(key)}
            sx={{ textTransform: 'none', color: hidden.includes(key) ? 'text.secondary' : color, borderColor: hidden.includes(key) ? 'divider' : color,
              opacity: hidden.includes(key) ? 0.65 : 1, '&:hover': { borderColor: color, bgcolor: 'action.hover' } }}>
            {EGG_TYPE_LABELS[key]} · {number(chartData.totaux?.[key])}
          </Button>)}
        </Stack>
        {visible.length ? <>
          <ToggleButtonGroup value={scaleMode} exclusive size="small" aria-label="Échelle des graphiques"
            onChange={(_, value) => { if (value) setScaleMode(value); }} sx={{ mb: 1 }}>
            <ToggleButton value="adapted" sx={{ textTransform: 'none' }}>Échelles adaptées</ToggleButton>
            <ToggleButton value="common" sx={{ textTransform: 'none' }}>Échelle commune</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            {scaleMode === 'adapted'
              ? 'Les volumes proches partagent une échelle. Utilisez « Échelle commune » pour comparer les quantités entre toutes les courbes.'
              : 'Toutes les courbes partagent la même échelle pour comparer leurs volumes.'}
          </Typography>
          {weeks.length > 1 && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
            <TextField select size="small" label="De la semaine" value={startIndex} SelectProps={{ native: true }} sx={{ width: { xs: '100%', sm: 160 } }}
              onChange={(event) => setPeriod({ startIndex: Number(event.target.value), endIndex: Math.max(endIndex, Number(event.target.value)) })}>
              {weeks.map((week, index) => <option key={week.semaine} value={index}>S. {week.semaine}</option>)}
            </TextField>
            <TextField select size="small" label="À la semaine" value={endIndex} SelectProps={{ native: true }} sx={{ width: { xs: '100%', sm: 160 } }}
              onChange={(event) => setPeriod({ startIndex: Math.min(startIndex, Number(event.target.value)), endIndex: Number(event.target.value) })}>
              {weeks.map((week, index) => <option key={week.semaine} value={index}>S. {week.semaine}</option>)}
            </TextField>
            {range && <Button size="small" onClick={() => setRange(null)}>Tout le lot</Button>}
          </Stack>}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: groups.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr' }, gap: 2 }}>
            {groups.map((series, index) => {
              const axis = eggAxis(displayedWeeks, series);
              const title = series.map(({ key }) => EGG_TYPE_LABELS[key]).join(' · ');
              const hasEntries = displayedWeeks.some((week) => week.saisies > 0);
              return <Box component="figure" aria-label={`Graphique : ${title}`} key={series.map(({ key }) => key).join('-')}
                sx={{ m: 0, p: { xs: 1.5, sm: 2 }, border: '1px solid', borderColor: 'divider', borderRadius: 2.5, minWidth: 0,
                  gridColumn: index === 0 && groups.length % 2 === 1 ? '1 / -1' : 'auto' }}>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                  {series.map(({ key, color }) => <Typography key={key} component="span" variant="body2" fontWeight={700} sx={{ color }}>{EGG_TYPE_LABELS[key]}</Typography>)}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Échelle : 0 – {number(axis.domain[1])} œufs / semaine
                </Typography>
                <Box sx={{ width: '100%', height: groups.length === 1 ? { xs: 280, sm: 310 } : 220, minWidth: 0, mt: 1 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={displayedWeeks} syncId={syncId} syncMethod="value" accessibilityLayer margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="semaine" padding={{ left: 8, right: 8 }} tickFormatter={(value) => `S. ${value}`} minTickGap={24}
                        tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} width={60} domain={axis.domain} ticks={axis.ticks}
                        tickFormatter={(value) => Number(value).toLocaleString('fr-FR', { notation: 'compact' })}
                        tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<WeekTooltip />} filterNull={false} />
                      {series.map(({ key, color, dash }) => <Line key={key} type="linear" dataKey={key} name={EGG_TYPE_LABELS[key]} stroke={color} strokeWidth={2.5} strokeDasharray={dash}
                        dot={{ r: displayedWeeks.length > 30 ? 1.5 : 3 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
                {!hasEntries && <Typography variant="caption" color="text.secondary">Aucune saisie sur cette période.</Typography>}
              </Box>;
            })}
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
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Totaux {demoScenario ? "de l'exemple" : 'du lot'} dans la légende. Cliquez sur un type pour afficher ou masquer sa courbe.
          {' Chaque échelle part de zéro et s’adapte aux quantités de la période sélectionnée.'}
          {weeks.length > 16 ? ' Utilisez les poignées sous le graphique pour agrandir une période.' : ''}
        </Typography>
        {incomplete && <Typography variant="caption" color="warning.dark" sx={{ display: 'block', mt: 0.5 }}>
          Certaines semaines sont incomplètes. Les semaines sans saisie apparaissent comme des interruptions, pas comme des zéros.
        </Typography>}
        <Button size="small" onClick={() => setDetails((old) => !old)} aria-expanded={details} sx={{ mt: 1 }}>
          {details ? 'Masquer les chiffres' : 'Voir les chiffres par semaine'}
        </Button>
        <Collapse in={details} unmountOnExit>
          <TableContainer sx={{ mt: 1, maxHeight: 360 }}>
            <Table size="small" stickyHeader aria-label="Quantités d'œufs par semaine">
              <TableHead><TableRow><TableCell>Semaine / dates</TableCell>{SERIES.map(({ key }) => <TableCell key={key} align="right">{EGG_TYPE_LABELS[key]}</TableCell>)}<TableCell>Saisies</TableCell></TableRow></TableHead>
              <TableBody>{weeks.map((week) => <TableRow key={week.semaine}>
                <TableCell component="th" scope="row" sx={{ whiteSpace: 'nowrap' }}>S. {week.semaine}{week.partielle ? ' · Partielle' : ''}<Typography variant="caption" display="block">{period(week)}</Typography></TableCell>
                {SERIES.map(({ key }) => <TableCell key={key} align="right">{number(week[key])}</TableCell>)}
                <TableCell sx={{ whiteSpace: 'nowrap', color: week.incomplete ? 'warning.dark' : 'text.secondary' }}>{coverage(week)}{week.incomplete ? ' · Incomplète' : ''}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </TableContainer>
        </Collapse>
      </>}
  </Box>;
}
