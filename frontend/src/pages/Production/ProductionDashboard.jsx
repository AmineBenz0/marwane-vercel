import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Stack, Typography } from '@mui/material';
import { Add as AddIcon, ArrowForward as ArrowForwardIcon, Egg as EggIcon, Factory as FactoryIcon, LocalShipping as LocalShippingIcon, TrendingDown as TrendingDownIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { formatShortDate } from '../../utils/dateFormatting';
import { productionService, batimentService } from '../../services/productionService';
import ProductionForm from './ProductionForm';
import useProductionView, { productionLink } from './useProductionView';
import useProductionStock from './useProductionStock';
import { DailySectionHeader, StockSummary } from './ProductionViews';
import useNotificationStore from '../../store/notificationStore';

const formatNumber = (value) => Number(value || 0).toLocaleString('fr-FR');
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
    const stocks = currentStock?.batiments || batiments.map((building) => ({ ...building, nom_batiment: building.nom }));
    return stocks.map((stock) => ({ ...stock, daily: dailyReady ? dailyById.get(Number(stock.id_batiment)) : null }));
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
        <Typography component="h1" variant="h3" fontWeight={900} sx={{ fontSize: { xs: '2rem', md: '3rem' }, letterSpacing: '-0.04em' }}>Production & stock</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>Le stock disponible maintenant, puis le suivi de chaque journée.</Typography>
      </Box>

      <Box component="section" aria-label="Stock actuel" aria-busy={stockLoading}>
        {stockLoading ? <Box sx={{ p: 3 }}><CircularProgress size={24} aria-label="Chargement du stock actuel" /></Box>
          : stockError ? <Alert severity="error" sx={{ mb: 2.5 }} action={<Button color="inherit" onClick={reloadStock}>Réessayer le stock</Button>}>{stockError}</Alert>
          : <StockSummary label="Stock global disponible actuellement" available={currentStock?.totals?.available_eggs} categories={currentStock?.categories} />}
        {!stockLoading && Number(currentStock?.totals?.unassigned_sold_eggs || 0) > 0 && (
          <Alert severity="warning" sx={{ mb: 2.5, borderRadius: 3 }}>
            {formatNumber(currentStock.totals.unassigned_sold_eggs)} œufs vendus sans bâtiment source.
            Ces ventes sont déduites du stock global. Attribuez-les pour fiabiliser le stock de chaque bâtiment.
          </Alert>
        )}
        <Typography component="h2" variant="h6" fontWeight={900} sx={{ mb: 1.5 }}>Par bâtiment</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2, mb: 4 }}>
          {buildingRows.map((building) => (
            <BuildingStockCard key={building.id_batiment} building={building} selectedDate={selectedDate} dailyReady={dailyReady}
              stockReady={!stockLoading && !stockError} dailyError={!!loadError}
              onAddProduction={() => { setSelectedBatimentId(building.id_batiment); setOpenForm(true); }}
              onOpenDetail={() => navigate(productionLink(building.id_batiment, selectedDate))} />
          ))}
        </Box>
      </Box>

      <Box component="section" aria-label="Journée sélectionnée" aria-busy={!dailyReady && !loadError} sx={{ pt: 3, borderTop: '1px solid', borderColor: 'divider' }}>
        <DailySectionHeader selectedDate={selectedDate} onDateChange={setSelectedDate} />
        {loadError ? <Alert severity="error" action={<Button color="inherit" onClick={loadData}>Réessayer la journée</Button>}>{loadError}</Alert>
          : !dailyReady ? <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress aria-label="Chargement de la journée" /></Box>
          : <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 2.5 }}>
              <SummaryCard icon={<FactoryIcon />} label="Bâtiments saisis" value={completed + '/' + (totals.buildings_count || 0)} tone="amber" />
              <SummaryCard icon={<EggIcon />} label="Œufs collectés" value={Number(totals.produced_eggs || 0)} tone="green" />
              <SummaryCard icon={<LocalShippingIcon />} label="Ventes" value={Number(totals.sold_eggs || 0)} tone="blue" />
              <SummaryCard icon={<TrendingDownIcon />} label="Cassés" value={Number(totals.lost_eggs || 0)} tone="red" />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
              <DailyCategoryCard categories={dailyCategories} />
              <MovementCard movements={stockData?.movements || []} />
            </Box>
          </>}
      </Box>

      {openForm && (
        <ProductionForm key={selectedBatimentId} open={openForm} onClose={() => setOpenForm(false)}
          onSuccess={() => { setOpenForm(false); reloadStock(); loadData(); }}
          batiments={batiments} preselectedBatimentId={selectedBatimentId} preselectedDate={selectedDate} />
      )}
    </Box>
  );
}

function BuildingStockCard({ building, selectedDate, dailyReady, stockReady, dailyError, onAddProduction, onOpenDetail }) {
  const entered = !!building.daily?.entries_count;
  const categories = (building.daily?.categories || []).filter((category) => !['casse', 'perdu'].includes(category.type_oeuf));
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, height: '100%', bgcolor: 'background.paper' }}>
      <CardContent sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" justifyContent="space-between" spacing={1}>
          <Typography component="h3" variant="h6" fontWeight={900}>{building.nom_batiment}</Typography>
          {building.est_actif === false && <Typography variant="caption" color="text.secondary">Archivé</Typography>}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Stock disponible actuellement</Typography>
        <Typography variant="h4" fontWeight={900} color={Number(building.available_eggs) < 0 ? 'error.main' : 'primary.main'} sx={{ mt: 0.5 }}>
          {stockReady && building.available_eggs != null ? formatEggs(building.available_eggs) : '—'}
        </Typography>
        {stockReady && building.cycle?.statut !== 'termine' && building.cycle && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {building.cycle.age_semaines} semaines · {formatNumber(building.cycle.effectif_actuel)} volailles restantes
        </Typography>}
        <Divider sx={{ my: 2 }} />
        <Stack direction="row" justifyContent="space-between" spacing={1}>
          <Typography variant="body2" color="text.secondary">Production du {formatShortDate(selectedDate)}</Typography>
          <Typography variant="body2" fontWeight={800}>
            {!dailyReady ? dailyError ? 'Indisponible' : 'Chargement…' : entered ? formatEggs(building.daily.produced_eggs) : 'Non saisie'}
          </Typography>
        </Stack>
        {entered && <Typography variant="caption" color="text.secondary" sx={{ mt: 1, overflowWrap: 'anywhere' }}>
          {categories.map((category) => category.label + ' : ' + formatNumber(category.produced_eggs)).join(' · ')}
        </Typography>}
        <Stack direction="row" spacing={1} sx={{ pt: 2, mt: 'auto' }}>
          {dailyReady && !entered && building.est_actif !== false && <Button variant="contained" startIcon={<AddIcon />} onClick={onAddProduction} size="small" sx={{ flex: 1 }}>Saisir</Button>}
          <Button variant="outlined" endIcon={<ArrowForwardIcon />} onClick={onOpenDetail} size="small" sx={{ flex: 1 }}>Voir le bâtiment</Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ icon, label, value, tone }) {
  const colors = {
    green: { bg: 'rgba(34, 197, 94, 0.1)', color: '#15803d' },
    blue: { bg: 'rgba(14, 165, 233, 0.1)', color: '#0369a1' },
    red: { bg: 'rgba(239, 68, 68, 0.1)', color: '#b91c1c' },
    amber: { bg: 'rgba(245, 158, 11, 0.14)', color: '#b45309' },
  };
  const color = colors[tone];
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
        <Box sx={{ display: 'grid', placeItems: 'center', width: 38, height: 38, flexShrink: 0, borderRadius: 2, bgcolor: color.bg, color: color.color }}>{icon}</Box>
        <Box>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
          <Typography variant="h5" fontWeight={900}>{typeof value === 'number' ? formatEggs(value) : value}</Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

function DailyCategoryCard({ categories }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Typography component="h3" variant="h6" fontWeight={900}>Collecte par type</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Œufs collectés pour cette journée, hors cassés.</Typography>
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {categories.length === 0 ? <Typography color="text.secondary">Aucune collecte saisie pour cette date.</Typography>
            : categories.map((category) => (
              <Stack key={category.key} direction="row" justifyContent="space-between" spacing={2}>
                <Typography>{category.label}</Typography>
                <Typography fontWeight={800}>{formatEggs(category.produced_eggs)}</Typography>
              </Stack>
            ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function MovementCard({ movements }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Typography component="h3" variant="h6" fontWeight={900}>Activité de la journée</Typography>
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {movements.length === 0 ? <Typography color="text.secondary">Aucun mouvement pour cette date.</Typography>
            : movements.map((movement, index) => (
              <Stack key={movement.type + '-' + index} direction="row" spacing={1.5} alignItems="center">
                <Typography variant="caption" color="text.secondary">{movement.time || '--:--'}</Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontWeight={800}>{movement.type === 'loss' ? 'Œufs cassés' : movement.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{movement.nom_batiment ? movement.nom_batiment + ' · ' : ''}{movement.detail}</Typography>
                </Box>
                <Typography fontWeight={800} color={movement.type === 'production' ? 'success.main' : 'text.primary'}>
                  {Number(movement.quantity) > 0 ? '+' : ''}{formatEggs(movement.quantity)}
                </Typography>
              </Stack>
            ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default ProductionDashboard;
