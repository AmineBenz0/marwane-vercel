import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, FormControl, MenuItem, Paper, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography,
} from '@mui/material';
import { get } from '../../services/api';
import { cycleProductionService, productionService } from '../../services/productionService';

const fmt = (value, digits = 0) => value == null || value === '' || value === '-' ? '—' : Number(value).toLocaleString('fr-FR', { maximumFractionDigits: digits });
const fmtDh = (value, digits = 2) => value == null || !Number.isFinite(Number(value)) ? '—' : fmt(value, digits) + ' DH';
const isoDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
};
const dateFromDisplay = (value) => {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? match[3] + '-' + match[2] + '-' + match[1] : '';
};
const parseRowDate = (row) => dateFromDisplay(row.date);
const weekStart = (value) => {
  const date = new Date(value + 'T12:00:00');
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};
const weekEnd = (value) => {
  const date = new Date(value + 'T12:00:00');
  date.setDate(date.getDate() + 6);
  return date.toISOString().slice(0, 10);
};
const dateLabel = (value) => new Date(value + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const weekLabel = (value) => dateLabel(value) + ' – ' + dateLabel(weekEnd(value));
const isMatch = (value, pattern) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(pattern);
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

const DEMO_ROWS = [
  { id: 'demo-1', rowType: 'day', date: '12/10/2026', dateIso: '2026-10-12', mort: 2, mort_pct: '0.17%', oeufs: 1032, oeufs_cum: 1032, ponte_pct: '86.0%', formule: '17-1% Sem vita', aliment_kg: 138, prix_aliment: 4.5, g_poule: '115.0', g_oeuf: '133.7', poidsOeuf: 62.5, autres: 'Désinfectant: 1 × 180 DH', autresQuantite: '1', autresPrix: '180', _labor: 0, _salary: 0, _electricity: 0, depensesSemaine: 801, totalDepenses: 801, ventesSemaine: null, valeurPoulette: 0.67, prixOeuf: null },
  { id: 'demo-2', rowType: 'day', date: '13/10/2026', dateIso: '2026-10-13', mort: 1, mort_pct: '0.08%', oeufs: 1040, oeufs_cum: 2072, ponte_pct: '86.8%', formule: '17-1% Sem vita', aliment_kg: 138, prix_aliment: 4.5, g_poule: '115.0', g_oeuf: '132.7', poidsOeuf: 62.7, autres: 'Litière: 4 × 45 DH', autresQuantite: '4', autresPrix: '45', _labor: 0, _salary: 0, _electricity: 0, depensesSemaine: 801, totalDepenses: 1602, ventesSemaine: null, valeurPoulette: 1.34, prixOeuf: null },
  { id: 'demo-3', rowType: 'day', date: '14/10/2026', dateIso: '2026-10-14', mort: 0, mort_pct: '0.00%', oeufs: 1055, oeufs_cum: 3127, ponte_pct: '88.1%', formule: '17-1% Sem vita', aliment_kg: 138, prix_aliment: 4.5, g_poule: '115.0', g_oeuf: '130.8', poidsOeuf: 62.8, autres: 'Vaccin: 2 × 95 DH', autresQuantite: '2', autresPrix: '95', _labor: 0, _salary: 0, _electricity: 0, depensesSemaine: 811, totalDepenses: 2413, ventesSemaine: null, valeurPoulette: 2.02, prixOeuf: null },
  { id: 'demo-4', rowType: 'day', date: '15/10/2026', dateIso: '2026-10-15', mort: 1, mort_pct: '0.08%', oeufs: 1062, oeufs_cum: 4189, ponte_pct: '88.6%', formule: '17-1% Sem vita', aliment_kg: 138, prix_aliment: 4.5, g_poule: '115.0', g_oeuf: '130.0', poidsOeuf: 62.9, autres: 'Réparation: 1 × 350 DH', autresQuantite: '1', autresPrix: '350', _labor: 0, _salary: 0, _electricity: 0, depensesSemaine: 971, totalDepenses: 3384, ventesSemaine: null, valeurPoulette: 2.83, prixOeuf: null },
  { id: 'demo-5', rowType: 'day', date: '16/10/2026', dateIso: '2026-10-16', mort: 1, mort_pct: '0.08%', oeufs: 1070, oeufs_cum: 5259, ponte_pct: '89.3%', formule: '17-1% Sem vita', aliment_kg: 138, prix_aliment: 4.5, g_poule: '115.0', g_oeuf: '129.0', poidsOeuf: 62.8, autres: 'Emballage: 1 × 75 DH', autresQuantite: '1', autresPrix: '75', _labor: 0, _salary: 0, _electricity: 0, depensesSemaine: 696, totalDepenses: 4080, ventesSemaine: null, valeurPoulette: 3.43, prixOeuf: null },
  { id: 'demo-week', rowType: 'summary', date: 'Total semaine', mort: 5, mort_pct: '0.42%', oeufs: 5259, oeufs_cum: 5259, ponte_pct: '87.7%', formule: '17-1% Sem vita', aliment_kg: 690, prix_aliment: 4.5, g_poule: '115.0', g_oeuf: '131.2', poidsOeuf: 62.7, autres: '975 DH', autresQuantite: '—', autresPrix: '—', _labor: 500, _salary: 1250, _electricity: 280, depensesSemaine: 6110, totalDepenses: 6110, ventesSemaine: 12100, valeurPoulette: 5.11, prixOeuf: 1.21 },
];

const toCsv = (rows, cols) => {
  const quote = (value) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  return [cols.map((c) => quote(c.label)).join(';'), ...rows.map((row) => cols.map((c) => quote(c.value(row) ?? '')).join(';'))].join('\r\n');
};

function aggregateDays(dayRows, label, rowType = 'summary') {
  if (!dayRows.length) return null;
  const sum = (key) => dayRows.reduce((total, row) => total + Number(row[key] || 0), 0);
  const eggs = sum('oeufs');
  const deaths = sum('mort');
  const birdDays = sum('effectif_debut');
  const feed = sum('aliment_kg');
  const chargesByWeek = new Map();
  dayRows.forEach((row) => { if (!chargesByWeek.has(row._weekKey)) chargesByWeek.set(row._weekKey, Number(row._weekCharges?.total || 0)); });
  const cost = sum('_feedCost') + [...chargesByWeek.values()].reduce((total, amount) => total + amount, 0);
  const salesWeeks = new Map();
  dayRows.forEach((row) => {
    if (!salesWeeks.has(row._weekKey)) salesWeeks.set(row._weekKey, row._weekSales || { value: 0, quantity: 0 });
  });
  const sales = [...salesWeeks.values()].reduce((total, week) => total + Number(week.value || 0), 0);
  const sold = [...salesWeeks.values()].reduce((total, week) => total + Number(week.quantity || 0), 0);
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
    id: rowType + '-' + (last._weekKey || label),
    rowType,
    date: label,
    mort: deaths,
    mort_pct: birdDays ? (deaths / birdDays * 100).toFixed(2) : null,
    oeufs: eggs,
    oeufs_cum: last.oeufs_cum,
    weekCumEggs: sum('oeufs'),
    ponte_pct: birdDays ? (eggs / birdDays * 100).toFixed(2) : null,
    formule: formulas.join(', ') || '—',
    aliment_kg: feed,
    prix_aliment: feed ? sum('_feedCost') / feed : null,
    g_poule: birdDays ? (feed * 1000 / birdDays).toFixed(1) : null,
    g_oeuf: eggs ? (feed * 1000 / eggs).toFixed(1) : null,
    poidsOeuf: eggs ? dayRows.reduce((total, row) => total + Number(row.poidsOeuf || 0) * Number(row.oeufs || 0), 0) / eggs : null,
    autres: fmtDh(totalOther),
    autresQuantite: otherItems.length ? otherItems.reduce((total, item) => total + Number(item.quantity || 0), 0) : null,
    autresPrix: otherItems.length ? totalOther / otherItems.reduce((total, item) => total + Number(item.quantity || 0), 0) : null,
    _labor: sum('_labor'),
    _salary: sum('_salary'),
    _electricity: sum('_electricity'),
    _feedCost: sum('_feedCost'),
    _dailyTotal: cost,
    depensesSemaine: cost,
    totalDepenses: last.totalDepenses,
    ventesSemaine: sales,
    _sales: sales,
    _sold: sold,
    prixOeuf: sold ? sales / sold : null,
    valeurPoulette: last.effectif_fin ? last.totalDepenses / last.effectif_fin : null,
    birds: last.effectif_fin,
    cumDead: last.cumDead,
    cumDeadRate: last.cumDeadRate,
    cumEggs: last.cumEggs,
    eggMass: eggs ? dayRows.reduce((total, row) => total + Number(row.poidsOeuf || 0) * Number(row.oeufs || 0), 0) / 1000 : null,
    fcr: eggs && last.poidsOeuf ? feed / ((eggs * last.poidsOeuf) / 1000) : null,
    cost: cost,
    feedcost: sum('_feedCost'),
    costPerEgg: eggs ? cost / eggs : null,
    sold,
    sales,
    margin: sales - cost,
    weeklyEggPrice: sold ? sales / sold : null,
    pulletValue: last.effectif_fin ? last.totalDepenses / last.effectif_fin : null,
    expected: dayRows.reduce((total, row) => total + Number(row._expectedBuildings || 0), 0),
  };
}

function GlobalOverviewPage() {
  const [cycles, setCycles] = useState([]);
  const [lotId, setLotId] = useState('');
  const [buildingId, setBuildingId] = useState('all');
  const [period, setPeriod] = useState('latest');
  const [groupBy, setGroupBy] = useState('day');
  const [view, setView] = useState('excel');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [showExample, setShowExample] = useState(false);
  const [demoLot, setDemoLot] = useState('active');
  const [demoBuilding, setDemoBuilding] = useState('all');
  const [expanded, setExpanded] = useState(false);
  const [detailId, setDetailId] = useState('');

  const lots = useMemo(() => groupCycles(cycles), [cycles]);
  const selectedLot = lots.find((group) => group.key === String(lotId)) || lots[0];
  const selectedCycles = selectedLot?.cycles || [];

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const cycleRows = await cycleProductionService.getCycles({ skip: 0, limit: 500 });
      const normalized = (cycleRows || []).filter((row) => row.id_cycle).sort((a, b) => String(b.date_debut || '').localeCompare(String(a.date_debut || '')));
      setCycles(normalized);
      const groups = groupCycles(normalized);
      const selected = groups.find((group) => group.key === String(lotId)) || groups[0];
      if (!selected) {
        setData(null);
        setLoading(false);
        return;
      }
      if (selected.key !== lotId) setLotId(selected.key);
      const cycleIds = selected.cycles.map((cycle) => Number(cycle.id_cycle));
      const startDate = isoDate(selected.cycle.date_debut);
      const endDate = isoDate(selected.cycle.date_fin_reelle) || new Date().toISOString().slice(0, 10);
      const [performances, charges, transactions, products, entrySets] = await Promise.all([
        Promise.all(selected.cycles.map((cycle) => productionService.getPerformance(cycle.id_cycle))),
        loadPages('/charges', { date_debut: startDate, date_fin: endDate }),
        loadPages('/transactions', { date_debut: startDate, date_fin: endDate, est_actif: true }),
        loadPages('/produits'),
        Promise.all(selected.cycles.map((cycle) => loadPages('/productions', {
          id_cycle: cycle.id_cycle, date_debut: startDate, date_fin: endDate,
        }))),
      ]);
      const buildingIds = selected.cycles.map((cycle) => Number(cycle.id_batiment));
      const relevantCharges = (charges || []).filter((charge) => {
        if (!charge.id_cycle && !charge.id_batiment) return true;
        return cycleIds.includes(Number(charge.id_cycle)) || buildingIds.includes(Number(charge.id_batiment));
      });
      const rows = performances.flatMap((performance, index) => (performance.rows || [])
        .filter((row) => row.rowType === 'day')
        .map((row) => ({ ...row, id_cycle: selected.cycles[index].id_cycle, id_batiment: selected.cycles[index].id_batiment, nom_batiment: selected.cycles[index].nom_batiment })));
      const entries = entrySets.flat().map((entry) => ({ ...entry, dateIso: isoDate(entry.date_production) }));
      setData({
        cycle: performances[0]?.cycle || selected.cycle,
        cycles: selected.cycles,
        rows,
        entries,
        charges: relevantCharges,
        transactions: transactions || [],
        products: products || [],
      });
    } catch (err) {
      setError(err?.message || 'Impossible de charger le registre de production.');
    } finally {
      setLoading(false);
    }
  }, [lotId, refresh]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo(() => [
    { key: 'mort', label: 'Mort', group: 'prod', value: (r) => r.mort },
    { key: 'mort_pct', label: '%Mort/j', group: 'prod', value: (r) => r.mort_pct == null ? '—' : r.mort_pct + ' %' },
    { key: 'oeufs', label: 'Oeuf/j', group: 'prod', value: (r) => r.oeufs },
    { key: 'oeufs_cum', label: 'Oeuf cum/j', group: 'prod', value: (r) => r.oeufs_cum },
    { key: 'ponte_pct', label: '%ponte', group: 'prod', value: (r) => r.ponte_pct == null ? '—' : r.ponte_pct + ' %' },
    { key: 'formule', label: 'Formule', group: 'feed', value: (r) => r.formule },
    { key: 'aliment_kg', label: 'Quantité', group: 'feed', unit: 'kg', value: (r) => fmt(r.aliment_kg) },
    { key: 'prix_aliment', label: 'Prix', group: 'feed', unit: 'DH/kg', value: (r) => fmt(r.prix_aliment, 2) },
    { key: 'g_poule', label: 'g/poule', group: 'feed', value: (r) => fmt(r.g_poule, 1) },
    { key: 'g_oeuf', label: 'g/oeuf', group: 'feed', value: (r) => fmt(r.g_oeuf, 1) },
    { key: 'poidsOeuf', label: 'Poids oeuf', group: 'feed', unit: 'g', value: (r) => fmt(r.poidsOeuf, 1) },
    { key: 'autres', label: 'Autres dépenses', group: 'misc', value: (r) => r.autres || '—' },
    { key: 'autresQuantite', label: 'Quantité', group: 'misc', value: (r) => fmt(r.autresQuantite, 2) },
    { key: 'autresPrix', label: 'Prix', group: 'misc', unit: 'DH/unité', value: (r) => fmt(r.autresPrix, 2) },
    { key: 'labor', label: 'Main Oeuvre + CNSS', group: 'fin', value: (r) => fmtDh(r._labor) },
    { key: 'salary', label: 'Salaires', group: 'fin', value: (r) => fmtDh(r._salary) },
    { key: 'electricity', label: 'Electricité', group: 'fin', value: (r) => fmtDh(r._electricity) },
    { key: 'depensesSemaine', label: 'Dépenses Semaine', group: 'fin', unit: 'DH', value: (r) => fmtDh(r.depensesSemaine, 0) },
    { key: 'totalDepenses', label: 'Total Dépenses', group: 'fin', unit: 'DH', value: (r) => fmtDh(r.totalDepenses, 0) },
    { key: 'ventesSemaine', label: 'Ventes Semaine', group: 'fin', unit: 'DH', value: (r) => r.ventesSemaine == null ? '—' : fmtDh(r.ventesSemaine, 0) },
    { key: 'valeurPoulette', label: 'Valeur Poulette', group: 'fin', unit: 'DH/poulette', value: (r) => fmtDh(r.valeurPoulette) },
    { key: 'prixOeuf', label: 'Prix vente moyen oeuf par semaine', group: 'fin', unit: 'DH/oeuf', value: (r) => fmt(r.prixOeuf, 3) },
    { key: 'birds', label: 'Effectif fin', group: 'prod', value: (r) => fmt(r.birds) },
    { key: 'cumDead', label: 'Mortalité cumulée', group: 'prod', value: (r) => fmt(r.cumDead) },
    { key: 'cumDeadRate', label: 'Mortalité cumulée %', group: 'prod', value: (r) => r.cumDeadRate == null ? '—' : fmt(r.cumDeadRate, 2) + ' %' },
    { key: 'normal', label: 'Normaux', group: 'prod', value: (r) => fmt(r.normal) },
    { key: 'double', label: 'Doubles jaunes', group: 'prod', value: (r) => fmt(r.double) },
    { key: 'white', label: 'Blancs', group: 'prod', value: (r) => fmt(r.white) },
    { key: 'broken', label: 'Cassés', group: 'prod', value: (r) => fmt(r.broken) },
    { key: 'lost', label: 'Perdus', group: 'prod', value: (r) => fmt(r.lost) },
    { key: 'cumEggs', label: 'Œufs cumulés du lot', group: 'prod', value: (r) => fmt(r.cumEggs) },
    { key: 'eggMass', label: 'Masse d’oeufs', group: 'feed', unit: 'kg', value: (r) => fmt(r.eggMass, 2) },
    { key: 'fcr', label: 'Indice aliment / oeuf', group: 'feed', unit: 'kg/kg', value: (r) => fmt(r.fcr, 2) },
    { key: 'feedcost', label: 'Coût aliment', group: 'fin', unit: 'DH', value: (r) => fmtDh(r._feedCost) },
    { key: 'cost', label: 'Coûts de la période', group: 'fin', unit: 'DH', value: (r) => fmtDh(r.cost) },
    { key: 'costPerEgg', label: 'Coût / oeuf produit', group: 'fin', unit: 'DH/oeuf', value: (r) => fmt(r.costPerEgg, 3) },
    { key: 'sold', label: 'Oeufs vendus', group: 'fin', value: (r) => fmt(r.sold) },
    { key: 'sales', label: 'Ventes de la période', group: 'fin', unit: 'DH', value: (r) => fmtDh(r.sales) },
    { key: 'margin', label: 'Marge estimée', group: 'fin', unit: 'DH', value: (r) => fmtDh(r.margin) },
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
    const entryTypes = new Map();
    data.entries.filter((entry) => allowedCycleIds.includes(Number(entry.id_cycle))).forEach((entry) => {
      const values = entryTypes.get(entry.dateIso) || { normal: 0, double: 0, white: 0, broken: 0, lost: 0 };
      const key = ({ normal: 'normal', double_jaune: 'double', blanc: 'white', casse: 'broken', perdu: 'lost' })[entry.type_oeuf];
      if (key) values[key] += Number(entry.nombre_oeufs || 0);
      entryTypes.set(entry.dateIso, values);
    });
    const chargesByDate = new Map();
    const chargesByWeek = new Map();
    const filteredCharges = data.charges.filter((charge) => {
      if (buildingId === 'all') return true;
      return Number(charge.id_batiment) === Number(buildingId) || allowedCycleIds.includes(Number(charge.id_cycle)) || (!charge.id_batiment && !charge.id_cycle);
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
    const relevantTransactions = data.transactions.filter((transaction) => {
      if (transaction.est_actif === false) return false;
      const hasOwner = transaction.id_cycle || transaction.id_batiment;
      if (!hasOwner) return true;
      return cycleIds.has(Number(transaction.id_cycle)) || buildingSet.has(Number(transaction.id_batiment));
    });
    const salesByWeek = new Map();
    const feedPurchasesByWeek = new Map();
    relevantTransactions.forEach((transaction) => {
      const date = isoDate(transaction.date_transaction);
      if (!date) return;
      const product = productsById.get(Number(transaction.id_produit));
      const name = product?.nom_produit || '';
      const key = weekStart(date);
      if (transaction.id_client && isMatch(name, 'oeuf')) {
        const group = salesByWeek.get(key) || { value: 0, quantity: 0 };
        group.value += Number(transaction.montant_total || 0);
        group.quantity += Number(transaction.quantite || 0);
        salesByWeek.set(key, group);
      }
      if (transaction.id_fournisseur && (isMatch(name, 'aliment') || isMatch(name, 'feed'))) {
        const group = feedPurchasesByWeek.get(key) || { quantity: 0, amount: 0 };
        group.quantity += Number(transaction.quantite || 0);
        group.amount += Number(transaction.montant_total || 0);
        feedPurchasesByWeek.set(key, group);
      }
    });
    let cumulativeEggs = 0;
    let cumulativeMort = 0;
    let cumulativeSpend = 0;
    let activeWeek = '';
    let weekRunning = 0;
    const initial = allowedCycles.reduce((total, cycle) => total + Number(cycle.effectif_initial || 0), 0);
    return [...groupedByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dateIso, dayRows]) => {
      const key = weekStart(dateIso);
      if (activeWeek !== key) {
        activeWeek = key;
        weekRunning = 0;
      }
      const first = dayRows[0];
      const sum = (prop) => dayRows.reduce((total, row) => total + Number(row[prop] || 0), 0);
      const eggs = sum('oeufs');
      const deaths = sum('mort');
      const feed = sum('aliment_kg');
      const opening = sum('effectif_debut');
      const remaining = sum('effectif_fin');
      const weightSum = dayRows.reduce((total, row) => total + Number(row.poids_oeuf || 0) * Number(row.oeufs || 0), 0);
      const weight = eggs ? weightSum / eggs : null;
      cumulativeEggs += eggs;
      cumulativeMort += deaths;
      const charges = chargesByDate.get(dateIso) || [];
      const weekCharges = chargesByWeek.get(key) || { total: 0, other: 0, vaccine: 0, labor: 0, salary: 0, electricity: 0 };
      const feedPurchase = feedPurchasesByWeek.get(key);
      const feedPrice = feedPurchase?.quantity ? feedPurchase.amount / feedPurchase.quantity : null;
      const feedCost = feedPrice == null ? null : feed * feedPrice;
      const dailyCharges = charges.reduce((total, charge) => total + parseMoney(charge), 0);
      const dailyTotal = dailyCharges + (feedCost || 0);
      weekRunning += dailyTotal;
      cumulativeSpend += dailyTotal;
      const otherLines = charges.filter((charge) => ['other', 'vaccine'].includes(charge._bucket));
      const typeCounts = entryTypes.get(dateIso) || { normal: 0, double: 0, white: 0, broken: 0, lost: 0 };
      const otherItems = otherLines.map((charge) => ({
        label: charge.libelle,
        quantity: Number(charge.quantite ?? 1),
        amount: parseMoney(charge),
        price: Number(charge.prix_unitaire ?? charge.montant ?? 0),
      }));
      const otherText = otherItems.map((item) => item.label + ': ' + fmt(item.quantity, 2) + ' × ' + fmtDh(item.price)).join(' · ');
      const sales = salesByWeek.get(key) || { value: 0, quantity: 0 };
      const percent = opening ? deaths / opening * 100 : null;
      const result = {
        id: 'day-' + dateIso,
        rowType: 'day',
        date: dateLabel(dateIso),
        dateIso,
        _weekKey: key,
        _expectedBuildings: allowedCycles.length,
        mort: deaths,
        mort_pct: percent == null ? null : percent.toFixed(2),
        oeufs: eggs,
        oeufs_cum: sum('oeufs_cumul'),
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
        _feedCost: feedCost || 0,
        _dailyTotal: dailyTotal,
        _weekCharges: weekCharges,
        _weekCost: weekCharges.total + [...groupedByDate.entries()].filter(([date]) => weekStart(date) === key).reduce((total, [, rows]) => {
          const d = isoDate(rows[0].date);
          const dayCharge = (chargesByDate.get(d) || []).reduce((sum, charge) => sum + parseMoney(charge), 0);
          return total + dayCharge;
        }, 0),
        _weekSales: sales,
        depensesSemaine: dailyTotal,
        totalDepenses: cumulativeSpend,
        ventesSemaine: null,
        prixOeuf: null,
        valeurPoulette: remaining ? cumulativeSpend / remaining : null,
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
        feedcost: feedCost || 0,
        cost: dailyTotal,
        costPerEgg: eggs ? dailyTotal / eggs : null,
        sold: null,
        sales: null,
        margin: null,
        weeklyEggPrice: null,
        pulletValue: remaining ? cumulativeSpend / remaining : null,
      };
      result._weekCost = weekCharges.total + feedCost || dailyTotal;
      return result;
    });
  }, [data, buildingId]);

  const demoMode = showExample || (!loading && !data && !error);
  const demoFactor = (demoLot === 'previous' ? 0.88 : 1) * (demoBuilding === 'all' ? 1 : 0.5);
  const demoDays = useMemo(() => DEMO_ROWS.filter((row) => row.rowType === 'day').map((row) => ({
    ...row,
    id: row.id,
    _weekKey: '2026-10-12',
    _expectedBuildings: demoBuilding === 'all' ? 2 : 1,
    _weekSales: { value: 12100 * demoFactor, quantity: 10000 * demoFactor },
    _weekCharges: { total: 0 },
    effectif_debut: (demoBuilding === 'all' ? 1200 : 600) * (demoLot === 'previous' ? 0.88 : 1),
    effectif_fin: (demoBuilding === 'all' ? 1195 : 598) * (demoLot === 'previous' ? 0.88 : 1),
    birds: (demoBuilding === 'all' ? 1195 : 598) * (demoLot === 'previous' ? 0.88 : 1),
    oeufs: Math.round(row.oeufs * demoFactor),
    mort: Math.round(row.mort * demoFactor),
    aliment_kg: Math.round(row.aliment_kg * demoFactor),
    _feedCost: Number(row.depensesSemaine || 0) * demoFactor,
    _dailyTotal: Number(row.depensesSemaine || 0) * demoFactor,
    depensesSemaine: Number(row.depensesSemaine || 0) * demoFactor,
    totalDepenses: Number(row.totalDepenses || 0) * demoFactor,
    _labor: Number(row._labor || 0) * demoFactor,
    _salary: Number(row._salary || 0) * demoFactor,
    _electricity: Number(row._electricity || 0) * demoFactor,
  })), [demoBuilding, demoFactor, demoLot]);
  const demoSummary = useMemo(() => {
    const original = DEMO_ROWS.find((row) => row.rowType === 'summary');
    if (!original) return null;
    return {
      ...original,
      id: 'demo-summary',
      _weekKey: '2026-10-12',
      mort: Math.round(original.mort * demoFactor),
      oeufs: Math.round(original.oeufs * demoFactor),
      oeufs_cum: Math.round(original.oeufs_cum * demoFactor),
      aliment_kg: Math.round(original.aliment_kg * demoFactor),
      depensesSemaine: original.depensesSemaine * demoFactor,
      totalDepenses: original.totalDepenses * demoFactor,
      ventesSemaine: original.ventesSemaine * demoFactor,
      _sales: original.ventesSemaine * demoFactor,
      _sold: 10000 * demoFactor,
      prixOeuf: original.prixOeuf,
      birds: (demoBuilding === 'all' ? 1195 : 598) * (demoLot === 'previous' ? 0.88 : 1),
      effectif_fin: (demoBuilding === 'all' ? 1195 : 598) * (demoLot === 'previous' ? 0.88 : 1),
    };
  }, [demoBuilding, demoFactor, demoLot]);

  const sourceDays = demoMode ? demoDays : dailyRows;
  const weeks = useMemo(() => [...new Set(sourceDays.map((row) => row._weekKey))].sort(), [sourceDays]);
  const effectivePeriod = period === 'latest' ? (weeks[weeks.length - 1] || 'all') : period;
  const filteredDays = useMemo(() => effectivePeriod === 'all' ? sourceDays : sourceDays.filter((row) => row._weekKey === effectivePeriod), [sourceDays, effectivePeriod]);
  const periods = useMemo(() => [{ key: 'all', label: 'Toute la période' }, ...weeks.map((week) => ({ key: week, label: weekLabel(week) }))], [weeks]);

  const weekSummaries = useMemo(() => {
    if (demoMode) {
      if (!filteredDays.length || !demoSummary) return [];
      return [{ ...demoSummary, date: 'Total semaine · ' + weekLabel('2026-10-12') }];
    }
    const grouped = new Map();
    filteredDays.forEach((row) => {
      const list = grouped.get(row._weekKey) || [];
      list.push(row);
      grouped.set(row._weekKey, list);
    });
    return [...grouped.entries()].map(([key, days]) => {
      const row = aggregateDays(days, 'Total semaine', 'summary');
      const sales = days[0]?._weekSales || { value: 0, quantity: 0 };
      row._weekKey = key;
      row.ventesSemaine = sales.value;
      row._sales = sales.value;
      row._sold = sales.quantity;
      row.prixOeuf = sales.quantity ? sales.value / sales.quantity : null;
      row.weeklyEggPrice = row.prixOeuf;
      row.depensesSemaine = row.cost;
      row.margin = sales.value - row.depensesSemaine;
      row.date = 'Total semaine · ' + weekLabel(key);
      return row;
    });
  }, [demoMode, demoSummary, filteredDays]);

  const monthSummaries = useMemo(() => {
    const groups = new Map();
    filteredDays.forEach((row) => {
      const month = row.dateIso.slice(0, 7);
      const list = groups.get(month) || [];
      list.push(row);
      groups.set(month, list);
    });
    return [...groups.entries()].map(([month, days]) => aggregateDays(days, 'Total mois · ' + new Date(month + '-15T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), 'summary'));
  }, [filteredDays]);

  const periodSummary = useMemo(() => aggregateDays(filteredDays, 'Total période', 'summary'), [filteredDays]);
  const selectedColumns = useMemo(() => {
    const keys = {
      excel: ['mort', 'mort_pct', 'oeufs', 'oeufs_cum', 'ponte_pct', 'formule', 'aliment_kg', 'prix_aliment', 'g_poule', 'g_oeuf', 'poidsOeuf', 'autres', 'autresQuantite', 'autresPrix', 'labor', 'salary', 'electricity', 'depensesSemaine', 'totalDepenses', 'ventesSemaine', 'valeurPoulette', 'prixOeuf'],
      summary: ['birds', 'mort', 'mort_pct', 'oeufs', 'ponte_pct', 'aliment_kg', 'cost', 'sales', 'margin'],
      production: ['birds', 'mort', 'mort_pct', 'cumDead', 'cumDeadRate', 'normal', 'double', 'white', 'broken', 'lost', 'oeufs', 'oeufs_cum', 'cumEggs', 'ponte_pct', 'formule', 'aliment_kg', 'prix_aliment', 'g_poule', 'g_oeuf', 'poidsOeuf', 'eggMass', 'fcr'],
      costs: ['formule', 'aliment_kg', 'prix_aliment', 'feedcost', 'autres', 'autresQuantite', 'autresPrix', 'labor', 'salary', 'electricity', 'depensesSemaine', 'totalDepenses', 'ventesSemaine', 'valeurPoulette', 'prixOeuf', 'costPerEgg', 'margin'],
      full: columns.map((column) => column.key),
    };
    return (keys[view] || keys.excel).map((key) => columns.find((column) => column.key === key)).filter(Boolean);
  }, [columns, view]);

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
  const totalCost = demoMode ? filteredDays.reduce((total, row) => total + Number(row._dailyTotal || 0), 0) : Number(periodSummary?.cost || 0);
  const salesByWeek = new Map(filteredDays.map((row) => [row._weekKey, row._weekSales || { value: 0 }]));
  const totalSales = [...salesByWeek.values()].reduce((total, row) => total + Number(row.value || 0), 0);
  const actualBuildingDays = new Set(data?.rows.filter((row) => {
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
  const expectedBuildingDays = demoMode ? 5 * (demoBuilding === 'all' ? 2 : 1) : coverageDays * selectedBuildings.length;
  const statusName = (selectedLot?.cycle.statut || '').toLowerCase();
  const lotStatus = ['termine', 'terminé', 'cloture', 'clôturé'].includes(statusName) ? 'terminé' : 'en cours';
  const lotName = selectedLot?.cycle.nom_cycle || selectedLot?.cycle.souche || ('Lot #' + (selectedLot?.cycle.id_lot || selectedLot?.cycle.id_cycle));
  const detail = (demoMode ? demoDays : dailyRows).find((row) => row.id === detailId);

  const columnGroups = useMemo(() => selectedColumns.reduce((groups, column) => {
    const last = groups[groups.length - 1];
    if (last && last.key === column.group) last.count += 1;
    else groups.push({ key: column.group, count: 1 });
    return groups;
  }, []), [selectedColumns]);

  const handleExport = () => {
    const exportRows = groupedRows.length ? groupedRows : [];
    const csv = toCsv(exportRows, [{ key: 'date', label: groupBy === 'day' ? 'Date' : groupBy === 'week' ? 'Semaine' : 'Mois', value: (row) => row.date }, ...selectedColumns]);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'suivi-global.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <Box sx={{ pb: 4, minWidth: 0 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 2.5 }}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight={800}>Suivi global</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>Registre de production et de coûts</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button variant="outlined" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Réduire' : 'Agrandir'}</Button>
          <Button variant="contained" onClick={handleExport} disabled={!displayRows.length}>Exporter CSV</Button>
        </Stack>
      </Stack>
      {demoMode ? (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: '1.2fr 1fr 1.5fr 1fr' }, gap: 1.5 }}>
          <FormControl size="small"><Typography variant="caption" color="text.secondary">Lot</Typography>
            <Select value={demoLot} onChange={(event) => { setDemoLot(event.target.value); setPeriod('latest'); }} aria-label="Choisir un lot">
              <MenuItem value="active">Lot Hisex · en cours</MenuItem><MenuItem value="previous">Lot Lohmann · terminé</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small"><Typography variant="caption" color="text.secondary">Bâtiment</Typography>
            <Select value={demoBuilding} onChange={(event) => setDemoBuilding(event.target.value)} aria-label="Choisir un bâtiment">
              <MenuItem value="all">Tous les bâtiments</MenuItem><MenuItem value="1">Bâtiment 1</MenuItem><MenuItem value="2">Bâtiment 2</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small"><Typography variant="caption" color="text.secondary">Période</Typography>
            <Select value={effectivePeriod} onChange={(event) => setPeriod(event.target.value)} aria-label="Choisir une période">
              {periods.map((item) => <MenuItem key={item.key} value={item.key}>{item.label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small"><Typography variant="caption" color="text.secondary">Regroupement</Typography>
            <Select value={groupBy} onChange={(event) => setGroupBy(event.target.value)} aria-label="Regrouper les lignes">
              <MenuItem value="day">Par jour</MenuItem><MenuItem value="week">Par semaine</MenuItem><MenuItem value="month">Par mois</MenuItem>
            </Select>
          </FormControl>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: '1.2fr 1fr 1.5fr 1fr' }, gap: 1.5 }}>
          <FormControl size="small"><Typography variant="caption" color="text.secondary">Lot</Typography>
            <Select value={selectedLot?.key || ''} onChange={(event) => { setLotId(event.target.value); setBuildingId('all'); setPeriod('latest'); }} aria-label="Choisir un lot">
              {lots.map((lot) => <MenuItem key={lot.key} value={lot.key}>{lot.cycle.nom_cycle || lot.cycle.souche || ('Lot #' + lot.cycle.id_cycle)} · {lot.cycle.statut || 'en cours'}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" disabled={!selectedCycles.length}><Typography variant="caption" color="text.secondary">Bâtiment</Typography>
            <Select value={buildingId} onChange={(event) => setBuildingId(event.target.value)} aria-label="Choisir un bâtiment">
              <MenuItem value="all">Tous les bâtiments</MenuItem>
              {selectedCycles.map((cycle) => <MenuItem key={cycle.id_batiment} value={String(cycle.id_batiment)}>{cycle.nom_batiment || 'Bâtiment ' + cycle.id_batiment}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small"><Typography variant="caption" color="text.secondary">Période</Typography>
            <Select value={effectivePeriod} onChange={(event) => setPeriod(event.target.value)} aria-label="Choisir une période">
              {periods.map((item) => <MenuItem key={item.key} value={item.key}>{item.label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small"><Typography variant="caption" color="text.secondary">Regroupement</Typography>
            <Select value={groupBy} onChange={(event) => setGroupBy(event.target.value)} aria-label="Regrouper les lignes">
              <MenuItem value="day">Par jour</MenuItem><MenuItem value="week">Par semaine</MenuItem><MenuItem value="month">Par mois</MenuItem>
            </Select>
          </FormControl>
        </Paper>
      )}
      <Paper variant="outlined" sx={{ px: 1.5, py: 1, mb: 1.5, display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2" fontWeight={700}>{demoMode ? (demoLot === 'active' ? 'Hisex · ' + (demoBuilding === 'all' ? '2 bâtiments' : 'Bâtiment ' + demoBuilding) + ' · 65 semaines' : 'Lohmann · ' + (demoBuilding === 'all' ? '2 bâtiments' : 'Bâtiment ' + demoBuilding) + ' · 66 semaines') : lotName + ' · ' + (buildingId === 'all' ? selectedCycles.length + ' bâtiments' : selectedCycles.find((cycle) => Number(cycle.id_batiment) === Number(buildingId))?.nom_batiment || 'Bâtiment ' + buildingId) + ' · ' + (selectedLot?.cycle.age_semaines || selectedLot?.cycle.semaine_cycle || '—') + ' semaines'}</Typography>
        <Typography variant="body2" color={demoMode || actualBuildingDays >= expectedBuildingDays ? 'success.main' : 'warning.main'}>{demoMode ? (demoBuilding === 'all' ? '10/10' : '5/5') : actualBuildingDays + '/' + expectedBuildingDays} journées bâtiment renseignées</Typography>
      </Paper>
      {demoMode && <Alert severity="warning" sx={{ mb: 2 }}>Aperçu avec des données fictives uniquement. Rien n'a été ajouté à la base de données.</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 2 }}>
        {[
          ['Œufs collectés', fmt(totalEggs), demoMode ? '5 jours sélectionnés' : filteredDays.length + ' jours sélectionnés'],
          ['Taux de ponte', layingRate == null ? '—' : fmt(layingRate, 2) + ' %', 'Moyenne pondérée'],
          ['Coûts de la période', fmtDh(totalCost, 0), 'Aliment et charges affectées'],
          ['Ventes de la période', fmtDh(totalSales, 0), 'Montants facturés · MAD'],
        ].map(([label, value, caption]) => (
          <Paper key={label} variant="outlined" sx={{ p: 1.75, minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">{label}</Typography>
            <Typography variant="h5" fontWeight={800} sx={{ my: 0.5 }}>{value}</Typography>
            <Typography variant="caption" color="text.secondary">{caption}</Typography>
          </Paper>
        ))}
      </Box>
      {loading && !demoMode ? <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress aria-label="Chargement du registre" /></Box>
        : !data && !demoMode ? <Alert severity="info">Aucun lot de production enregistré.</Alert>
          : <>
            <Paper variant="outlined" sx={{ p: 1, mb: 1.5, display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                {[
                  ['excel', 'Registre Excel'], ['summary', 'Synthèse'], ['production', 'Production'], ['costs', 'Coûts & ventes'], ['full', 'Vue complète'],
                ].map(([key, label]) => <Button key={key} size="small" variant={view === key ? 'contained' : 'text'} onClick={() => setView(key)}>{label}</Button>)}
              </Stack>
              <Typography variant="caption" color="text.secondary">{groupedRows.length} lignes · {selectedColumns.length} colonnes · défilement horizontal</Typography>
            </Paper>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: expanded ? 'calc(100vh - 180px)' : '70vh', overflow: 'auto' }}>
              <Table size="small" stickyHeader sx={{ minWidth: view === 'excel' ? 2650 : view === 'full' ? 3500 : 1200, '& td, & th': { borderRight: '1px solid', borderColor: 'divider', whiteSpace: 'nowrap' } }}>
                <TableHead>
                  <TableRow>
                    <TableCell rowSpan={2} sx={{ position: 'sticky', left: 0, zIndex: 5, width: 160, minWidth: 160, maxWidth: 160, bgcolor: 'background.paper' }}>{groupBy === 'day' ? 'Date' : groupBy === 'week' ? 'Semaine' : 'Mois'}</TableCell>
                    {columnGroups.map((group, index) => {
                      const labels = { prod: 'Effectif & ponte', feed: 'Alimentation & poids', misc: 'Autres dépenses', fin: 'Dépenses & ventes' };
                      return <TableCell key={group.key + '-' + index} colSpan={group.count} align="center" sx={{ bgcolor: 'background.paper', fontWeight: 700 }}>{labels[group.key]}</TableCell>;
                    })}
                  </TableRow>
                  <TableRow>{selectedColumns.map((column) => <TableCell key={column.key} sx={{ top: 37, bgcolor: 'background.paper', fontWeight: 700 }}>{column.label}{column.unit && <Typography component="span" variant="caption" color="text.secondary"> · {column.unit}</Typography>}</TableCell>)}</TableRow>
                </TableHead>
                <TableBody>
                  {displayRows.map((row) => {
                    const summary = row.rowType === 'summary';
                    return <TableRow key={row.id} hover sx={{ bgcolor: summary ? 'action.hover' : undefined, '& td': { fontWeight: summary ? 700 : 400 } }}>
                      <TableCell sx={{ position: 'sticky', left: 0, zIndex: 3, width: 160, minWidth: 160, maxWidth: 160, bgcolor: summary ? 'background.default' : 'background.paper', fontWeight: 700 }}>
                        {row.rowType === 'day' ? <Button size="small" onClick={() => setDetailId(row.id)} sx={{ minWidth: 0, p: 0, textTransform: 'none', fontWeight: 700 }}>{row.date}</Button> : row.date}
                      </TableCell>
                      {selectedColumns.map((column) => <TableCell key={column.key} align={['formule', 'autres'].includes(column.key) ? 'left' : 'right'}>{column.value(row)}</TableCell>)}
                    </TableRow>;
                  })}
                  {!displayRows.length && <TableRow><TableCell colSpan={selectedColumns.length + 1} align="center">Aucune donnée pour ces filtres.</TableCell></TableRow>}
                </TableBody>
                {!demoMode && periodSummary && <TableBody><TableRow sx={{ '& td': { fontWeight: 800, bgcolor: 'action.selected' } }}>
                  <TableCell sx={{ position: 'sticky', left: 0, zIndex: 3, width: 160, minWidth: 160, maxWidth: 160, bgcolor: 'background.paper' }}>Total période</TableCell>
                  {selectedColumns.map((column) => <TableCell key={column.key} align="right">{column.value(periodSummary)}</TableCell>)}
                </TableRow></TableBody>}
              </Table>
            </TableContainer>
            {detail && <Paper variant="outlined" sx={{ mt: 1.5, p: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Détail · {detail.date} · {buildingId === 'all' ? 'tous les bâtiments' : selectedCycles.find((cycle) => Number(cycle.id_batiment) === Number(buildingId))?.nom_batiment}</Typography>
                <Button onClick={() => setDetailId('')}>Fermer</Button>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
                {[
                  ['Production', [['Mort', fmt(detail.mort)], ['Oeufs', fmt(detail.oeufs)], ['Cumul du lot', fmt(detail.cumEggs)], ['Poids moyen', fmt(detail.poidsOeuf, 1) + ' g'], ['Effectif restant', fmt(detail.effectif_fin)]]],
                  ['Aliment & autres dépenses', [['Formule', detail.formule], ['Aliment', fmt(detail.aliment_kg, 2) + ' kg'], ['Prix aliment', fmt(detail.prix_aliment, 2) + ' DH/kg'], ['g/poule', fmt(detail.g_poule, 1)], ['g/oeuf', fmt(detail.g_oeuf, 1)], ['Autres', detail.autres]]],
                  ['Dépenses & ventes', [['Main Oeuvre + CNSS', fmtDh(detail._labor)], ['Salaires', fmtDh(detail._salary)], ['Electricité', fmtDh(detail._electricity)], ['Dépenses du jour', fmtDh(detail._dailyTotal)], ['Total dépenses', fmtDh(detail.totalDepenses)], ['Valeur poulette', fmtDh(detail.valeurPoulette)]]],
                ].map(([title, items]) => <Box key={title}>
                  <Typography variant="subtitle2" color="primary" sx={{ mb: 0.5 }}>{title}</Typography>
                  {items.map(([label, value]) => <Stack key={label} direction="row" justifyContent="space-between" gap={1} sx={{ py: 0.4, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="body2" textAlign="right">{value ?? '—'}</Typography>
                  </Stack>)}
                </Box>)}
              </Box>
            </Paper>}
          </>}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>Les filtres mettent à jour les indicateurs et le tableau. Les ventes correspondent aux montants facturés.</Typography>
    </Box>
  );
}

export default GlobalOverviewPage;
