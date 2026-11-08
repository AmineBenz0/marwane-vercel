import ProductionDeferredNotice from './ProductionDeferredNotice';
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
  Dialog, DialogActions, DialogContent, DialogTitle,
  List, ListItem, ListItemText,
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
  FactoryOutlined,
  EventBusyOutlined,
} from '@mui/icons-material';
import DateField from '../../utils/DateField';
import { formatShortDate } from '../../utils/dateFormatting';
import { productionService, batimentService } from '../../services/productionService';
import useNotificationStore from '../../store/notificationStore';
import ProductionForm from './ProductionForm';
import CyclePanel, { CycleWeeklyInsights } from './CyclePanel';
import useBuildingCycles from './useBuildingCycles';
import LotCreateDialog from './LotCreateDialog';
import useProductionView, { localToday, productionLink } from './useProductionView';
import { DailyActivity, DailySectionHeader, StockSummary } from './ProductionViews';
import useProductionStock from './useProductionStock';
import useCorrectionRefresh from '../../components/Corrections/useCorrectionRefresh';
import { EGG_TYPE_LABELS, groupDailyProductions } from '../../utils/dailyProduction';
import { formatVaccineMoney } from '../../utils/vaccineExpenses';

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
  const [vaccineExpenses, setVaccineExpenses] = useState([]);
  const [insightsCycleId, setInsightsCycleId] = useState(null);
  const [batiments, setBatiments] = useState([]);
  const [stockData, setStockData] = useState(null);
  const { selectedDate, setSelectedDate, viewingHistory } = useProductionView();
  const { stock: currentStock, loading: stockLoading, error: stockError, reload: reloadStock } = useProductionStock();
  const [loadError, setLoadError] = useState('');
  const [loadedDay, setLoadedDay] = useState(null);
  const loadRequest = useRef(0);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [savedProduction, setSavedProduction] = useState(null);
  const [editingProduction, setEditingProduction] = useState(null);
  const [preselectedEggType, setPreselectedEggType] = useState('normal');
  const [formTitle, setFormTitle] = useState('');
  const [lotDialogBuildingId, setLotDialogBuildingId] = useState(null);
  const [historyBuildingId, setHistoryBuildingId] = useState(null);

  const selectedBatimentId = Number(id);
  const batiment = batiments.find((item) => Number(item.id_batiment) === selectedBatimentId);
  const dayKey = selectedBatimentId + ':' + selectedDate;
  const cycleState = useBuildingCycles(selectedBatimentId);
  const { reload: reloadCycles } = cycleState;
  const activeCycle = cycleState.cycles.find((cycle) => cycle.statut !== 'termine');
  const today = localToday();

  const loadData = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    setLoadError('');
    try {
      const [batData, stock, productionData, expenses] = await Promise.all([
        batimentService.getBatiments(),
        productionService.getDailyStock(selectedDate),
        productionService.getBuildingProductions(selectedBatimentId),
        productionService.getBuildingVaccineExpenses(selectedBatimentId),
      ]);

      if (request !== loadRequest.current) return;
      setBatiments(batData || []);
      setStockData(stock);
      setLoadedDay(dayKey);
      setProductions(productionData || []);
      setVaccineExpenses(expenses || []);
    } catch (err) {
      if (request !== loadRequest.current) return;
      const message = err?.message || 'Erreur lors du chargement des données du bâtiment';
      setLoadError(message);
      notifyError(message);
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, [dayKey, notifyError, selectedBatimentId, selectedDate]);

  useEffect(() => {
    loadData();
    return () => { loadRequest.current += 1; };
  }, [loadData]);
  const refreshAfterChange = useCallback(() => {
    reloadCycles();
    return loadData();
  }, [loadData, reloadCycles]);
  useCorrectionRefresh(refreshAfterChange);

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

  const buildingHistory = useMemo(() => groupDailyProductions(productions).map((day) => ({
    ...day, vaccineExpenses: vaccineExpenses.filter((expense) => expense.date_charge === day.date),
  })), [productions, vaccineExpenses]);
  const dailyHistory = buildingHistory.filter((day) => day.date <= selectedDate);
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
  const dailyCycle = dailyBuildingStock?.cycle;
  const canAddProduction = batiment?.est_actif !== false && !!dailyCycle;
  // The closing date still belongs to the finished lot for historical lookup.
  const closedToday = selectedDate === today && !activeCycle && dailyCycle?.statut === 'termine';
  const viewingClosingDayEntry = closedToday && viewingHistory && hasProduction;
  const showLotGate = !loadError && batiment && batiment.est_actif !== false
    && ((closedToday && !viewingClosingDayEntry) || (!hasProduction && !canAddProduction));
  const hasFinishedLot = dailyCycle?.statut === 'termine' || cycleState.cycles.some((cycle) => cycle.statut === 'termine');
  const entryCycleId = latestTodayEntry?.id_cycle;
  const dayCycle = entryCycleId != null && entryCycleId !== dailyCycle?.id_cycle
    ? cycleState.cycles.find((cycle) => cycle.id_cycle === entryCycleId)
    : dailyCycle;
  const archivedDay = dayCycle?.statut === 'termine' || (!dailyCycle && hasProduction && hasFinishedLot && !activeCycle);
  const showHistoryReturn = viewingClosingDayEntry
    || (selectedDate !== today && (archivedDay || (hasProduction && !dailyCycle && !activeCycle)));
  const canStartToday = batiment?.est_actif !== false && cycleState.loaded && !activeCycle
    && !dailyCycle && selectedDate === today;
  const openLotDialog = () => setLotDialogBuildingId(selectedBatimentId);
  const openHistory = () => setHistoryBuildingId(selectedBatimentId);
  const closeHistory = () => setHistoryBuildingId(null);
  const onLotCreated = () => {
    setLotDialogBuildingId(null);
    notifySuccess('Lot démarré. Vous pouvez saisir la production de la journée.');
    reloadCycles();
    const currentDate = localToday();
    if (selectedDate === currentDate) loadData();
    else setSelectedDate(currentDate);
    reloadStock();
  };

  const handleAddProduction = () => {
    setEditingProduction(null);
    setPreselectedEggType('normal');
    setFormTitle('Saisir la production');
    setOpenForm(true);
  };

  const handleEdit = (production) => {
    setEditingProduction(production);
    setPreselectedEggType(production.type_oeuf || 'normal');
    setFormTitle('Modifier la saisie');
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
        `Désactiver toute la saisie du ${formatShortDate(day.date)} : ${formatNumber(currentDay.collected)} œufs collectés et ${formatNumber(currentDay.lost)} cassés ?${daily.depenses_vaccins?.length ? ' Les dépenses de vaccins et leurs débits seront aussi annulés.' : ''}`,
      )) return;
      await productionService.deleteDailyProduction({
        id_batiment: day.id_batiment,
        date_production: day.date,
        versions: daily.versions,
        charge_versions: daily.charge_versions || {},
      });
      notifySuccess('Saisie quotidienne désactivée');
      await Promise.all([refreshAfterChange(), reloadStock()]);
    } catch (err) {
      notifyError(err?.message || 'Erreur lors de la désactivation');
    }
  };

  const dailyReady = !loading && !loadError && loadedDay === dayKey;
  const stockContent = (
    <Box component="section" aria-label="Stock actuel" aria-busy={stockLoading}>
      {stockLoading ? <CircularProgress size={24} aria-label="Chargement du stock actuel" /> : stockError ? (
        <Alert severity="error" action={<Button color="inherit" onClick={reloadStock}>Réessayer le stock</Button>}>{stockError}</Alert>
      ) : buildingStock ? <>
        <StockSummary embedded available={buildingStock.available_eggs} reserved={buildingStock.reserved_eggs} physical={buildingStock.physical_eggs} promisedPending={buildingStock.promised_pending_eggs} balanceAfterPromises={buildingStock.balance_after_promises} asOf={currentStock?.date} onViewReservations={() => navigate(`/transactions?view=deferred&stock=reserved&building=${selectedBatimentId}`)} categories={stockCategories} />
        {lowStockCategory && <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>Stock bas sur {lowStockCategory.label} : {formatNumber(lowStockCategory.available_eggs)} œufs disponibles.</Typography>}
        {Number(currentStock?.totals?.unassigned_sold_eggs || 0) > 0 && <Alert severity="warning" sx={{ mt: 2 }}>
          Certaines ventes ne sont pas attribuées à un bâtiment. Elles sont déduites du stock global, mais le stock de ce bâtiment peut être surestimé.
        </Alert>}
      </> : <Alert severity="warning">Stock indisponible pour ce bâtiment.</Alert>}
    </Box>
  );

  return (
    <Box sx={{ pb: 4, minWidth: 0 }}>
      <ProductionDeferredNotice savedProduction={savedProduction} />
      <Box sx={{ mb: 2.5 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(productionLink(null, selectedDate))} sx={{ mb: 1.5 }}>Vue globale</Button>
        <Typography component="h1" variant="h3" fontWeight={800} sx={{ fontSize: { xs: '2rem', md: '2.5rem' }, letterSpacing: '-0.04em', overflowWrap: 'anywhere' }}>
          {batiment?.nom || buildingStock?.nom_batiment || 'Bâtiment'}
        </Typography>
      </Box>
      {(showLotGate || (!batiment && !dailyReady && !loadError)) ? (
        !dailyReady || (!cycleState.loaded && !cycleState.error)
          ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress aria-label="Chargement de la journée" /></Box>
          : cycleState.error ? <Alert severity="error" action={<Button color="inherit" onClick={cycleState.reload}>Réessayer le chargement des lots</Button>}>{cycleState.error}</Alert>
          : <BuildingLotGate
              buildingName={batiment.nom}
              activeCycle={activeCycle}
              hasFinishedLot={hasFinishedLot}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              onStart={openLotDialog}
              onHistory={hasFinishedLot || buildingHistory.length > 0 ? openHistory : undefined}
            />
      ) : <>
      {dailyReady && showHistoryReturn && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => setSelectedDate(today)}>Retour à aujourd’hui</Button>}>
          {archivedDay ? 'Vous consultez une journée d’un lot terminé.' : 'Vous consultez une saisie précédente.'}
        </Alert>
      )}
      <CyclePanel cycleState={cycleState} active={activeCycle} onSelectCycle={setInsightsCycleId}
        stockContent={stockContent}
        actions={<>
        {dailyReady && batiment && canStartToday && <Button variant="contained" startIcon={<AddIcon />} onClick={openLotDialog}>{hasFinishedLot ? 'Démarrer un nouveau lot' : 'Démarrer un lot'}</Button>}
        <Button variant={canStartToday ? 'outlined' : 'contained'} disabled={!dailyReady || !batiment || (!hasProduction && !canAddProduction)} startIcon={hasProduction ? <EditIcon /> : <AddIcon />}
          onClick={() => hasProduction ? handleEdit(latestTodayEntry) : handleAddProduction()}>
          {hasProduction ? 'Modifier la saisie' : 'Saisir la journée'}
        </Button></>} />
      <Card variant="outlined" component="section" aria-label="Journée sélectionnée" aria-busy={!dailyReady} sx={{ borderRadius: 3, minWidth: 0 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <DailySectionHeader title="Journée sélectionnée" selectedDate={selectedDate} onDateChange={setSelectedDate}
            actions={dailyReady && batiment && (hasProduction || canAddProduction) ? <Chip size="small" variant="outlined" color={hasProduction ? 'success' : 'warning'} label={hasProduction ? 'Saisie' : 'À saisir'} /> : null} />
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
      {dailyReady && selectedDay?.vaccineExpenses?.length > 0 && <Card variant="outlined" sx={{ mt: 3, borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={800}>Dépenses – Vaccins</Typography>
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {selectedDay.vaccineExpenses.map((expense) => <Stack key={expense.id_charge} direction="row" justifyContent="space-between" spacing={2}>
              <Box><Typography fontWeight={600}>{expense.nom_vaccin}</Typography>
                <Typography variant="body2" color="text.secondary">{formatDecimal(expense.quantite, 3)} {expense.unite} × {formatVaccineMoney(expense.prix_unitaire)}</Typography>
              </Box>
              <Typography fontWeight={800}>{formatVaccineMoney(expense.montant)}</Typography>
            </Stack>)}
            <Typography fontWeight={900} textAlign="right">Total : {formatVaccineMoney(selectedDay.vaccineExpenses.reduce((sum, expense) => sum + Number(expense.montant), 0))}</Typography>
          </Stack>
        </CardContent>
      </Card>}
      {dailyReady && batiment && <HistoryCard key={selectedBatimentId + '-' + selectedDate} days={dailyHistory} onEdit={handleEdit} onDelete={handleDelete} />}
      <CycleWeeklyInsights cycleId={insightsCycleId} refreshKey={productions} />
      {dailyReady && batiment && <Box sx={{ mt: 3 }}><DailyActivity key={selectedDate} movements={buildingMovements} /></Box>}
      </>}
      {lotDialogBuildingId === selectedBatimentId && batiment && <LotCreateDialog building={batiment} onClose={() => setLotDialogBuildingId(null)} onCreated={onLotCreated} />}
      <Dialog open={historyBuildingId === selectedBatimentId} onClose={closeHistory} maxWidth="sm" fullWidth aria-labelledby="building-history-title">
        <DialogTitle id="building-history-title">Historique des saisies</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary">{batiment?.nom}</Typography>
          {buildingHistory.length ? <List disablePadding>
            {buildingHistory.map((day) => (
              <ListItem key={day.key} disableGutters divider sx={{ gap: 1, flexWrap: 'wrap' }}>
                <ListItemText primary={formatShortDate(day.date)} secondary={formatNumber(day.collected) + ' œufs collectés'} />
                <Button size="small" aria-label={'Consulter la saisie du ' + formatShortDate(day.date)} onClick={() => { closeHistory(); setSelectedDate(day.date, { history: true }); }}>
                  Consulter la saisie
                </Button>
              </ListItem>
            ))}
          </List> : <Typography sx={{ mt: 1 }}>Aucune saisie pour ce bâtiment.</Typography>}
        </DialogContent>
        <DialogActions><Button onClick={closeHistory}>Retour au bâtiment</Button></DialogActions>
      </Dialog>
      {openForm && (
        <ProductionForm
          key={`${selectedBatimentId}-${preselectedEggType}-${formTitle}-${editingProduction?.id_production || 'new'}`}
          open={openForm}
          onClose={() => setOpenForm(false)}
          onSuccess={(result) => { setSavedProduction(result);
            setOpenForm(false);
            refreshAfterChange();
            reloadStock();
          }}
          initialData={editingProduction}
          batiments={batiments}
          preselectedBatimentId={selectedBatimentId}
          preselectedEggType={preselectedEggType}
          preselectedDate={selectedDate}
          title={formTitle}
        />
      )}

    </Box>
  );
}

function BuildingLotGate({ buildingName, activeCycle, hasFinishedLot, selectedDate, setSelectedDate, onStart, onHistory }) {
  const start = activeCycle?.date_debut;
  const beforeStart = start && selectedDate < start;
  const title = activeCycle
    ? (beforeStart ? 'Cette date précède le début du lot' : 'Aucun lot ne couvre cette date')
    : (hasFinishedLot ? 'Le dernier lot est terminé' : 'Aucun lot actif dans ce bâtiment');
  const detail = activeCycle
    ? (beforeStart ? `Le lot a démarré le ${formatShortDate(start)}. Sélectionnez une date à partir du ${formatShortDate(start)}.`
      : 'Sélectionnez une journée couverte par un lot de ce bâtiment.')
    : `Démarrez ${hasFinishedLot ? 'un nouveau lot pour reprendre' : 'un lot pour commencer'} la saisie de production pour ${buildingName}.`;
  return (
    <Card component="section" aria-labelledby="building-lot-gate-title" variant="outlined"
      sx={{ maxWidth: 540, mx: 'auto', mt: { xs: 4, md: 8 }, borderRadius: 3, textAlign: 'center' }}>
      <CardContent sx={{ p: { xs: 2.5, sm: 4 }, '&:last-child': { pb: { xs: 2.5, sm: 4 } } }}>
        <Stack alignItems="center" spacing={1.5}>
          <Box sx={{ display: 'grid', placeItems: 'center', width: 52, height: 52, borderRadius: 3, bgcolor: 'action.selected', color: 'primary.main' }}>
            {activeCycle ? <EventBusyOutlined /> : <FactoryOutlined />}
          </Box>
          <Typography id="building-lot-gate-title" component="h2" variant="h6" fontWeight={800}>{title}</Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 360 }}>{detail}</Typography>
          {activeCycle ? <>
            {start && <Button variant="contained" onClick={() => setSelectedDate(start)}>Aller au début du lot</Button>}
            <DateField label="Autre date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
          </> : <Button variant="contained" startIcon={<AddIcon />} onClick={onStart}>
            {hasFinishedLot ? 'Démarrer un nouveau lot' : 'Démarrer un lot'}
          </Button>}
          {onHistory && <Button size="small" onClick={onHistory}>Voir l’historique</Button>}
        </Stack>
      </CardContent>
    </Card>
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
        {!days.length ? <Typography color="text.secondary">Aucune saisie pour ce bâtiment.</Typography> : <>
          <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Table size="small" aria-label="Saisies quotidiennes" sx={{ minWidth: 690 }}>
              <TableHead><TableRow>{['Date', 'Collectés', 'Cassés', 'Mortalité', 'Aliment', 'Grammage', 'Vaccins', 'Actions'].map((label) => <TableCell key={label} sx={{ textTransform: 'none !important' }}>{label}</TableCell>)}</TableRow></TableHead>
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
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{day.vaccineExpenses?.length ? formatVaccineMoney(day.vaccineExpenses.reduce((sum, expense) => sum + Number(expense.montant), 0)) : '—'}</TableCell>
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
