import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, Menu, MenuItem, Paper, Popover, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tab, Tabs, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { get } from '../../services/api';
import { cycleProductionService, productionService } from '../../services/productionService';
import { exportOverview } from './globalOverviewExport';
import { DEMO_LOTS, buildDemoDays } from './globalOverviewDemo';

const COLUMN_GROUPS = [
  { key: 'effectif', label: 'Effectif & mortalité', fill: ['#eaf0fc', '#283958'], edge: ['#b8c8ec', '#536d9d'] },
  { key: 'eggs', label: 'Œufs & ponte', fill: ['#e9f5ee', '#223e35'], edge: ['#b8d7c4', '#527d66'] },
  { key: 'feed', label: 'Alimentation', fill: ['#fff3de', '#463a23'], edge: ['#e3cea2', '#937644'] },
  { key: 'charge', label: 'Charges', fill: ['#f2edfb', '#392e4d'], edge: ['#cfbfe7', '#806598'] },
  { key: 'sale', label: 'Ventes & rentabilité', fill: ['#e7f3f5', '#263e47'], edge: ['#b7d5dc', '#507c89'] },
];
const COLUMN_PRESETS = {
  register: ['mort', 'mort_pct', 'oeufs', 'oeufs_cum', 'ponte_pct', 'poidsOeuf', 'formule', 'aliment_kg', 'prix_aliment', 'g_poule', 'g_oeuf', 'autres', 'autresQuantite', 'autresPrix', 'labor', 'salary', 'electricity', 'cost', 'totalDepenses', 'sales', 'prixOeuf'],
  summary: ['birds', 'mort', 'mort_pct', 'oeufs', 'ponte_pct', 'aliment_kg', 'cost', 'sales', 'margin'],
  production: ['birds', 'mort', 'mort_pct', 'cumDead', 'cumDeadRate', 'normal', 'double', 'white', 'broken', 'lost', 'oeufs', 'oeufs_cum', 'cumEggs', 'ponte_pct', 'poidsOeuf', 'eggMass', 'formule', 'aliment_kg', 'prix_aliment', 'g_poule', 'g_oeuf', 'fcr'],
  costs: ['formule', 'aliment_kg', 'prix_aliment', 'feedcost', 'autres', 'autresQuantite', 'autresPrix', 'labor', 'salary', 'electricity', 'cost', 'totalDepenses', 'sold', 'sales', 'prixOeuf', 'costPerEgg', 'margin'],
};
const groupColor = (theme, key, token = 'fill') => COLUMN_GROUPS.find((group) => group.key === key)[token][theme.palette.mode === 'dark' ? 1 : 0];

const LABEL_WIDTH = 176;
const TEXT_WIDTH = 240;
const stickyLabelSx = {
  position: 'sticky', left: 0,
  width: 'var(--date-width)', minWidth: 'var(--date-width)', maxWidth: 'var(--date-width)',
  overflow: 'hidden', bgcolor: 'background.paper',
};
const wrappedTextSx = {
  display: 'block', whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.4,
};
const renderColumnValue = (column, row, onExpand) => {
  const value = column.value(row);
  if (!['formule', 'autres'].includes(column.key)) return value;
  const text = String(value ?? '—');
  return <Box sx={{ width: TEXT_WIDTH, minHeight: 32 }}>
    <Box component="span" sx={{ ...wrappedTextSx, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{text}</Box>
    {text.length > 55 && <Button size="small" onClick={() => onExpand({ title: column.label, value: text, date: row.date })} aria-label={'Lire ' + column.label + ' · ' + row.date} sx={{ p: 0, minWidth: 0, minHeight: 20, fontSize: 12, lineHeight: 1.4 }}>Lire la suite</Button>}
  </Box>;
};
const renderRowLabel = (row) => {
  if (row.rowType === 'summary' && row._weekKey && row.date.startsWith('Total semaine')) return <Box sx={wrappedTextSx}>
    <Box component="span" sx={{ display: 'block' }}>Total semaine</Box>
    <Box component="span" sx={{ display: 'block', fontSize: 11, fontWeight: 500, mt: 0.25 }}>
      {dateLabel(row._weekKey).slice(6) === dateLabel(weekEnd(row._weekKey)).slice(6) ? dateLabel(row._weekKey).slice(0, 5) + ' – ' + dateLabel(weekEnd(row._weekKey)).slice(0, 5) + ' · ' + dateLabel(row._weekKey).slice(6) : dateLabel(row._weekKey) + ' – ' + dateLabel(weekEnd(row._weekKey))}
    </Box>
  </Box>;
  const [title, ...subtitle] = String(row.date).split(' · ');
  return <Box sx={wrappedTextSx}>{title}{subtitle.length > 0 && <Box component="span" sx={{ display: 'block', fontSize: 11, fontWeight: 500 }}>{subtitle.join(' · ')}</Box>}</Box>;
};

const fmt = (value, digits = 0) => value == null || value === '' || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('fr-FR', { maximumFractionDigits: digits });
const fmtDh = (value, digits = 2) => value == null || !Number.isFinite(Number(value)) ? '—' : fmt(value, digits) + ' DH';
const isValidIsoDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const dateAtNoon = (value) => isValidIsoDate(value) ? new Date(value + 'T12:00:00') : null;
const isoDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  const dateOnly = date.toISOString().slice(0, 10);
  return isValidIsoDate(dateOnly) ? dateOnly : '';
};
const dateFromDisplay = (value) => {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const date = match[3] + '-' + match[2] + '-' + match[1];
  return isValidIsoDate(date) ? date : '';
};
const parseRowDate = (row) => dateFromDisplay(row.date);
const weekStart = (value) => {
  const date = dateAtNoon(value);
  if (!date) return '';
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};
const weekEnd = (value) => {
  const date = dateAtNoon(value);
  if (!date) return '';
  date.setDate(date.getDate() + 6);
  return date.toISOString().slice(0, 10);
};
const dateLabel = (value) => dateAtNoon(value)?.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) || '—';
const weekLabel = (value) => dateLabel(value) + ' – ' + dateLabel(weekEnd(value));
const isMatch = (value, pattern) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replaceAll('œ', 'oe').includes(pattern);
const chargeBucket = (charge) => {
  const text = [charge.libelle, charge.categorie].filter(Boolean).join(' ').toLowerCase().replace(/[-']/g, ' ');
  if (charge.source_journaliere || charge.id_vaccin || isMatch(text, 'vaccin')) return 'vaccine';
  if (isMatch(text, 'main d oeuvre') || isMatch(text, 'main oeuvre') || isMatch(text, 'cnss')) return 'labor';
  if (isMatch(text, 'salaire')) return 'salary';
  if (isMatch(text, 'electricite') || isMatch(text, 'electric')) return 'electricity';
  return 'other';
};
const loadPages = async (path, params = {}) => {
  const items = [];
  for (let skip = 0; skip < 50000; skip += 500) {
    const page = await get(path, { params: { ...params, skip, limit: 500 } });
    items.push(...(page || []));
    if (!page || page.length < 500) break;
  }
  return items;
};
const parseMoney = (charge) => Number(charge.montant || 0);
const lotKey = (cycle) => String(cycle.id_lot || 'cycle-' + cycle.id_cycle);
const groupCycles = (cycles) => {
  const grouped = new Map();
  cycles.forEach((cycle) => {
    const key = lotKey(cycle);
    if (!grouped.has(key)) grouped.set(key, { key, cycles: [] });
    grouped.get(key).cycles.push(cycle);
  });
  return [...grouped.values()].map((group) => ({ ...group, cycle: group.cycles[0] }));
};

function aggregateDays(dayRows, label, rowType = 'summary') {
  if (!dayRows.length) return null;
  const sum = (key) => dayRows.reduce((total, row) => total + Number(row[key] || 0), 0);
  const eggs = sum('oeufs');
  const deaths = sum('mort');
  const birdDays = sum('effectif_debut');
  const feed = sum('aliment_kg');
  const cost = dayRows.every((row) => row._dailyTotal != null) ? sum('_dailyTotal') : null;
  const sales = sum('_dailySales');
  const sold = sum('_dailySold');
  const hasWeights = dayRows.every((row) => !Number(row.oeufs) || row.eggMass != null);
  const last = dayRows[dayRows.length - 1];
  const formulas = [...new Set(dayRows.map((row) => row.formule).filter((value) => value && value !== '—' && value !== '-'))];
  const otherItems = dayRows.flatMap((row) => row._otherItems || []);
  const totalOther = otherItems.reduce((total, item) => total + Number(item.amount || 0), 0);
  const typeSummary = ['normal', 'double', 'white', 'broken', 'lost'].reduce((result, key) => {
    result[key] = sum(key);
    return result;
  }, {});
  return {
    ...last,
    ...typeSummary,
    id: rowType + '-' + dayRows[0].dateIso + '-' + label,
    rowType,
    _weekSpan: new Set(dayRows.map((row) => row._weekKey)).size,
    date: label,
    mort: deaths,
    mort_pct: birdDays ? (deaths / birdDays * 100).toFixed(2) : null,
    oeufs: eggs,
    oeufs_cum: last.oeufs_cum,
    weekCumEggs: sum('oeufs'),
    ponte_pct: birdDays ? (eggs / birdDays * 100).toFixed(2) : null,
    formule: formulas.join(', ') || '—',
    aliment_kg: feed,
    prix_aliment: feed && cost != null ? sum('_feedCost') / feed : null,
    g_poule: birdDays ? (feed * 1000 / birdDays).toFixed(1) : null,
    g_oeuf: eggs ? (feed * 1000 / eggs).toFixed(1) : null,
    poidsOeuf: eggs && hasWeights ? dayRows.reduce((total, row) => total + Number(row.poidsOeuf || 0) * Number(row.oeufs || 0), 0) / eggs : null,
    autres: fmtDh(totalOther),
    autresQuantite: otherItems.length ? otherItems.reduce((total, item) => total + Number(item.quantity || 0), 0) : null,
    autresPrix: sum('autresQuantite') > 0 ? totalOther / sum('autresQuantite') : null,
    _labor: sum('_labor'),
    _salary: sum('_salary'),
    _electricity: sum('_electricity'),
    _feedCost: cost == null ? null : sum('_feedCost'),
    _dailyTotal: cost,
    depensesSemaine: cost,
    totalDepenses: last.totalDepenses,
    ventesSemaine: sales,
    _sales: sales,
    _sold: sold,
    prixOeuf: sold ? sales / sold : null,
    birds: last.effectif_fin,
    cumDead: last.cumDead,
    cumDeadRate: last.cumDeadRate,
    cumEggs: last.cumEggs,
    eggMass: eggs && hasWeights ? dayRows.reduce((total, row) => total + Number(row.poidsOeuf || 0) * Number(row.oeufs || 0), 0) / 1000 : null,
    fcr: hasWeights && sum('eggMass') > 0 ? feed / sum('eggMass') : null,
    cost: cost,
    feedcost: cost == null ? null : sum('_feedCost'),
    costPerEgg: eggs && cost != null ? cost / eggs : null,
    sold,
    sales,
    margin: cost == null ? null : sales - cost,
    weeklyEggPrice: sold ? sales / sold : null,
    expected: dayRows.reduce((total, row) => total + Number(row._expectedBuildings || 0), 0),
  };
}

function aggregateDemoDays(dayRows, label, rowType = 'summary') {
  const row = aggregateDays(dayRows, label, rowType);
  if (!row) return null;
  const sum = (key) => dayRows.reduce((total, day) => total + Number(day[key] || 0), 0);
  const cost = sum('_dailyTotal');
  const sales = sum('_dailySales');
  const sold = sum('_dailySold');
  return {
    ...row, id: 'demo-' + rowType + '-' + dayRows[0].dateIso + '-' + label,
    cost, _dailyTotal: cost, depensesSemaine: cost, costPerEgg: row.oeufs ? cost / row.oeufs : null,
    sales, _sales: sales, ventesSemaine: sales, sold, _sold: sold, margin: cost == null ? null : sales - cost,
    prixOeuf: sold ? sales / sold : null, weeklyEggPrice: sold ? sales / sold : null,
    fcr: row.eggMass ? row.aliment_kg / row.eggMass : null,
  };
}

function GlobalOverviewPage() {
  const demosEnabled = ['preview', 'development'].includes(import.meta.env.VITE_DEPLOYMENT_ENV);
  const loadVersion = useRef(0);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [textDetail, setTextDetail] = useState(null);
  const [cycles, setCycles] = useState([]);
  const [lotId, setLotId] = useState('');
  const [buildingId, setBuildingId] = useState('all');
  const [period, setPeriod] = useState('latest');
  const [groupBy, setGroupBy] = useState('day');
  const [view, setView] = useState(() => isMobile ? 'summary' : 'register');
  const [customColumns, setCustomColumns] = useState(null);
  const [columnAnchor, setColumnAnchor] = useState(null);
  const tableRef = useRef(null);
  const groupRefs = useRef({});
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showExample, setShowExample] = useState(false);
  const [demoLot, setDemoLot] = useState('active');
  const [demoBuilding, setDemoBuilding] = useState('all');
  const [exportAnchor, setExportAnchor] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [detailId, setDetailId] = useState('');

  const lots = useMemo(() => groupCycles(cycles), [cycles]);
  const selectedLot = lots.find((group) => group.key === String(lotId)) || lots[0];
  const selectedCycles = selectedLot?.cycles || [];

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setData(null);
    setError('');
    try {
      const cycleRows = await cycleProductionService.getCycles({ skip: 0, limit: 500 });
      const normalized = (cycleRows || []).filter((row) => row.id_cycle).sort((a, b) => String(b.date_debut || '').localeCompare(String(a.date_debut || '')));
      if (version !== loadVersion.current) return;
      setCycles(normalized);
      const groups = groupCycles(normalized);
      const selected = groups.find((group) => group.key === String(lotId)) || groups[0];
      if (!selected) {
        setData(null);
        setLoading(false);
        return;
      }
      if (selected.key !== lotId) { setLotId(selected.key); return; }
      const cycleIds = selected.cycles.map((cycle) => Number(cycle.id_cycle));
      const startDate = selected.cycles.map((cycle) => isoDate(cycle.date_debut)).sort()[0];
      const endDate = selected.cycles.map((cycle) => isoDate(cycle.date_fin_reelle) || new Date().toISOString().slice(0, 10)).sort().at(-1);
      const [performances, charges, transactions, promiseTransactions, products] = await Promise.all([
        Promise.all(selected.cycles.map((cycle) => productionService.getPerformance(cycle.id_cycle))),
        loadPages('/charges', { date_debut: startDate, date_fin: endDate }),
        loadPages('/transactions', { date_debut: startDate, date_fin: endDate, est_actif: true }),
        loadPages('/transactions', { est_promesse: true, est_actif: true }),
        loadPages('/produits'),
      ]);
      const buildingIds = selected.cycles.map((cycle) => Number(cycle.id_batiment));
      const relevantCharges = (charges || []).filter((charge) => {
        if (!charge.id_cycle && !charge.id_batiment) return true;
        return charge.id_cycle ? cycleIds.includes(Number(charge.id_cycle)) : buildingIds.includes(Number(charge.id_batiment));
      });
      const rows = performances.flatMap((performance, index) => (performance.rows || [])
        .filter((row) => row.rowType === 'day')
        .map((row) => ({ ...row, id_cycle: selected.cycles[index].id_cycle, id_batiment: selected.cycles[index].id_batiment, nom_batiment: selected.cycles[index].nom_batiment })));
      if (version !== loadVersion.current) return;
      setData({
        cycle: performances[0]?.cycle || selected.cycle,
        cycles: selected.cycles,
        rows,
        charges: relevantCharges,
        transactions: [
          ...(transactions || []),
          ...(promiseTransactions || []).filter((promise) => promise.id_transaction != null
            && !(transactions || []).some((transaction) => transaction.id_transaction === promise.id_transaction)),
        ],
        products: products || [],
      });
    } catch (err) {
      if (version !== loadVersion.current) return;
      setError(err?.message || 'Impossible de charger le registre de production.');
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [lotId]);

  useEffect(() => { load(); return () => { loadVersion.current += 1; }; }, [load]);

  const columns = useMemo(() => [
    { key: 'birds', label: 'Effectif restant', unit: 'poules', group: 'effectif', value: (r) => fmt(r.birds) },
    { key: 'mort', label: 'Mortalité', unit: 'poules', group: 'effectif', value: (r) => fmt(r.mort) },
    { key: 'mort_pct', label: 'Mortalité', unit: '% / jour', group: 'effectif', value: (r) => fmt(r.mort_pct, 2) },
    { key: 'cumDead', label: 'Mortalité cumulée', unit: 'lot', group: 'effectif', value: (r) => fmt(r.cumDead) },
    { key: 'cumDeadRate', label: 'Mortalité cumulée', unit: '% du lot', group: 'effectif', value: (r) => fmt(r.cumDeadRate, 2) },
    { key: 'normal', label: 'Normaux', unit: 'œufs', group: 'eggs', value: (r) => fmt(r.normal) },
    { key: 'double', label: 'Doubles jaunes', unit: 'œufs', group: 'eggs', value: (r) => fmt(r.double) },
    { key: 'white', label: 'Blancs', unit: 'œufs', group: 'eggs', value: (r) => fmt(r.white) },
    { key: 'broken', label: 'Cassés', unit: 'œufs', group: 'eggs', value: (r) => fmt(r.broken) },
    { key: 'lost', label: 'Perdus', unit: 'œufs', group: 'eggs', value: (r) => fmt(r.lost) },
    { key: 'oeufs', label: 'Œufs collectés', unit: 'œufs', group: 'eggs', value: (r) => fmt(r.oeufs) },
    { key: 'oeufs_cum', label: 'Œufs cumulés', unit: 'semaine', group: 'eggs', value: (r) => r._weekSpan > 1 ? '—' : fmt(r.oeufs_cum) },
    { key: 'cumEggs', label: 'Œufs cumulés', unit: 'lot', group: 'eggs', value: (r) => fmt(r.cumEggs) },
    { key: 'ponte_pct', label: 'Taux de ponte', unit: '%', group: 'eggs', value: (r) => fmt(r.ponte_pct, 2) },
    { key: 'poidsOeuf', label: 'Poids moyen', unit: 'g / œuf', group: 'eggs', value: (r) => fmt(r.poidsOeuf, 1) },
    { key: 'eggMass', label: 'Masse des œufs', unit: 'kg', group: 'eggs', value: (r) => fmt(r.eggMass, 2) },
    { key: 'formule', label: 'Formule', group: 'feed', value: (r) => r.formule },
    { key: 'aliment_kg', label: 'Quantité aliment', unit: 'kg', group: 'feed', value: (r) => fmt(r.aliment_kg, 1) },
    { key: 'prix_aliment', label: 'Prix aliment', unit: 'DH / kg', group: 'feed', value: (r) => fmt(r.prix_aliment, 3) },
    { key: 'g_poule', label: 'Consommation', unit: 'g / poule', group: 'feed', value: (r) => fmt(r.g_poule, 1) },
    { key: 'g_oeuf', label: 'Consommation', unit: 'g / œuf', group: 'feed', value: (r) => fmt(r.g_oeuf, 1) },
    { key: 'fcr', label: 'Indice alimentaire', unit: 'kg / kg d’œufs', group: 'feed', value: (r) => fmt(r.fcr, 3) },
    { key: 'feedcost', label: 'Coût aliment', unit: 'DH', group: 'feed', value: (r) => fmt(r._feedCost, 2) },
    { key: 'autres', label: 'Autres dépenses', group: 'charge', value: (r) => r.autres || '—' },
    { key: 'autresQuantite', label: 'Quantité', unit: 'autres dépenses', group: 'charge', value: (r) => fmt(r.autresQuantite, 2) },
    { key: 'autresPrix', label: 'Prix unitaire', unit: 'DH / unité', group: 'charge', value: (r) => fmt(r.autresPrix, 2) },
    { key: 'labor', label: 'Main-d’œuvre + CNSS', unit: 'DH', group: 'charge', value: (r) => fmt(r._labor, 2) },
    { key: 'salary', label: 'Salaires', unit: 'DH', group: 'charge', value: (r) => fmt(r._salary, 2) },
    { key: 'electricity', label: 'Électricité', unit: 'DH', group: 'charge', value: (r) => fmt(r._electricity, 2) },
    { key: 'cost', label: 'Dépenses', unit: 'DH', group: 'charge', value: (r) => fmt(r.cost, 2) },
    { key: 'totalDepenses', label: 'Dépenses cumulées', unit: 'lot · DH', group: 'charge', value: (r) => fmt(r.totalDepenses, 2) },
    { key: 'sold', label: 'Œufs vendus', unit: 'œufs', group: 'sale', value: (r) => fmt(r.sold) },
    { key: 'sales', label: 'Ventes facturées', unit: 'DH', group: 'sale', value: (r) => fmt(r.sales, 2) },
    { key: 'prixOeuf', label: 'Prix moyen de vente', unit: 'DH / œuf', group: 'sale', value: (r) => fmt(r.prixOeuf, 3) },
    { key: 'costPerEgg', label: 'Coût / œuf produit', unit: 'DH / œuf', group: 'sale', value: (r) => fmt(r.costPerEgg, 3) },
    { key: 'margin', label: 'Marge estimée', unit: 'DH', group: 'sale', value: (r) => fmt(r.margin, 2) },
  ], []);

  const dailyRows = useMemo(() => {
    if (!data) return [];
    const allowedCycles = data.cycles.filter((cycle) => buildingId === 'all' || Number(cycle.id_batiment) === Number(buildingId));
    const allowedCycleIds = allowedCycles.map((cycle) => Number(cycle.id_cycle));
    const buildingIds = allowedCycles.map((cycle) => Number(cycle.id_batiment));
    const sourceRows = data.rows.filter((row) => allowedCycleIds.includes(Number(row.id_cycle)));
    const groupedByDate = new Map();
    sourceRows.forEach((row) => {
      const dateIso = parseRowDate(row);
      if (!dateIso) return;
      const list = groupedByDate.get(dateIso) || [];
      list.push(row);
      groupedByDate.set(dateIso, list);
    });
    const chargesByDate = new Map();
    const chargesByWeek = new Map();
    const filteredCharges = data.charges.filter((charge) => {
      if (buildingId === 'all') return true;
      return charge.id_cycle ? allowedCycleIds.includes(Number(charge.id_cycle)) : !charge.id_batiment || Number(charge.id_batiment) === Number(buildingId);
    });
    filteredCharges.forEach((charge) => {
      const date = isoDate(charge.date_charge);
      if (!date || charge.statut === 'annule') return;
      const bucket = chargeBucket(charge);
      const amount = parseMoney(charge);
      const byDate = chargesByDate.get(date) || [];
      byDate.push({ ...charge, _bucket: bucket });
      chargesByDate.set(date, byDate);
      const key = weekStart(date);
      const week = chargesByWeek.get(key) || { total: 0, other: 0, vaccine: 0, labor: 0, salary: 0, electricity: 0 };
      week.total += amount;
      week[bucket] += amount;
      chargesByWeek.set(key, week);
    });
    const productsById = new Map(data.products.map((product) => [Number(product.id_produit), product]));
    const cycleIds = new Set(allowedCycleIds);
    const buildingSet = new Set(buildingIds);
    const relevantTransactions = data.transactions.flatMap(transaction => {
      if (!transaction.repartition_stock?.length) return [transaction];
      const quantity = transaction.repartition_stock.filter(a => cycleIds.has(Number(a.id_cycle))).reduce((sum, a) => sum + Number(a.quantite_livree ?? a.quantite), 0);
      return quantity ? [{ ...transaction, id_cycle: null, quantite: quantity, montant_total: Number(transaction.montant_total) * quantity / transaction.quantite }] : [];
    }).filter((transaction) => {
      if (transaction.est_actif === false) return false;
      const hasOwner = transaction.id_cycle || transaction.id_batiment;
      if (!hasOwner) return true;
      return transaction.id_cycle ? cycleIds.has(Number(transaction.id_cycle)) : buildingSet.has(Number(transaction.id_batiment));
    });
    const salesByDate = new Map();
    const feedPurchasesByWeek = new Map();
    relevantTransactions.forEach((transaction) => {
      const date = isoDate(transaction.date_transaction);
      if (!date) return;
      const product = productsById.get(Number(transaction.id_produit));
      const name = product?.nom_produit || '';
      const key = weekStart(date);
      if (transaction.id_client && isMatch(name, 'oeuf')) {
        const group = salesByDate.get(date) || { value: 0, quantity: 0 };
        group.value += Number(transaction.montant_total || 0);
        group.quantity += Number(transaction.quantite || 0);
        salesByDate.set(date, group);
      }
      if (transaction.id_fournisseur && (isMatch(name, 'aliment') || isMatch(name, 'feed'))) {
        const group = feedPurchasesByWeek.get(key) || { quantity: 0, amount: 0 };
        group.quantity += Number(transaction.quantite || 0);
        group.amount += Number(transaction.montant_total || 0);
        feedPurchasesByWeek.set(key, group);
      }
    });
    // Financial entries remain visible even if production was not entered that day.
    [...chargesByDate.keys(), ...salesByDate.keys()].forEach((date) => {
      if (!groupedByDate.has(date)) groupedByDate.set(date, []);
    });
    let cumulativeEggs = 0;
    let cumulativeMort = 0;
    let cumulativeSpend = 0;

    const remainingByCycle = new Map(allowedCycles.map((cycle) => [Number(cycle.id_cycle), Number(cycle.effectif_initial || 0)]));
    const weeklyEggs = new Map();
    const initial = allowedCycles.reduce((total, cycle) => total + Number(cycle.effectif_initial || 0), 0);
    return [...groupedByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dateIso, dayRows]) => {
      const key = weekStart(dateIso);

      const sum = (prop) => dayRows.reduce((total, row) => total + Number(row[prop] || 0), 0);
      const eggs = sum('oeufs');
      const deaths = sum('mort');
      const feed = sum('aliment_kg');
      const opening = sum('effectif_debut');
      dayRows.forEach((row) => remainingByCycle.set(Number(row.id_cycle), Number(row.effectif_fin)));
      const remaining = [...remainingByCycle.values()].reduce((total, birds) => total + birds, 0);
      weeklyEggs.set(key, (weeklyEggs.get(key) || 0) + eggs);
      const hasWeight = eggs > 0 && dayRows.every((row) => !Number(row.oeufs) || (Number.isFinite(Number(row.poids_oeuf)) && Number(row.poids_oeuf) > 0));
      const weightSum = hasWeight ? dayRows.reduce((total, row) => total + Number(row.poids_oeuf || 0) * Number(row.oeufs || 0), 0) : 0;
      const weight = hasWeight ? weightSum / eggs : null;
      cumulativeEggs += eggs;
      cumulativeMort += deaths;
      const charges = chargesByDate.get(dateIso) || [];
      const weekCharges = chargesByWeek.get(key) || { total: 0, other: 0, vaccine: 0, labor: 0, salary: 0, electricity: 0 };
      const feedPurchase = feedPurchasesByWeek.get(key);
      const feedPrice = feedPurchase?.quantity ? feedPurchase.amount / feedPurchase.quantity : null;
      const feedCost = feed === 0 ? 0 : feedPrice == null ? null : feed * feedPrice;
      const dailyCharges = charges.reduce((total, charge) => total + parseMoney(charge), 0);
      const dailyTotal = feedCost == null ? null : dailyCharges + feedCost;
      cumulativeSpend = cumulativeSpend == null || dailyTotal == null ? null : cumulativeSpend + dailyTotal;
      const otherLines = charges.filter((charge) => ['other', 'vaccine'].includes(charge._bucket));
      const typeCounts = { normal: sum('normal'), double: sum('double'), white: sum('white'), broken: sum('broken'), lost: sum('lost') };
      const otherItems = otherLines.map((charge) => ({
        label: charge.libelle,
        quantity: Number(charge.quantite ?? 1),
        amount: parseMoney(charge),
        price: Number(charge.prix_unitaire ?? charge.montant ?? 0),
      }));
      const otherText = otherItems.map((item) => item.label + ': ' + fmt(item.quantity, 2) + ' × ' + fmtDh(item.price)).join(' · ');
      const sales = salesByDate.get(dateIso) || { value: 0, quantity: 0 };
      const percent = opening ? deaths / opening * 100 : null;
      const result = {
        id: 'day-' + dateIso,
        rowType: 'day',
        date: dateLabel(dateIso),
        dateIso,
        _weekKey: key,
        _expectedBuildings: allowedCycles.length,
        mort: dayRows.length ? deaths : null,
        mort_pct: percent == null ? null : percent.toFixed(2),
        oeufs: dayRows.length ? eggs : null,
        oeufs_cum: weeklyEggs.get(key),
        ponte_pct: opening ? (eggs / opening * 100).toFixed(2) : null,
        formule: [...new Set(dayRows.map((row) => row.formule).filter(Boolean))].join(', ') || '—',
        aliment_kg: feed,
        prix_aliment: feedPrice,
        g_poule: opening ? (feed * 1000 / opening).toFixed(1) : null,
        g_oeuf: eggs ? (feed * 1000 / eggs).toFixed(1) : null,
        poidsOeuf: weight,
        autres: otherText || '—',
        autresQuantite: otherItems.length ? otherItems.reduce((total, item) => total + item.quantity, 0) : null,
        autresPrix: otherItems.length ? otherItems.reduce((total, item) => total + item.amount, 0) / Math.max(1, otherItems.reduce((total, item) => total + item.quantity, 0)) : null,
        _otherItems: otherItems,
        _labor: charges.filter((charge) => charge._bucket === 'labor').reduce((total, charge) => total + parseMoney(charge), 0),
        _salary: charges.filter((charge) => charge._bucket === 'salary').reduce((total, charge) => total + parseMoney(charge), 0),
        _electricity: charges.filter((charge) => charge._bucket === 'electricity').reduce((total, charge) => total + parseMoney(charge), 0),
        _feedCost: feedCost,
        _dailyTotal: dailyTotal,
        _weekCharges: weekCharges,
        _weekSales: sales,
        depensesSemaine: dailyTotal,
        totalDepenses: cumulativeSpend,
        ventesSemaine: null,
        prixOeuf: null,
        effectif_debut: opening,
        effectif_fin: remaining,
        birds: remaining,
        cumDead: cumulativeMort,
        cumDeadRate: initial ? (cumulativeMort / initial * 100) : null,
        normal: typeCounts.normal,
        double: typeCounts.double,
        white: typeCounts.white,
        broken: typeCounts.broken,
        lost: typeCounts.lost,
        cumEggs: cumulativeEggs,
        eggMass: eggs && weight ? eggs * weight / 1000 : null,
        fcr: eggs && weight ? feed / (eggs * weight / 1000) : null,
        feedcost: feedCost,
        cost: dailyTotal,
        costPerEgg: eggs && dailyTotal != null ? dailyTotal / eggs : null,
        _dailySales: sales.value, _dailySold: sales.quantity,
        sold: sales.quantity,
        sales: sales.value,
        margin: dailyTotal == null ? null : sales.value - dailyTotal,
        weeklyEggPrice: null,
      };
      return result;
    });
  }, [data, buildingId]);

  const demoMode = demosEnabled && (showExample || (!loading && !data && !error));
  const demoProfile = DEMO_LOTS[demoLot] || DEMO_LOTS.active;
  const demoDays = useMemo(() => demoMode ? buildDemoDays(demoLot, demoBuilding) : [], [demoMode, demoLot, demoBuilding]);

  const sourceDays = demoMode ? demoDays : dailyRows;
  const weeks = useMemo(() => [...new Set(sourceDays.map((row) => row._weekKey))].sort(), [sourceDays]);
  const effectivePeriod = period === 'latest' ? (demoMode ? 'all' : weeks[weeks.length - 1] || 'all') : period;
  const filteredDays = useMemo(() => effectivePeriod === 'all' ? sourceDays : sourceDays.filter((row) => row._weekKey === effectivePeriod), [sourceDays, effectivePeriod]);
  const periods = useMemo(() => [{ key: 'all', label: 'Toute la période' }, ...weeks.map((week) => ({ key: week, label: weekLabel(week) }))], [weeks]);

  const weekSummaries = useMemo(() => {
    const grouped = new Map();
    filteredDays.forEach((row) => {
      const list = grouped.get(row._weekKey) || [];
      list.push(row);
      grouped.set(row._weekKey, list);
    });
    return [...grouped.entries()].map(([key, days]) => {
      const row = demoMode ? aggregateDemoDays(days, 'Total semaine', 'summary') : aggregateDays(days, 'Total semaine', 'summary');
      row._weekKey = key;
      row.date = 'Total semaine · ' + weekLabel(key);
      return row;
    });
  }, [demoMode, filteredDays]);

  const monthSummaries = useMemo(() => {
    const groups = new Map();
    filteredDays.forEach((row) => {
      const month = row.dateIso.slice(0, 7);
      const list = groups.get(month) || [];
      list.push(row);
      groups.set(month, list);
    });
    return [...groups.entries()].map(([month, days]) => {
      const label = 'Total mois · ' + new Date(month + '-15T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return demoMode ? aggregateDemoDays(days, label, 'summary') : aggregateDays(days, label, 'summary');
    });
  }, [filteredDays, demoMode]);

  const periodSummary = useMemo(() => demoMode ? aggregateDemoDays(filteredDays, 'Total période', 'summary') : aggregateDays(filteredDays, 'Total période', 'summary'), [filteredDays, demoMode]);
  const selectedColumns = useMemo(() => {
    const keys = new Set(customColumns || COLUMN_PRESETS[view] || COLUMN_PRESETS.register);
    return columns.filter((column) => keys.has(column.key)).map((column, index, chosen) => ({
      ...column, groupStart: index === 0 || chosen[index - 1].group !== column.group,
    }));
  }, [columns, view, customColumns]);
  const selectedKeys = useMemo(() => new Set(selectedColumns.map((column) => column.key)), [selectedColumns]);

  const groupedRows = useMemo(() => {
    if (groupBy === 'week') return weekSummaries;
    if (groupBy === 'month') return monthSummaries;
    const result = [];
    filteredDays.forEach((day, index) => {
      result.push(day);
      const next = filteredDays[index + 1];
      if (!next || next._weekKey !== day._weekKey) {
        const summary = weekSummaries.find((row) => row._weekKey === day._weekKey);
        if (summary) result.push(summary);
      }
    });
    return result;
  }, [filteredDays, groupBy, monthSummaries, weekSummaries]);

  const displayRows = groupedRows;
  const totalEggs = filteredDays.reduce((total, row) => total + Number(row.oeufs || 0), 0);
  const totalBirdDays = filteredDays.reduce((total, row) => total + Number(row.effectif_debut || 0), 0);
  const layingRate = totalBirdDays ? totalEggs / totalBirdDays * 100 : null;
  const totalCost = periodSummary?.cost ?? null;
  const totalSales = Number(periodSummary?.sales || 0);
  const actualBuildingDays = demoMode ? filteredDays.reduce((total, row) => total + Number(row._actualBuildings || 0), 0) : new Set(data?.rows.filter((row) => {
    const allowed = buildingId === 'all' || Number(row.id_batiment) === Number(buildingId);
    const day = parseRowDate(row);
    const inPeriod = effectivePeriod === 'all' || weekStart(day) === effectivePeriod;
    return allowed && inPeriod;
  }).map((row) => Number(row.id_batiment) + ':' + parseRowDate(row)) || []).size;
  const cycleStart = isoDate(selectedLot?.cycle.date_debut);
  const cycleEnd = isoDate(selectedLot?.cycle.date_fin_reelle) || new Date().toISOString().slice(0, 10);
  const coverageStart = effectivePeriod === 'all' ? cycleStart : (effectivePeriod < cycleStart ? cycleStart : effectivePeriod);
  const selectedWeekEnd = effectivePeriod === 'all' ? cycleEnd : weekEnd(effectivePeriod);
  const coverageEnd = selectedWeekEnd > cycleEnd ? cycleEnd : selectedWeekEnd;
  const coverageDays = coverageStart && coverageEnd ? Math.max(0, Math.floor((new Date(coverageEnd + 'T12:00:00') - new Date(coverageStart + 'T12:00:00')) / 86400000) + 1) : 0;
  const selectedBuildings = selectedCycles.filter((cycle) => buildingId === 'all' || Number(cycle.id_batiment) === Number(buildingId));
  const expectedBuildingDays = demoMode ? filteredDays.reduce((total, row) => total + Number(row._expectedBuildings || 0), 0) : coverageDays * selectedBuildings.length;
  const statusName = (selectedLot?.cycle.statut || '').toLowerCase();
  const lotStatus = ['termine', 'terminé', 'cloture', 'clôturé'].includes(statusName) ? 'terminé' : 'en cours';
  const lotName = selectedLot?.cycle.nom_cycle || selectedLot?.cycle.souche || ('Lot #' + (selectedLot?.cycle.id_lot || selectedLot?.cycle.id_cycle));
  const detail = (demoMode ? demoDays : dailyRows).find((row) => row.id === detailId);

  const columnGroups = useMemo(() => COLUMN_GROUPS.map((group) => ({
    ...group, count: selectedColumns.filter((column) => column.group === group.key).length,
  })).filter((group) => group.count), [selectedColumns]);

  const applyPreset = (key) => {
    setView(key);
    setCustomColumns(null);
    tableRef.current?.scrollTo({ left: 0 });
  };
  const toggleColumn = (key) => {
    setCustomColumns((current) => {
      const keys = new Set(current || COLUMN_PRESETS[view]);
      if (keys.has(key)) { if (keys.size > 1) keys.delete(key); }
      else keys.add(key);
      return [...keys];
    });
  };
  const toggleGroup = (key) => {
    setCustomColumns((current) => {
      const keys = new Set(current || COLUMN_PRESETS[view]);
      const groupKeys = columns.filter((column) => column.group === key).map((column) => column.key);
      const allSelected = groupKeys.every((columnKey) => keys.has(columnKey));
      groupKeys.forEach((columnKey) => { if (allSelected) { if (keys.size > 1) keys.delete(columnKey); } else keys.add(columnKey); });
      return [...keys];
    });
  };
  const jumpToGroup = (key) => {
    const container = tableRef.current;
    const header = groupRefs.current[key];
    if (!container || !header) return;
    const frozenWidth = container.querySelector('thead th')?.getBoundingClientRect().width || LABEL_WIDTH + 32;
    const left = container.scrollLeft + header.getBoundingClientRect().left - container.getBoundingClientRect().left - frozenWidth;
    container.scrollTo({ left: Math.max(0, left), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const cellStyle = (column) => (theme) => ({
    borderLeft: column.groupStart ? '3px solid ' + groupColor(theme, column.group, 'edge') : undefined,
  });

  const handleExport = async (format) => {
    setExportAnchor(null);
    setExporting(true);
    setError('');
    try {
      await exportOverview(format, [...groupedRows, ...(periodSummary ? [periodSummary] : [])],
        [{ key: 'date', label: groupBy === 'day' ? 'Date' : groupBy === 'week' ? 'Semaine' : 'Mois', value: (row) => row.date }, ...selectedColumns],
        { demo: demoMode, lot: demoMode ? demoProfile.name : (selectedLot?.cycle.nom_cycle || selectedLot?.cycle.souche || 'Lot'),
          period: periods.find((item) => item.key === effectivePeriod)?.label,
          building: (demoMode ? demoBuilding : buildingId) === 'all' ? 'Tous les bâtiments' : 'Bâtiment ' + (demoMode ? demoBuilding : buildingId) });
    } catch {
      setError("Impossible de générer le fichier. Veuillez réessayer.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Box sx={{ pb: 4, minWidth: 0 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={1.25} sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight={800}>Suivi global</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>Registre de production et de coûts</Typography>
        </Box>
        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
          <Button size="small" sx={{ display: { xs: demosEnabled ? 'inline-flex' : 'none', sm: 'none' } }} aria-expanded={actionsOpen} aria-controls="overview-actions" onClick={() => setActionsOpen((open) => !open)}>Options</Button>
          <Box id="overview-actions" sx={{ display: { xs: actionsOpen ? 'block' : 'none', sm: 'block' }, order: { xs: 3, sm: 0 }, width: { xs: '100%', sm: 'auto' } }}>
            <Stack direction="row" gap={0.75} flexWrap="wrap">
              {demosEnabled && <Button size="small" onClick={() => setShowExample((value) => !value)} disabled={!data && !showExample}>{demoMode ? 'Données exemple' : 'Voir un exemple'}</Button>}
            </Stack>
          </Box>
          <Button size="small" variant="contained" onClick={(event) => setExportAnchor(event.currentTarget)} disabled={!displayRows.length || exporting || (loading && !demoMode)} aria-haspopup="menu" aria-expanded={Boolean(exportAnchor)} aria-controls={exportAnchor ? 'overview-export-menu' : undefined} sx={{ ml: { xs: 'auto', sm: 0 } }}>{exporting ? 'Export en cours…' : 'Exporter'}</Button>
          <Menu id="overview-export-menu" anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
            <MenuItem onClick={() => handleExport('excel')}>Excel (.xlsx)</MenuItem>
            <MenuItem onClick={() => handleExport('pdf')}>PDF (.pdf)</MenuItem>
          </Menu>
        </Stack>
      </Stack>
      <Paper variant="outlined" sx={{ mb: 1.5, overflow: 'hidden' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ px: 1.5, py: 1 }}>
          <Box sx={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}>
            <Typography variant="body2" fontWeight={700} sx={{ ...wrappedTextSx, flex: '0 1 auto' }}>{demoMode ? (demoProfile.name + ' · ' + (demoBuilding === 'all' ? demoProfile.buildings.length + ' bâtiments' : 'Bâtiment ' + demoBuilding) + ' · ' + (demoProfile.startAge + demoProfile.weeks - 1) + ' semaines · ' + demoProfile.status) : lotName + ' · ' + (buildingId === 'all' ? selectedCycles.length + ' bâtiments' : selectedCycles.find((cycle) => Number(cycle.id_batiment) === Number(buildingId))?.nom_batiment || 'Bâtiment ' + buildingId) + ' · ' + (selectedLot?.cycle.age_semaines || selectedLot?.cycle.semaine_cycle || '—') + ' semaines · ' + lotStatus}</Typography>
            <Typography variant="caption" sx={{ ml: 'auto', textAlign: 'right' }} color={demoMode || actualBuildingDays >= expectedBuildingDays ? 'success.main' : 'warning.main'}>{actualBuildingDays + '/' + expectedBuildingDays} journées bâtiment renseignées</Typography>
            {isMobile && <Typography variant="caption" sx={{ display: 'block', flexBasis: '100%' }}>{periods.find((item) => item.key === effectivePeriod)?.label}</Typography>}
          </Box>
          <Button size="small" variant="outlined" sx={{ display: { xs: 'inline-flex', sm: 'none' }, flexShrink: 0 }} aria-expanded={filtersOpen} aria-controls="overview-filters" onClick={() => setFiltersOpen((open) => !open)}>{filtersOpen ? 'Masquer' : 'Filtres'}</Button>
        </Stack>
        <Collapse id="overview-filters" in={!isMobile || filtersOpen}>
      {demoMode ? (
        <Box sx={{ px: 1.5, pb: 1.5, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: '1.2fr 1fr 1.5fr 1fr' }, gap: 1.25, '& .MuiFormControl-root': { minWidth: 0 } }}>
          <FormControl size="small"><Typography variant="caption" color="text.secondary">Lot</Typography>
            <Select value={demoLot} onChange={(event) => { setDemoLot(event.target.value); setPeriod('latest'); }} inputProps={{ 'aria-label': 'Choisir un lot' }}>
              <MenuItem value="active">Lot Hisex · en cours</MenuItem><MenuItem value="previous">Lot Lohmann · terminé</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small"><Typography variant="caption" color="text.secondary">Bâtiment</Typography>
            <Select value={demoBuilding} onChange={(event) => setDemoBuilding(event.target.value)} inputProps={{ 'aria-label': 'Choisir un bâtiment' }}>
              <MenuItem value="all">Tous les bâtiments</MenuItem><MenuItem value="1">Bâtiment 1</MenuItem><MenuItem value="2">Bâtiment 2</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small"><Typography variant="caption" color="text.secondary">Période</Typography>
            <Select value={effectivePeriod} onChange={(event) => setPeriod(event.target.value)} inputProps={{ 'aria-label': 'Choisir une période' }}>
              {periods.map((item) => <MenuItem key={item.key} value={item.key}>{item.label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small"><Typography variant="caption" color="text.secondary">Regroupement</Typography>
            <Select value={groupBy} onChange={(event) => setGroupBy(event.target.value)} inputProps={{ 'aria-label': 'Regrouper les lignes' }}>
              <MenuItem value="day">Par jour</MenuItem><MenuItem value="week">Par semaine</MenuItem><MenuItem value="month">Par mois</MenuItem>
            </Select>
          </FormControl>
        </Box>
      ) : (
        <Box sx={{ px: 1.5, pb: 1.5, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: '1.2fr 1fr 1.5fr 1fr' }, gap: 1.25, '& .MuiFormControl-root': { minWidth: 0 } }}>
          <FormControl size="small"><Typography variant="caption" color="text.secondary">Lot</Typography>
            <Select value={selectedLot?.key || ''} onChange={(event) => { setLotId(event.target.value); setBuildingId('all'); setPeriod('latest'); }} inputProps={{ 'aria-label': 'Choisir un lot' }}>
              {lots.map((lot) => <MenuItem key={lot.key} value={lot.key}>{lot.cycle.nom_cycle || lot.cycle.souche || ('Lot #' + lot.cycle.id_cycle)} · {lot.cycle.statut || 'en cours'}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" disabled={!selectedCycles.length}><Typography variant="caption" color="text.secondary">Bâtiment</Typography>
            <Select value={buildingId} onChange={(event) => setBuildingId(event.target.value)} inputProps={{ 'aria-label': 'Choisir un bâtiment' }}>
              <MenuItem value="all">Tous les bâtiments</MenuItem>
              {selectedCycles.map((cycle) => <MenuItem key={cycle.id_batiment} value={String(cycle.id_batiment)}>{cycle.nom_batiment || 'Bâtiment ' + cycle.id_batiment}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small"><Typography variant="caption" color="text.secondary">Période</Typography>
            <Select value={effectivePeriod} onChange={(event) => setPeriod(event.target.value)} inputProps={{ 'aria-label': 'Choisir une période' }}>
              {periods.map((item) => <MenuItem key={item.key} value={item.key}>{item.label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small"><Typography variant="caption" color="text.secondary">Regroupement</Typography>
            <Select value={groupBy} onChange={(event) => setGroupBy(event.target.value)} inputProps={{ 'aria-label': 'Regrouper les lignes' }}>
              <MenuItem value="day">Par jour</MenuItem><MenuItem value="week">Par semaine</MenuItem><MenuItem value="month">Par mois</MenuItem>
            </Select>
          </FormControl>
        </Box>
      )}
        </Collapse>
        {demoMode && <Box sx={{ px: 1.5, py: 0.75, bgcolor: theme.palette.mode === 'dark' ? '#463a23' : '#fffbeb', borderTop: '1px solid', borderColor: 'divider' }}><Typography variant="caption" color="text.primary">Données de démonstration · production, dépenses et ventes fictives</Typography></Box>}
      </Paper>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {periodSummary && periodSummary.cost == null && <Alert severity="warning" sx={{ mb: 1.5 }}>Coûts incomplets : un prix d’aliment manque pour la période. Les coûts, marges et valeurs calculées restent vides.</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1, mb: 1.5 }}>
        {[
          ['Œufs collectés', fmt(totalEggs), filteredDays.length + ' jours sélectionnés'],
          ['Taux de ponte', layingRate == null ? '—' : fmt(layingRate, 2) + ' %', 'Moyenne pondérée'],
          ['Coûts de la période', fmtDh(totalCost, 0), 'Aliment et charges affectées'],
          ['Ventes de la période', fmtDh(totalSales, 0), 'Montants facturés · DH'],
        ].map(([label, value, caption]) => (
          <Paper key={label} variant="outlined" sx={{ px: 1.5, py: 1.25, minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>{label}</Typography>
            <Typography variant="h5" fontWeight={800} sx={{ my: 0.25, fontSize: { xs: 18, sm: 20 }, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>{caption}</Typography>
          </Paper>
        ))}
      </Box>
      {loading && !demoMode ? <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress aria-label="Chargement du registre" /></Box>
        : !data && !demoMode ? <Alert severity="info">Aucun lot de production enregistré.</Alert>
          : <>
            <Paper variant="outlined" sx={{ mb: 1.5, overflow: 'hidden' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={0.5} sx={{ px: 1.25, pt: 0.5, pb: 1 }}>
                <Tabs value={customColumns ? false : view} onChange={(_, key) => applyPreset(key)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Vues du registre" sx={{ minHeight: 40, minWidth: 0, flex: 1, '& .MuiTab-root': { minHeight: 40, px: 1.25, minWidth: 0 } }}>
                  {[['register', 'Registre'], ['summary', 'Synthèse'], ['production', 'Production'], ['costs', 'Coûts & ventes']].map(([key, label]) => <Tab key={key} value={key} label={label} />)}
                </Tabs>
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ flexShrink: 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>{customColumns ? 'Personnalisé · ' : ''}{selectedColumns.length} colonnes</Typography>
                  <Button variant="outlined" size="small" aria-haspopup="dialog" aria-expanded={Boolean(columnAnchor)} aria-controls={columnAnchor ? 'global-overview-columns' : undefined} onClick={(event) => setColumnAnchor(event.currentTarget)}>Colonnes</Button>
                </Stack>
              </Stack>
              <Stack direction="row" alignItems="center" gap={0.75} sx={{ px: 1.5, pb: 1, display: { xs: 'none', sm: 'flex' }, overflowX: 'auto' }} aria-label="Catégories de colonnes">
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Aller à</Typography>
                {COLUMN_GROUPS.map((group) => (
                  <Button key={group.key} size="small" disabled={!columnGroups.some((shown) => shown.key === group.key)} onClick={() => jumpToGroup(group.key)} sx={{ textTransform: 'none', fontSize: 12, color: 'text.primary', gap: 0.75, flexShrink: 0, px: 0.75 }}>
                    <Box component="span" aria-hidden="true" sx={(theme) => ({ width: 7, height: 7, flexShrink: 0, borderRadius: '2px', bgcolor: groupColor(theme, group.key, 'edge') })} />{group.label}
                  </Button>
                ))}
              </Stack>
              {isMobile && <FormControl size="small" sx={{ display: 'flex', mx: 1.5, mb: 1 }}>
                <Select value="" displayEmpty inputProps={{ 'aria-label': 'Aller à une catégorie' }} onChange={(event) => jumpToGroup(event.target.value)} sx={{ fontSize: 12 }}>
                  <MenuItem value="" disabled>Aller à une catégorie…</MenuItem>
                  {columnGroups.map((group) => <MenuItem key={group.key} value={group.key}>{group.label}</MenuItem>)}
                </Select>
              </FormControl>}
              <TableContainer ref={tableRef} tabIndex={0} role="region" aria-label="Registre de production" sx={{ '--date-width': { xs: '116px', sm: LABEL_WIDTH + 'px' }, maxHeight: '70vh', overflow: 'auto' }}>
                <Table size="small" stickyHeader sx={{ minWidth: LABEL_WIDTH + selectedColumns.reduce((total, column) => total + (['formule', 'autres'].includes(column.key) ? TEXT_WIDTH + 32 : 144), 0), '& td, & th': { fontVariantNumeric: 'tabular-nums' }, '& .MuiTableHead-root .MuiTableCell-root': { textTransform: 'none', letterSpacing: 0, color: 'text.primary', fontSize: 12, lineHeight: 1.35, px: 1.5, py: 0.75 }, '& .MuiTableBody-root .MuiTableCell-root': { px: 1.5, py: 1, fontSize: 13, lineHeight: 1.45 } }}>
                  <TableHead>
                    <TableRow sx={{ height: 36 }}>
                      <TableCell rowSpan={2} sx={{ ...stickyLabelSx, zIndex: 5, borderRight: '1px solid', borderColor: 'divider' }}>{groupBy === 'day' ? 'Date' : groupBy === 'week' ? 'Semaine' : 'Mois'}</TableCell>
                      {columnGroups.map((group) => (
                        <TableCell key={group.key} ref={(node) => { if (node) groupRefs.current[group.key] = node; else delete groupRefs.current[group.key]; }} colSpan={group.count} align="left" sx={(theme) => ({ top: 0, height: 36, py: 0.5, '&&': { bgcolor: groupColor(theme, group.key) }, borderLeft: '3px solid ' + groupColor(theme, group.key, 'edge'), fontWeight: 700, fontSize: 12, lineHeight: 1.3, whiteSpace: 'normal' })}>{group.label}</TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      {selectedColumns.map((column) => <TableCell key={column.key} align={['formule', 'autres'].includes(column.key) ? 'left' : 'right'} sx={(theme) => ({ ...cellStyle(column)(theme), top: 36, height: 68, '&&': { bgcolor: groupColor(theme, column.group) }, fontWeight: 700, whiteSpace: 'normal' })}>
                        <Box sx={{ width: ['formule', 'autres'].includes(column.key) ? TEXT_WIDTH : 112, maxWidth: '100%', ml: ['formule', 'autres'].includes(column.key) ? 0 : 'auto' }}>{column.label}<Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 11, fontWeight: 400, mt: 0.25 }}>{column.unit || '\u00a0'}</Typography></Box>
                      </TableCell>)}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {displayRows.map((row, index) => {
                      const summary = row.rowType === 'summary';
                      return <TableRow key={row.id} sx={(theme) => ({ height: 48,
                        '& td': { fontWeight: summary ? 700 : 400, bgcolor: summary ? (theme.palette.mode === 'dark' ? '#273750' : '#edf2fc') : index % 2 ? 'background.default' : 'background.paper', borderTop: summary ? '1px solid ' + groupColor(theme, 'effectif', 'edge') : undefined, whiteSpace: 'nowrap' },
                        '&:hover td': { bgcolor: theme.palette.mode === 'dark' ? '#30415b' : '#e9eef7' },
                      })}>
                        <TableCell sx={{ ...stickyLabelSx, zIndex: 3, borderRight: '1px solid', borderColor: 'divider' }}>
                          <Box component="span" sx={wrappedTextSx}>
                            {row.rowType === 'day' ? <Button size="small" onClick={() => setDetailId(row.id)} sx={{ minWidth: 0, maxWidth: '100%', p: 0, textTransform: 'none', fontWeight: 700, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{row.date}</Button> : renderRowLabel(row)}
                          </Box>
                        </TableCell>
                        {selectedColumns.map((column) => <TableCell key={column.key} sx={cellStyle(column)} align={['formule', 'autres'].includes(column.key) ? 'left' : 'right'}>{renderColumnValue(column, row, setTextDetail)}</TableCell>)}
                      </TableRow>;
                    })}
                    {!displayRows.length && <TableRow><TableCell colSpan={selectedColumns.length + 1} align="center">Aucune donnée pour ces filtres.</TableCell></TableRow>}
                  </TableBody>
                  {periodSummary && <TableBody><TableRow sx={(theme) => ({ '& td': { fontWeight: 800, bgcolor: theme.palette.mode === 'dark' ? '#2c3e5c' : '#e6edfb', borderTop: '2px solid ' + groupColor(theme, 'effectif', 'edge'), whiteSpace: 'nowrap' } })}>
                    <TableCell sx={{ ...stickyLabelSx, zIndex: 3, borderRight: '1px solid', borderColor: 'divider' }}><Box component="span" sx={wrappedTextSx}>Total période</Box></TableCell>
                    {selectedColumns.map((column) => <TableCell key={column.key} sx={cellStyle(column)} align={['formule', 'autres'].includes(column.key) ? 'left' : 'right'}>{renderColumnValue(column, periodSummary, setTextDetail)}</TableCell>)}
                  </TableRow></TableBody>}
                </Table>
              </TableContainer>
              <Stack direction="row" justifyContent="flex-end" flexWrap="wrap" gap={1} sx={{ px: 1.5, py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary">{filteredDays.length} journées · {groupedRows.length} lignes affichées</Typography>
              </Stack>
            </Paper>
            <Popover id="global-overview-columns" open={Boolean(columnAnchor)} anchorEl={columnAnchor} onClose={() => setColumnAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} PaperProps={{ role: 'dialog', 'aria-label': 'Choisir les colonnes', sx: { width: 390, maxWidth: 'calc(100vw - 32px)' } }}>
              <Box sx={{ p: 2 }}>
                <Typography variant="subtitle1" fontWeight={800}>Colonnes du registre</Typography>
                <Typography variant="body2" color="text.secondary">Afficher uniquement les indicateurs utiles.</Typography>
                <Stack direction="row" gap={1} sx={{ mt: 1 }} flexWrap="wrap">
                  <Button size="small" onClick={() => setCustomColumns(columns.map((column) => column.key))}>Tout afficher</Button>
                  <Button size="small" onClick={() => applyPreset('register')}>Rétablir Registre</Button>
                </Stack>
              </Box>
              <Divider />
              <Box sx={{ maxHeight: 350, overflow: 'auto', px: 2 }}>
                {COLUMN_GROUPS.map((group) => {
                  const options = columns.filter((column) => column.group === group.key);
                  const count = options.filter((column) => selectedKeys.has(column.key)).length;
                  return <Box key={group.key} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <FormControlLabel sx={{ m: 0 }} control={<Checkbox size="small" checked={count === options.length} indeterminate={count > 0 && count < options.length} onChange={() => toggleGroup(group.key)} />} label={<Typography variant="body2" fontWeight={700}>{group.label}</Typography>} />
                    {options.map((column) => <FormControlLabel key={column.key} sx={{ display: 'flex', ml: 2, mr: 0, alignItems: 'flex-start' }} control={<Checkbox size="small" sx={{ py: 0.75 }} checked={selectedKeys.has(column.key)} disabled={selectedColumns.length === 1 && selectedKeys.has(column.key)} onChange={() => toggleColumn(column.key)} />} label={<Typography variant="body2" sx={{ py: 0.75 }}>{column.label}{column.unit && ' · ' + column.unit}</Typography>} />)}
                  </Box>;
                })}
              </Box>
              <Divider />
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5 }}>
                <Typography variant="caption" color="text.secondary">{selectedColumns.length} / {columns.length} colonnes</Typography>
                <Button size="small" variant="contained" onClick={() => setColumnAnchor(null)}>Terminer</Button>
              </Stack>
            </Popover>
            {detail && <Paper variant="outlined" sx={{ mt: 1.5, p: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Détail · {detail.date} · {demoMode ? (demoBuilding === 'all' ? 'tous les bâtiments' : 'Bâtiment ' + demoBuilding) : buildingId === 'all' ? 'tous les bâtiments' : selectedCycles.find((cycle) => Number(cycle.id_batiment) === Number(buildingId))?.nom_batiment}</Typography>
                <Button onClick={() => setDetailId('')}>Fermer</Button>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
                {[
                  ['Production', [['Mort', fmt(detail.mort)], ['Oeufs', fmt(detail.oeufs)], ['Cumul du lot', fmt(detail.cumEggs)], ['Poids moyen', fmt(detail.poidsOeuf, 1) + ' g'], ['Effectif restant', fmt(detail.effectif_fin)]]],
                  ['Aliment & autres dépenses', [['Formule', detail.formule], ['Aliment', fmt(detail.aliment_kg, 2) + ' kg'], ['Prix aliment', fmt(detail.prix_aliment, 2) + ' DH/kg'], ['g/poule', fmt(detail.g_poule, 1)], ['g/oeuf', fmt(detail.g_oeuf, 1)], ['Autres', detail.autres]]],
                  ['Dépenses & ventes', [['Main Oeuvre + CNSS', fmtDh(detail._labor)], ['Salaires', fmtDh(detail._salary)], ['Electricité', fmtDh(detail._electricity)], ['Dépenses du jour', fmtDh(detail._dailyTotal)], ['Total dépenses', fmtDh(detail.totalDepenses)]]],
                ].map(([title, items]) => <Box key={title}>
                  <Typography variant="subtitle2" color="primary" sx={{ mb: 0.5 }}>{title}</Typography>
                  {items.map(([label, value]) => <Stack key={label} direction="row" justifyContent="space-between" gap={1} sx={{ py: 0.4, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>{label}</Typography><Typography variant="body2" textAlign="right">{value ?? '—'}</Typography>
                  </Stack>)}
                </Box>)}
              </Box>
            </Paper>}
          </>}
      <Dialog open={Boolean(textDetail)} onClose={() => setTextDetail(null)} fullWidth maxWidth="sm" aria-labelledby="overview-text-title">
        <DialogTitle id="overview-text-title">{textDetail?.title}</DialogTitle>
        <DialogContent><Typography variant="caption" sx={{ display: 'block', mb: 1 }}>{textDetail?.date}</Typography><Typography sx={wrappedTextSx}>{textDetail?.value}</Typography></DialogContent>
        <DialogActions><Button onClick={() => setTextDetail(null)}>Fermer</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

export default GlobalOverviewPage;
