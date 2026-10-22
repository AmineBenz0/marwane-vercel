import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, FormControl, MenuItem, Paper, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import { get } from '../../services/api';
import { cycleProductionService, productionService } from '../../services/productionService';

const fmt = (value, digits = 0) => value == null || value === '' || value === '-' ? '-' : Number(value).toLocaleString('fr-FR', { maximumFractionDigits: digits });
const fmtDh = (value) => value == null ? '-' : `${fmt(value, 2)} DH`;
const isoDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
};
const dateFromDisplay = (value) => {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
};
const weekStart = (value) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};
const isMatch = (value, pattern) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(pattern);
const chargeBucket = (charge) => {
  const text = [charge.libelle, charge.categorie].filter(Boolean).join(' ').toLowerCase().replace(/[-'']/g, ' ');
  if (charge.source_journaliere || charge.id_vaccin || isMatch(text, 'vaccin')) return 'vaccine';
  if (isMatch(text, 'main d oeuvre') || isMatch(text, 'main oeuvre') || isMatch(text, 'cnss')) return 'labor';
  if (isMatch(text, 'salaire') || isMatch(text, 'salaires')) return 'salary';
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
const parseRowDate = (row) => dateFromDisplay(row.date);
const toCsv = (rows, cols) => {
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [cols.map((c) => quote(c.label)).join(';'), ...rows.map((row) => cols.map((c) => quote(c.value(row) ?? '')).join(';'))].join('\r\n');
};

function GlobalOverviewPage() {
  const [cycles, setCycles] = useState([]);
  const [cycleId, setCycleId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const cycleRows = await cycleProductionService.getCycles({ skip: 0, limit: 500 });
      const normalized = (cycleRows || []).filter((row) => row.id_cycle).sort((a, b) => String(b.date_debut || '').localeCompare(String(a.date_debut || '')));
      setCycles(normalized);
      const selected = normalized.find((row) => String(row.id_cycle) === String(cycleId)) || normalized[0];
      if (!selected) {
        setData(null);
        setLoading(false);
        return;
      }
      setCycleId(String(selected.id_cycle));
      const endDate = isoDate(selected.date_fin_reelle) || new Date().toISOString().slice(0, 10);
      const startDate = isoDate(selected.date_debut);
      const [performance, charges, transactions, products] = await Promise.all([
        productionService.getPerformance(selected.id_cycle),
        loadPages('/charges', { date_debut: startDate, date_fin: endDate }),
        loadPages('/transactions', { date_debut: startDate, date_fin: endDate, est_actif: true }),
        loadPages('/produits'),
      ]);
      const cycle = performance.cycle || selected;
      const relevantCharges = (charges || []).filter((charge) => (!charge.id_cycle && !charge.id_batiment) || Number(charge.id_cycle) === Number(selected.id_cycle) || Number(charge.id_batiment) === Number(selected.id_batiment));
      setData({ cycle, rows: performance.rows || [], charges: relevantCharges, transactions: transactions || [], products: products || [] });
    } catch (err) {
      setError(err?.message || 'Impossible de charger le registre de production.');
    } finally {
      setLoading(false);
    }
  }, [cycleId, refresh]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const productionRows = data.rows.filter((row) => row.rowType === 'day').map((row) => ({ ...row, dateIso: parseRowDate(row) }));
    const chargesByDate = new Map();
    const chargesByWeek = new Map();
    data.charges.forEach((charge) => {
      const date = isoDate(charge.date_charge);
      if (!date || charge.statut === 'annule') return;
      const bucket = chargeBucket(charge);
      const amount = parseMoney(charge);
      const dateRows = chargesByDate.get(date) || [];
      dateRows.push({ ...charge, _bucket: bucket });
      chargesByDate.set(date, dateRows);
      const key = weekStart(date);
      const week = chargesByWeek.get(key) || { total: 0, other: 0, vaccine: 0, labor: 0, salary: 0, electricity: 0 };
      week.total += amount;
      week[bucket] += amount;
      chargesByWeek.set(key, week);
    });
    const productsById = new Map(data.products.map((product) => [Number(product.id_produit), product]));
    const salesByWeek = new Map();
    const feedPurchasesByWeek = new Map();
    data.transactions.forEach((transaction) => {
      const date = isoDate(transaction.date_transaction);
      if (!date || transaction.est_actif === false) return;
      const product = productsById.get(Number(transaction.id_produit));
      const name = product?.nom_produit || '';
      const key = weekStart(date);
      if (transaction.id_client && isMatch(name, 'oeuf') && (Number(transaction.id_cycle) === Number(data.cycle.id_cycle) || (!transaction.id_cycle && Number(transaction.id_batiment) === Number(data.cycle.id_batiment)))) {
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
    let cumulativeSpend = 0;
    let activeWeek = null;
    let weekRunning = 0;
    const cooked = productionRows.map((row) => {
      const key = weekStart(row.dateIso);
      if (activeWeek !== key) {
        activeWeek = key;
        cumulativeEggs = 0;
        weekRunning = 0;
      }
      cumulativeEggs += Number(row.oeufs || 0);
      const charges = chargesByDate.get(row.dateIso) || [];
      const weekCharges = chargesByWeek.get(key) || { total: 0, other: 0, vaccine: 0, labor: 0, salary: 0, electricity: 0 };
      const sales = salesByWeek.get(key) || { value: 0, quantity: 0 };
      const feedPurchase = feedPurchasesByWeek.get(key);
      const feedPrice = feedPurchase?.quantity ? feedPurchase.amount / feedPurchase.quantity : null;
      const feedCost = feedPrice == null ? null : Number(row.aliment_kg || 0) * feedPrice;
      const dailyCharges = charges.reduce((sum, charge) => sum + parseMoney(charge), 0);
      const dailyTotal = dailyCharges + (feedCost || 0);
      weekRunning += dailyTotal;
      const otherLines = charges.filter((charge) => ['other', 'vaccine'].includes(charge._bucket));
      const otherText = otherLines.map((charge) => `${charge.libelle}: ${fmt(charge.quantite ?? 1, 2)} x ${fmtDh(charge.prix_unitaire ?? charge.montant)}`).join('  |  ');
      return {
        ...row,
        dateIso: row.dateIso,
        oeufs_cum: cumulativeEggs,
        poidsOeuf: row.poids_oeuf,
        autres: otherText || '-',
        autresQuantite: otherLines.map((charge) => charge.quantite ?? 1).join('  |  ') || null,
        autresPrix: otherLines.map((charge) => charge.prix_unitaire ?? charge.montant).join('  |  ') || null,
        prix_aliment: feedPrice,
        _labor: charges.filter((charge) => charge._bucket === 'labor').reduce((sum, charge) => sum + parseMoney(charge), 0),
        _salary: charges.filter((charge) => charge._bucket === 'salary').reduce((sum, charge) => sum + parseMoney(charge), 0),
        _electricity: charges.filter((charge) => charge._bucket === 'electricity').reduce((sum, charge) => sum + parseMoney(charge), 0),
        depensesSemaine: dailyTotal,
        totalDepenses: cumulativeSpend + weekRunning,
        ventesSemaine: null,
        prixOeuf: null,
        valeurPoulette: Number(row.effectif_fin) > 0 ? (cumulativeSpend + weekRunning) / Number(row.effectif_fin) : null,
        _weekKey: key,
        _weekCharges: weekCharges,
        _weekSales: sales,
        _feedCost: feedCost,
        _dailyTotal: dailyTotal,
      };
    });
    let result = [];
    let cursor = 0;
    while (cursor < cooked.length) {
      const key = cooked[cursor]._weekKey;
      const weekRows = [];
      while (cursor < cooked.length && cooked[cursor]._weekKey === key) weekRows.push(cooked[cursor++]);
      const last = weekRows[weekRows.length - 1];
      const feedCost = weekRows.reduce((sum, row) => sum + Number(row._feedCost || 0), 0);
      const weekCost = Number(last._weekCharges.total || 0) + feedCost;
      const birdDays = weekRows.reduce((sum, row) => sum + Number(row.effectif_debut || 0), 0);
      const totalEggs = weekRows.reduce((sum, row) => sum + Number(row.oeufs || 0), 0);
      const totalMort = weekRows.reduce((sum, row) => sum + Number(row.mort || 0), 0);
      const totalFeed = weekRows.reduce((sum, row) => sum + Number(row.aliment_kg || 0), 0);
      const formulas = [...new Set(weekRows.map((row) => row.formule).filter((value) => value && value !== '-'))];
      const weights = weekRows.map((row) => Number(row.poidsOeuf)).filter(Number.isFinite);
      const otherCharges = Number(last._weekCharges.other || 0) + Number(last._weekCharges.vaccine || 0);
      const summary = {
        ...last,
        mort: totalMort,
        mort_pct: last.effectif_debut ? (totalMort / Number(last.effectif_debut) * 100).toFixed(2) : '-',
        oeufs: totalEggs,
        oeufs_cum: totalEggs,
        ponte_pct: birdDays ? (totalEggs / birdDays * 100).toFixed(2) : '-',
        formule: formulas.join(', ') || '-',
        aliment_kg: totalFeed,
        g_poule: birdDays ? (totalFeed * 1000 / birdDays).toFixed(1) : '-',
        g_oeuf: totalEggs ? (totalFeed * 1000 / totalEggs).toFixed(1) : '-',
        poidsOeuf: weights.length ? weights.reduce((sum, weight) => sum + weight, 0) / weights.length : null,
        autres: fmtDh(otherCharges),
        autresQuantite: null,
        autresPrix: null,
        _labor: Number(last._weekCharges.labor || 0),
        _salary: Number(last._weekCharges.salary || 0),
        _electricity: Number(last._weekCharges.electricity || 0),
        rowType: 'summary',
        date: 'Total semaine',
        id: `summary-${key}`,
        _weekRows: weekRows,
        _weekCost: weekCost,
        _weekSales: last._weekSales,
        _weekCharges: last._weekCharges,
        depensesSemaine: weekCost,
        totalDepenses: cumulativeSpend + weekCost,
        ventesSemaine: last._weekSales.value,
        prixOeuf: last._weekSales.quantity ? last._weekSales.value / last._weekSales.quantity : null,
        valeurPoulette: Number(last.effectif_fin) > 0 ? (cumulativeSpend + weekCost) / Number(last.effectif_fin) : null,
      };
      result = result.concat(weekRows, summary);
      cumulativeSpend += weekCost;
    }
    return result;
  }, [data]);
  const displayRows = useMemo(() => rows, [rows]);
  const columns = useMemo(() => [
    { key: 'mort', label: 'Mort', value: (r) => r.mort },
    { key: 'mort_pct', label: '%Mort/j', value: (r) => r.mort_pct },
    { key: 'oeufs', label: 'Ouf/j', value: (r) => r.oeufs },
    { key: 'oeufs_cum', label: 'Ouf cum/j', value: (r) => r.oeufs_cum },
    { key: 'ponte_pct', label: '% ponte', value: (r) => r.ponte_pct },
    { key: 'formule', label: 'Formule', value: (r) => r.formule },
    { key: 'aliment_kg', label: 'Quantit� aliment (kg)', value: (r) => r.aliment_kg },
    { key: 'prix_aliment', label: 'Prix aliment (DH/u)', value: (r) => fmt(r.prix_aliment, 2) },
    { key: 'g_poule', label: 'g/poule', value: (r) => r.g_poule },
    { key: 'g_oeuf', label: 'g/oeuf', value: (r) => r.g_oeuf },
    { key: 'poidsOeuf', label: 'Poids oeuf (g)', value: (r) => fmt(r.poidsOeuf, 1) },
    { key: 'autres', label: 'Autres d�penses', value: (r) => r.autres },
    { key: 'autresQuantite', label: 'Quantit� d�pense', value: (r) => r.autresQuantite },
    { key: 'autresPrix', label: 'Prix d�pense (DH)', value: (r) => r.autresPrix },
    { key: 'labor', label: "Main Oeuvre + CNSS", value: (r) => fmtDh(r._labor) },
    { key: 'salary', label: 'Salaires', value: (r) => fmtDh(r._salary) },
    { key: 'electricity', label: '�lectricit�', value: (r) => fmtDh(r._electricity) },
    { key: 'depensesSemaine', label: 'D�penses semaine', value: (r) => fmtDh(r.depensesSemaine) },
    { key: 'totalDepenses', label: 'Total d�penses', value: (r) => fmtDh(r.totalDepenses) },
    { key: 'ventesSemaine', label: 'Ventes semaine', value: (r) => fmtDh(r.ventesSemaine) },
    { key: 'valeurPoulette', label: 'Valeur poulette*', value: (r) => fmtDh(r.valeurPoulette) },
    { key: 'prixOeuf', label: 'Prix vente moyen oeuf/sem. (DH)', value: (r) => r.prixOeuf == null ? '-' : fmt(r.prixOeuf, 2) },
  ], []);

  const handleExport = () => {
    const csv = toCsv(displayRows, [{ key: 'date', label: 'Date', value: (r) => r.date }, ...columns]);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'suivi-global.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const selectedCycle = cycles.find((cycle) => String(cycle.id_cycle) === String(cycleId));

  return (
    <Box sx={{ pb: 4, minWidth: 0 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 2.5 }}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight={800}>Suivi global</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>Registre quotidien et synth�se hebdomadaire des lots.</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => setRefresh((value) => value + 1)}>Actualiser</Button>
          <Button variant="contained" startIcon={<DownloadIcon />} onClick={handleExport} disabled={!displayRows.length}>Exporter CSV</Button>
        </Stack>
      </Stack>
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="body2" fontWeight={700}>Lot</Typography>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <Select value={cycleId} displayEmpty onChange={(event) => setCycleId(event.target.value)} aria-label="Choisir un lot">
            {cycles.map((cycle) => <MenuItem key={cycle.id_cycle} value={String(cycle.id_cycle)}>{cycle.nom_cycle || cycle.nom_lot || `Lot #${cycle.id_cycle}`}  |  {cycle.date_debut || ''}</MenuItem>)}
          </Select>
        </FormControl>
        {selectedCycle && <Typography variant="body2" color="text.secondary">Effectif initial : {fmt(selectedCycle.effectif_initial)} poules</Typography>}
      </Paper>
      <Alert severity="info" sx={{ mb: 2 }}>
        Les colonnes de charges et ventes utilisent les ecritures enregistrees. Le prix aliment reprend le prix moyen des achats dont le nom contient Aliment ou Feed; le calcul suppose que la quantite achetee est en kg. La valeur poulette est une estimation (depenses cumulees divisees par l effectif restant) a confirmer avec la formule exacte du fichier Excel.
      </Alert>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress aria-label="Chargement du registre" /></Box>
        : !data ? <Alert severity="info">Aucun lot de production enregistr�.</Alert>
          : <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: '70vh', overflow: 'auto' }}>
            <Table size="small" stickyHeader sx={{ minWidth: 2650, '& td, & th': { borderRight: '1px solid', borderColor: 'divider', whiteSpace: 'nowrap' } }}>
              <TableHead>
                <TableRow>
                  <TableCell rowSpan={2} sx={{ position: 'sticky', left: 0, zIndex: 5, minWidth: 145, bgcolor: 'background.paper' }}>Date</TableCell>
                  <TableCell colSpan={5} align="center">Effectif & ponte</TableCell>
                  <TableCell colSpan={6} align="center">Alimentation</TableCell>
                  <TableCell colSpan={3} align="center">Autres d�penses</TableCell>
                  <TableCell colSpan={8} align="center">D�penses & ventes</TableCell>
                </TableRow>
                <TableRow>{columns.map((column) => <TableCell key={column.key} sx={{ top: 37, bgcolor: 'background.paper', fontWeight: 700 }}>{column.label}</TableCell>)}</TableRow>
              </TableHead>
              <TableBody>
                {displayRows.map((row) => {
                  const summary = row.rowType === 'summary';
                  return <TableRow key={row.id} hover sx={{ bgcolor: summary ? 'action.hover' : undefined, '& td': { fontWeight: summary ? 700 : 400 } }}>
                    <TableCell sx={{ position: 'sticky', left: 0, zIndex: 1, bgcolor: summary ? 'action.hover' : 'background.paper', fontWeight: 700 }}>{row.date}</TableCell>
                    {columns.map((column) => <TableCell key={column.key} align={['formule', 'autres', 'poidsOeuf'].includes(column.key) ? 'left' : 'right'}>
                      {summary ? column.value(row) : (['labor', 'salary', 'electricity', 'depensesSemaine', 'totalDepenses', 'ventesSemaine', 'prixOeuf'].includes(column.key) ? '-' : column.value(row))}
                    </TableCell>)}
                  </TableRow>;
                })}
              </TableBody>
            </Table>
          </TableContainer>}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>Faites d�filer horizontalement pour parcourir les colonnes. Les d�penses et ventes hebdomadaires figurent sur la ligne de total semaine.</Typography>
    </Box>
  );
}

export default GlobalOverviewPage;
