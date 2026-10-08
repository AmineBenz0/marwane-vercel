import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { formatShortDate } from '../../utils/dateFormatting';
import { productionService, batimentService } from '../../services/productionService';
import useNotificationStore from '../../store/notificationStore';
import ProductionForm from './ProductionForm';
import CyclePanel, { CycleWeeklyInsights } from './CyclePanel';
import useProductionView, { productionLink } from './useProductionView';
import { DailyActivity, DailySectionHeader, StockSummary } from './ProductionViews';
import useProductionStock from './useProductionStock';
import { EGG_TYPE_LABELS, groupDailyProductions } from '../../utils/dailyProduction';

const formatNumber = (value) => Number(value || 0).toLocaleString('fr-FR');
const formatDecimal = (value, decimals = 2) => Number(value || 0).toLocaleString('fr-FR', {
  minimumFractionDigits: decimals,
  maximumFractionDigits: decimals,
});

function BatimentProductionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notifySuccess = useNotificationStore((state) => state.success);
  const notifyError = useNotificationStore((state) => state.error);
  const [productions, setProductions] = useState([]);
  const [insightsCycleId, setInsightsCycleId] = useState(null);
  const [batiments, setBatiments] = useState([]);
  const [stockData, setStockData] = useState(null);
  const { selectedDate, setSelectedDate } = useProductionView();
  const { stock: currentStock, loading: stockLoading, error: stockError, reload: reloadStock } = useProductionStock();
  const [loadError, setLoadError] = useState('');
  const [loadedDate, setLoadedDate] = useState(null);
  const loadRequest = useRef(0);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [editingProduction, setEditingProduction] = useState(null);
  const [preselectedEggType, setPreselectedEggType] = useState('normal');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const selectedBatimentId = Number(id);
  const batiment = batiments.find((item) => Number(item.id_batiment) === selectedBatimentId);

  const loadData = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    setLoadError('');
    try {
      const [batData, stock, productionData] = await Promise.all([
        batimentService.getBatiments(),
        productionService.getDailyStock(selectedDate),
        productionService.getBuildingProductions(selectedBatimentId),
      ]);

      if (request !== loadRequest.current) return;
      setBatiments(batData || []);
      setStockData(stock);
      setLoadedDate(selectedDate);
      setProductions(productionData || []);
    } catch (err) {
      if (request !== loadRequest.current) return;
      const message = err?.message || 'Erreur lors du chargement des données du bâtiment';
      setLoadError(message);
      notifyError(message);
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, [notifyError, selectedBatimentId, selectedDate]);

  useEffect(() => {
    loadData();
    return () => { loadRequest.current += 1; };
  }, [loadData]);

  const dailyBuildingStock = useMemo(
    () => (stockData?.batiments || []).find((item) => Number(item.id_batiment) === selectedBatimentId),
    [stockData, selectedBatimentId],
  );
  const buildingStock = useMemo(
    () => (currentStock?.batiments || []).find((item) => Number(item.id_batiment) === selectedBatimentId),
    [currentStock, selectedBatimentId],
  );

  const buildingMovements = useMemo(
    () => (stockData?.movements || []).filter((movement) => Number(movement.id_batiment) === selectedBatimentId),
    [stockData, selectedBatimentId],
  );

  const todayStats = useMemo(() => ({
    produced: Number(dailyBuildingStock?.produced_eggs || 0),
    sold: Number(dailyBuildingStock?.sold_eggs || 0),
    lost: Number(dailyBuildingStock?.lost_eggs || 0),
  }), [dailyBuildingStock]);

  const dailyHistory = useMemo(() => groupDailyProductions(productions).filter((day) => day.date <= selectedDate), [productions, selectedDate]);
  const selectedDay = dailyHistory.find((day) => day.date === selectedDate) || null;
  const latestTodayEntry = selectedDay?.representative || null;
  const stockCategories = (buildingStock?.categories || []).filter((category) => !['casse', 'perdu'].includes(category.type_oeuf));
  const latestGrammage = selectedDay?.grammage != null ? `${formatDecimal(selectedDay.grammage, 1)} g` : '-';
  const latestAliment = selectedDay && dailyBuildingStock?.consommation_aliment_kg != null
    ? `${formatDecimal(dailyBuildingStock.consommation_aliment_kg, 2)} kg`
    : '-';
  const lowStockCategory = stockCategories.find((category) => Number(category.available_eggs || 0) <= 0)
    || stockCategories.find((category) => Number(category.available_eggs || 0) < 200);
  const hasProduction = !!selectedDay;

  const handleAddProduction = () => {
    setEditingProduction(null);
    setPreselectedEggType('normal');
    setFormTitle('Saisir la production');
    setFormDescription('Ajoutez la collecte de ce batiment pour la journee choisie.');
    setOpenForm(true);
  };

  const handleEdit = (production) => {
    setEditingProduction(production);
    setPreselectedEggType(production.type_oeuf || 'normal');
    setFormTitle('Modifier la saisie');
    setFormDescription('Mettez à jour les quantités par type et le grammage global de cette journée.');
    setOpenForm(true);
  };

  const handleDelete = async (day) => {
    try {
      const daily = await productionService.getDailyProduction(day.id_batiment, day.date);
      const currentDay = groupDailyProductions(daily.records)[0];
      if (!currentDay) {
        notifyError('Cette journée a déjà été désactivée.');
        await loadData();
        return;
      }
      if (!window.confirm(
        `Désactiver toute la saisie du ${formatShortDate(day.date)} : ${formatNumber(currentDay.collected)} œufs collectés et ${formatNumber(currentDay.lost)} cassés ?`,
      )) return;
      await productionService.deleteDailyProduction({
        id_batiment: day.id_batiment,
        date_production: day.date,
        versions: daily.versions,
      });
      notifySuccess('Saisie quotidienne désactivée');
      await Promise.all([loadData(), reloadStock()]);
    } catch (err) {
      notifyError(err?.message || 'Erreur lors de la désactivation');
    }
  };

  const dailyReady = !loading && !loadError && loadedDate === selectedDate;
  const stockContent = (
    <Box component="section" aria-label="Stock actuel" aria-busy={stockLoading}>
      {stockLoading ? <CircularProgress size={24} aria-label="Chargement du stock actuel" /> : stockError ? (
        <Alert severity="error" action={<Button color="inherit" onClick={reloadStock}>Réessayer le stock</Button>}>{stockError}</Alert>
      ) : buildingStock ? <>
        <StockSummary embedded label="Stock disponible maintenant" available={buildingStock.available_eggs} categories={stockCategories} />
        {lowStockCategory && <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>Stock bas sur {lowStockCategory.label} : {formatNumber(lowStockCategory.available_eggs)} œufs disponibles.</Typography>}
        {Number(currentStock?.totals?.unassigned_sold_eggs || 0) > 0 && <Alert severity="warning" sx={{ mt: 2 }}>
          Certaines ventes ne sont pas attribuées à un bâtiment. Elles sont déduites du stock global, mais le stock de ce bâtiment peut être surestimé.
        </Alert>}
      </> : <Alert severity="warning">Stock indisponible pour ce bâtiment.</Alert>}
    </Box>
  );

  return (
    <Box sx={{ pb: 4, minWidth: 0 }}>
      <Box sx={{ mb: 2.5 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(productionLink(null, selectedDate))} sx={{ mb: 1.5 }}>Vue globale</Button>
        <Typography component="h1" variant="h3" fontWeight={800} sx={{ fontSize: { xs: '2rem', md: '2.5rem' }, letterSpacing: '-0.04em', overflowWrap: 'anywhere' }}>
          {batiment?.nom || buildingStock?.nom_batiment || 'Bâtiment'}
        </Typography>
      </Box>
      <CyclePanel buildingId={selectedBatimentId} refreshKey={productions} onSelectCycle={setInsightsCycleId}
        stockContent={stockContent} onChange={() => { loadData(); reloadStock(); }} />
      <Card variant="outlined" component="section" aria-label="Journée sélectionnée" aria-busy={!dailyReady} sx={{ borderRadius: 3, minWidth: 0 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <DailySectionHeader title="Journée sélectionnée" selectedDate={selectedDate} onDateChange={setSelectedDate}
            actions={dailyReady && batiment ? <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Chip size="small" variant="outlined" color={hasProduction ? 'success' : 'warning'} label={hasProduction ? 'Saisie' : 'À saisir'} />
              <Button variant="contained" startIcon={hasProduction ? <EditIcon /> : <AddIcon />} onClick={() => hasProduction ? handleEdit(latestTodayEntry) : handleAddProduction()}>
                {hasProduction ? 'Modifier la saisie' : 'Saisir la journée'}
              </Button>
            </Stack> : null} />
          {loadError ? <Alert severity="error" action={<Button color="inherit" onClick={loadData}>Réessayer la journée</Button>}>{loadError}</Alert> : !dailyReady ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress aria-label="Chargement de la journée" /></Box>
          ) : !batiment ? <Alert severity="warning">Bâtiment introuvable.</Alert> : <>
            {Number(dailyBuildingStock?.mortalite || 0) >= 10 && <Alert severity="error" sx={{ mb: 2 }}>Mortalité élevée pour cette journée : {formatNumber(dailyBuildingStock.mortalite)} volailles.</Alert>}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: { xs: 2, md: 4 } }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography component="h3" variant="body1" fontWeight={700}>Collecte du jour</Typography>
                <Typography variant={hasProduction ? 'h4' : 'h6'} fontWeight={800} sx={{ mt: 0.5 }}>{hasProduction ? formatNumber(todayStats.produced) + ' œufs' : 'Production non saisie'}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Hors œufs cassés.</Typography>
                {hasProduction && <Stack spacing={0.75} sx={{ mt: 2 }}>
                  {Object.entries(selectedDay.counts).filter(([type, count]) => !['casse', 'perdu'].includes(type) && count > 0).map(([type, count]) => (
                    <Typography key={type} variant="body2">{EGG_TYPE_LABELS[type] || type} : {formatNumber(count)}</Typography>
                  ))}
                </Stack>}
              </Box>
              <Box component="dl" sx={{ m: 0, minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 2, rowGap: 1 }}>
                <DayFact label="Ventes du jour" value={formatNumber(todayStats.sold) + ' œufs'} />
                <DayFact label="Cassés du jour" value={hasProduction ? formatNumber(todayStats.lost) + ' œufs' : '—'} />
                <DayFact label="Mortalité du jour" value={hasProduction ? formatNumber(dailyBuildingStock?.mortalite || 0) : '—'} />
                <DayFact label="Aliment consommé" value={latestAliment} />
                <DayFact label="Grammage global" value={latestGrammage} />
                <DayFact label="Cartons du jour" value={hasProduction ? formatNumber(selectedDay.cartons) : '—'} />
              </Box>
            </Box>
          </>}
        </CardContent>
      </Card>
      {dailyReady && batiment && <HistoryCard key={selectedBatimentId + '-' + selectedDate} days={dailyHistory} onEdit={handleEdit} onDelete={handleDelete} />}
      <CycleWeeklyInsights cycleId={insightsCycleId} refreshKey={productions} />
      {dailyReady && batiment && <Box sx={{ mt: 3 }}><DailyActivity key={selectedDate} movements={buildingMovements} /></Box>}
      {openForm && (
        <ProductionForm
          key={`${selectedBatimentId}-${preselectedEggType}-${formTitle}-${editingProduction?.id_production || 'new'}`}
          open={openForm}
          onClose={() => setOpenForm(false)}
          onSuccess={() => {
            setOpenForm(false);
            loadData();
            reloadStock();
          }}
          initialData={editingProduction}
          batiments={batiments}
          preselectedBatimentId={selectedBatimentId}
          preselectedEggType={preselectedEggType}
          preselectedDate={selectedDate}
          title={formTitle}
          description={formDescription}
        />
      )}

    </Box>
  );
}

function DayFact({ label, value }) {
  return <>
    <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
    <Typography component="dd" variant="body2" fontWeight={600} sx={{ m: 0, textAlign: 'right' }}>{value}</Typography>
  </>;
}

function HistoryCard({ days, onEdit, onDelete }) {
  const [page, setPage] = useState(0);
  const visiblePage = Math.min(page, Math.max(0, Math.ceil(days.length / 5) - 1));
  return (
    <Card variant="outlined" component="section" aria-label="Historique des saisies" sx={{ mt: 3, borderRadius: 3, minWidth: 0 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography component="h2" variant="h6" fontWeight={800}>Historique des saisies</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>Une ligne par journée, jusqu’à la date consultée.</Typography>
        {!days.length ? <Typography color="text.secondary">Aucune saisie pour ce bâtiment.</Typography> : <>
          <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Table size="small" aria-label="Saisies quotidiennes" sx={{ minWidth: 690 }}>
              <TableHead><TableRow>{['Date', 'Collectés', 'Cassés', 'Mortalité', 'Aliment', 'Grammage', 'Actions'].map((label) => <TableCell key={label} sx={{ textTransform: 'none !important' }}>{label}</TableCell>)}</TableRow></TableHead>
              <TableBody>{days.slice(visiblePage * 5, visiblePage * 5 + 5).map((day) => (
                <TableRow key={day.key}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatShortDate(day.date)}<Typography variant="caption" color="text.secondary" display="block">{formatNumber(day.cartons)} cartons</Typography></TableCell>
                  <TableCell><Typography variant="body2" fontWeight={600}>{formatNumber(day.collected)} œufs</Typography>
                    {Object.entries(day.counts).filter(([type, count]) => !['casse', 'perdu'].includes(type) && count > 0).map(([type, count]) => (
                      <Typography key={type} variant="caption" color="text.secondary" display="block" sx={{ whiteSpace: 'nowrap' }}>{EGG_TYPE_LABELS[type] || type} : {formatNumber(count)}</Typography>
                    ))}
                  </TableCell>
                  <TableCell>{formatNumber(day.lost)}</TableCell>
                  <TableCell>{formatNumber(day.mortality)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{day.rows.some((row) => row.consommation_aliment_kg != null) ? formatDecimal(day.feed) + ' kg' : '—'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{day.grammage != null ? formatDecimal(day.grammage, 1) + ' g' : '—'}</TableCell>
                  <TableCell><Stack direction="row">
                    <IconButton aria-label={'Modifier la journée du ' + formatShortDate(day.date)} size="small" onClick={() => onEdit(day.representative)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton aria-label={'Désactiver la journée du ' + formatShortDate(day.date)} size="small" onClick={() => onDelete(day)}><DeleteIcon fontSize="small" /></IconButton>
                  </Stack></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </TableContainer>
          <TablePagination component="div" count={days.length} page={visiblePage} onPageChange={(_, next) => setPage(next)} rowsPerPage={5} rowsPerPageOptions={[5]} getItemAriaLabel={(type) => type === 'next' ? 'Page suivante' : 'Page précédente'}
            labelDisplayedRows={({ from, to, count }) => from + '–' + to + ' sur ' + count} sx={{ '& .MuiTablePagination-toolbar': { flexWrap: 'wrap' } }} />
        </>}
      </CardContent>
    </Card>
  );
}

export default BatimentProductionPage;
