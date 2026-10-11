import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Collapse, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Typography, useTheme,
} from '@mui/material';
import { Brush, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { lotProductionService } from '../../services/productionService';
import { EGG_TYPE_LABELS } from '../../utils/dailyProduction';
import { formatShortDate } from '../../utils/dateFormatting';

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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [hidden, setHidden] = useState([]);
  const [details, setDetails] = useState(false);
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

  const weeks = (data?.semaines || []).map((week) => ({ ...week, ...week.quantites }));
  const recorded = weeks.some((week) => week.saisies > 0);
  const incomplete = weeks.some((week) => week.incomplete);
  const visible = SERIES.filter((series) => !hidden.includes(series.key));
  const toggle = (key) => setHidden((old) => old.includes(key) ? old.filter((item) => item !== key) : [...old, key]);
  return <Box component="section" aria-label="Évolution des œufs par semaine" aria-busy={loading} sx={{ mt: 3, pt: 2.5, borderTop: '1px solid', borderColor: 'divider', minWidth: 0 }}>
    <Typography component="h3" variant="h6" fontWeight={700}>Évolution des œufs par semaine</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
      Quantités hebdomadaires de tous les bâtiments du lot. La semaine 1 commence à l'arrivée.
    </Typography>
    {loading ? <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={26} aria-label="Chargement du graphique" /></Box>
      : error ? <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" onClick={() => setRetry((old) => old + 1)}>Réessayer</Button>}>{error}</Alert>
      : !recorded ? <Typography color="text.secondary" sx={{ py: 3 }}>Aucune production enregistrée pour ce lot.</Typography>
      : <>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', my: 2 }} aria-label="Types d'œufs affichés">
          {SERIES.map(({ key, color }) => <Button key={key} size="small" variant="outlined" aria-pressed={!hidden.includes(key)} onClick={() => toggle(key)}
            sx={{ textTransform: 'none', color: hidden.includes(key) ? 'text.secondary' : color, borderColor: hidden.includes(key) ? 'divider' : color,
              opacity: hidden.includes(key) ? 0.65 : 1, '&:hover': { borderColor: color, bgcolor: 'action.hover' } }}>
            {EGG_TYPE_LABELS[key]} · {number(data.totaux?.[key])}
          </Button>)}
        </Stack>
        {visible.length ? <Box sx={{ width: '100%', height: { xs: 300, sm: 330 }, minWidth: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weeks} accessibilityLayer margin={{ top: 10, right: 12, left: 0, bottom: 12 }}>
              <CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="semaine" tickFormatter={(value) => `S. ${value}`} minTickGap={24} tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} width={60} domain={[0, 'auto']} tickFormatter={(value) => Number(value).toLocaleString('fr-FR', { notation: 'compact' })}
                tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip content={<WeekTooltip />} filterNull={false} />
              {visible.map(({ key, color, dash }) => <Line key={key} type="linear" dataKey={key} name={EGG_TYPE_LABELS[key]} stroke={color} strokeWidth={2.5} strokeDasharray={dash}
                dot={{ r: weeks.length > 30 ? 1.5 : 3 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />)}
              {weeks.length > 16 && <Brush dataKey="semaine" height={26} stroke={theme.palette.primary.main} tickFormatter={(value) => `S. ${value}`} travellerWidth={10} />}
            </LineChart>
          </ResponsiveContainer>
        </Box> : <Typography sx={{ py: 4 }} color="text.secondary">Sélectionnez un type d'œuf pour afficher sa courbe.</Typography>}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Totaux du lot dans la légende. Cliquez sur un type pour afficher ou masquer sa courbe.
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
