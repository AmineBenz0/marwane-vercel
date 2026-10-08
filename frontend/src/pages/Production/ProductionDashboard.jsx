import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { Add, ChevronRight } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { productionService, batimentService } from '../../services/productionService';
import LotPanel from './LotPanel';
import ProductionForm from './ProductionForm';
import useProductionView, { productionLink } from './useProductionView';
import useProductionStock from './useProductionStock';
import { DailyActivity, DailySectionHeader, StockSummary } from './ProductionViews';
import useNotificationStore from '../../store/notificationStore';

const formatNumber = (value) => value == null ? '—' : Number(value).toLocaleString('fr-FR');
const formatEggs = (value) => formatNumber(value) + ' œufs';

function ProductionDashboard() {
  const navigate = useNavigate();
  const notifyError = useNotificationStore((state) => state.error);
  const { selectedDate, setSelectedDate } = useProductionView();
  const { stock: currentStock, loading: stockLoading, error: stockError, reload: reloadStock } = useProductionStock();
  const [stockData, setStockData] = useState(null);
  const [batiments, setBatiments] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [loadedDate, setLoadedDate] = useState(null);
  const loadRequest = useRef(0);
  const [loading, setLoading] = useState(true);
  const [lotRevision, setLotRevision] = useState(0);
  const [openForm, setOpenForm] = useState(false);
  const [selectedBatimentId, setSelectedBatimentId] = useState('');

  const loadData = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    setLoadError('');
    try {
      const [daily, buildings] = await Promise.all([
        productionService.getDailyStock(selectedDate),
        batimentService.getBatiments(),
      ]);
      if (request !== loadRequest.current) return;
      setStockData(daily);
      setBatiments(buildings || []);
      setLoadedDate(selectedDate);
    } catch (err) {
      if (request !== loadRequest.current) return;
      const message = err?.message || 'Impossible de charger cette journée.';
      setLoadError(message);
      notifyError(message);
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, [notifyError, selectedDate]);
  useEffect(() => {
    loadData();
    return () => { loadRequest.current += 1; };
  }, [loadData]);

  const dailyReady = !loading && !loadError && loadedDate === selectedDate;
  const totals = stockData?.totals || {};
  const buildingRows = useMemo(() => {
    const dailyById = new Map((stockData?.batiments || []).map((building) => [Number(building.id_batiment), building]));
    const stocksById = new Map((currentStock?.batiments || []).map((building) => [Number(building.id_batiment), building]));
    const all = new Map(batiments.map((building) => [Number(building.id_batiment), { ...building, nom_batiment: building.nom }]));
    stocksById.forEach((stock, id) => all.set(id, { ...all.get(id), ...stock }));
    return [...all.values()].map((building) => ({ ...building, daily: dailyReady ? dailyById.get(Number(building.id_batiment)) : null }));
  }, [stockData, currentStock, batiments, dailyReady]);
  const dailyCategories = useMemo(() => {
    const categories = new Map();
    (stockData?.batiments || []).forEach((building) => {
      (building.categories || []).filter((category) => !['casse', 'perdu'].includes(category.type_oeuf)).forEach((category) => {
        const key = category.type_oeuf + '-' + (category.calibre || 'none');
        const previous = categories.get(key);
        categories.set(key, { ...category, key, produced_eggs: Number(previous?.produced_eggs || 0) + Number(category.produced_eggs || 0) });
      });
    });
    return [...categories.values()];
  }, [stockData]);
  const completed = Math.max(0, Number(totals.buildings_count || 0) - Number(totals.missing_buildings_count || 0));

  return (
    <Box sx={{ pb: 4, minWidth: 0 }}>
      <Box sx={{ mb: 3 }}>
        <Typography component="h1" variant="h3" fontWeight={800} sx={{ fontSize: { xs: '2rem', md: '2.5rem' }, letterSpacing: '-0.04em' }}>Production & stock</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>Le lot en cours, le stock disponible et le suivi de vos bâtiments.</Typography>
      </Box>
      <LotPanel buildings={batiments} refreshKey={lotRevision} onChange={() => { reloadStock(); loadData(); }} />
      <Box component="section" aria-label="Stock actuel" aria-busy={stockLoading}>
        {stockLoading ? <Box sx={{ p: 3 }}><CircularProgress size={24} aria-label="Chargement du stock actuel" /></Box>
          : stockError ? <Alert severity="error" sx={{ mb: 2.5 }} action={<Button color="inherit" onClick={reloadStock}>Réessayer le stock</Button>}>{stockError}</Alert>
          : <StockSummary label="Stock disponible maintenant" available={currentStock?.totals?.available_eggs} categories={currentStock?.categories} />}
        {!stockLoading && !stockError && Number(currentStock?.totals?.unassigned_sold_eggs || 0) > 0 && <Alert severity="warning" sx={{ mb: 2.5 }}>
          {formatNumber(currentStock.totals.unassigned_sold_eggs)} œufs vendus sans bâtiment source.
          Ces ventes sont déduites du stock global. Attribuez-les pour fiabiliser le stock de chaque bâtiment.
        </Alert>}
      </Box>
      <Card component="section" aria-label="Journée sélectionnée" variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.5 }, '&:last-child': { pb: { xs: 2, md: 2.5 } } }}>
          <DailySectionHeader title="Suivi des bâtiments" selectedDate={selectedDate} onDateChange={setSelectedDate} />
          {loadError && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={loadData}>Réessayer la journée</Button>}>{loadError}</Alert>}
          <BuildingsOverview buildings={buildingRows} dailyReady={dailyReady} dailyError={!!loadError} stockReady={!stockLoading && !stockError}
            onAdd={(id) => { setSelectedBatimentId(id); setOpenForm(true); }}
            onOpen={(id) => navigate(productionLink(id, selectedDate))} />
          {!dailyReady && !loadError && <Box sx={{ py: 2 }}><CircularProgress size={24} aria-label="Chargement de la journée" /></Box>}
          {dailyReady && <>
            <Box component="section" aria-label="Résumé de la journée" sx={{ mt: 2.5, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ lg: 'center' }}>
                <Typography component="h3" variant="body1" fontWeight={700}>Résumé de la journée</Typography>
                <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
                  {[['Collectés', formatEggs(totals.produced_eggs || 0)], ['Vendus', formatEggs(totals.sold_eggs || 0)], ['Cassés', formatEggs(totals.lost_eggs || 0)], ['Bâtiments saisis', completed + ' / ' + (totals.buildings_count || 0)]].map(([label, value]) => <Box key={label} sx={{ minWidth: 0 }}>
                    <Typography variant="body2" color="text.secondary">{label}</Typography>
                    <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
                  </Box>)}
                </Box>
              </Stack>
            </Box>
            <Stack component="section" aria-label="Collecte par type" direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap sx={{ flexWrap: 'wrap', py: 2.5 }}>
              <Typography component="h3" variant="body1" fontWeight={700}>Collecte par type</Typography>
              {dailyCategories.length === 0 ? <Typography variant="body2" color="text.secondary">Aucune collecte saisie pour cette date.</Typography> :
                dailyCategories.map((category) => <Typography key={category.key} variant="body2">{category.label} : <Box component="span" sx={{ fontWeight: 600 }}>{formatEggs(category.produced_eggs)}</Box></Typography>)}
            </Stack>
            <DailyActivity key={selectedDate} movements={stockData?.movements || []} />
          </>}
        </CardContent>
      </Card>
      {openForm && <ProductionForm key={selectedBatimentId} open={openForm} onClose={() => setOpenForm(false)}
        onSuccess={() => { setOpenForm(false); setLotRevision((old) => old + 1); reloadStock(); loadData(); }}
        batiments={batiments} preselectedBatimentId={selectedBatimentId} preselectedDate={selectedDate} />}
    </Box>
  );
}

function BuildingsOverview({ buildings, dailyReady, dailyError, stockReady, onAdd, onOpen }) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const count = (building) => stockReady && building.cycle && building.cycle.statut !== 'termine'
    ? formatNumber(building.cycle.effectif_actuel) : '—';
  const stock = (building) => stockReady && building.available_eggs != null ? formatEggs(building.available_eggs) : '—';
  const collect = (building) => !dailyReady
    ? <Typography variant="body2" color="text.secondary">{dailyError ? 'Indisponible' : 'Chargement…'}</Typography>
    : building.daily?.entries_count ? <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
      <Typography variant="body2">{formatEggs(building.daily.produced_eggs || 0)}</Typography><Chip label="Saisie" color="success" variant="outlined" size="small" />
    </Stack> : <Typography variant="body2" color={building.est_actif === false ? 'text.secondary' : 'warning.dark'}>{building.est_actif === false ? '—' : 'Non saisie'}</Typography>;
  const actions = (building) => <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
    {dailyReady && !building.daily?.entries_count && building.est_actif !== false && <Button size="small" variant="contained" startIcon={<Add />} onClick={() => onAdd(building.id_batiment)}>Saisir</Button>}
    <Button size="small" endIcon={<ChevronRight />} aria-label={'Voir le bâtiment ' + building.nom_batiment} onClick={() => onOpen(building.id_batiment)}>Voir</Button>
  </Stack>;
  const name = (building) => <Box>
    <Typography component="h3" variant="body1" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{building.nom_batiment}</Typography>
    {building.est_actif === false && <Typography variant="caption" color="text.secondary">Archivé</Typography>}
  </Box>;
  if (!buildings.length) return <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>Aucun bâtiment disponible.</Typography>;
  if (mobile) return <Stack spacing={2} divider={<Divider />}>
    {buildings.map((building) => <Box component="article" aria-label={building.nom_batiment} key={building.id_batiment} sx={{ py: 1 }}>
      {name(building)}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2, my: 1.5 }}>
        <Box><Typography variant="caption" color="text.secondary">Volailles restantes</Typography><Typography fontWeight={600}>{count(building)}</Typography></Box>
        <Box><Typography variant="caption" color="text.secondary">Stock actuel</Typography><Typography fontWeight={600}>{stock(building)}</Typography></Box>
      </Box>
      <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Box><Typography variant="caption" color="text.secondary">Collecte du jour</Typography>{collect(building)}</Box>{actions(building)}
      </Stack>
    </Box>)}
  </Stack>;
  return <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
    <Table size="small" aria-label="Suivi des bâtiments" sx={{ '& td': { verticalAlign: 'middle' } }}>
      <TableHead><TableRow>{['Bâtiment', 'Volailles restantes', 'Stock actuel', 'Collecte du jour', 'Actions'].map((label) => <TableCell key={label} sx={{ textTransform: 'none !important' }}>{label}</TableCell>)}</TableRow></TableHead>
      <TableBody>{buildings.map((building) => <TableRow key={building.id_batiment}>
        <TableCell component="th" scope="row">{name(building)}</TableCell><TableCell>{count(building)}</TableCell>
        <TableCell sx={{ color: Number(building.available_eggs) < 0 && stockReady ? 'error.main' : 'text.primary' }}>{stock(building)}</TableCell>
        <TableCell>{collect(building)}</TableCell><TableCell>{actions(building)}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </TableContainer>;
}

export default ProductionDashboard;
