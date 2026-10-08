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
import { DailySectionHeader, StockSummary } from './ProductionViews';
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
  const totalStats = useMemo(() => ({
    oeufs: dailyHistory.reduce((sum, day) => sum + day.collected, 0),
    cartons: dailyHistory.reduce((sum, day) => sum + day.cartons, 0),
    saisies: dailyHistory.length,
  }), [dailyHistory]);
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

  const header = (
    <Box sx={{ mb: 2.5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(productionLink(null, selectedDate))} variant="outlined" sx={{ borderRadius: 999, width: { xs: '100%', sm: 'auto' } }}>
          Vue globale
        </Button>
      </Stack>
      <Typography component="h1" variant="h3" fontWeight={900} sx={{ fontSize: { xs: '2rem', md: '3rem' }, letterSpacing: '-0.04em', overflowWrap: 'anywhere' }}>
        {batiment?.nom || buildingStock?.nom_batiment || 'Bâtiment'}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1 }}>La collecte du jour et les œufs disponibles de ce bâtiment.</Typography>
    </Box>
  );
  const dailyReady = !loading && !loadError && loadedDate === selectedDate;

  return (
    <Box sx={{ pb: 4, minWidth: 0 }}>
      {header}
      <CyclePanel buildingId={selectedBatimentId} buildingName={batiment?.nom} refreshKey={productions} onSelectCycle={setInsightsCycleId} onChange={() => { loadData(); reloadStock(); }} />
      <Box component="section" aria-label="Stock actuel" aria-busy={stockLoading} sx={{ mb: 3 }}>
        {stockLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress aria-label="Chargement du stock actuel" /></Box>
        ) : stockError ? (
          <Alert severity="error" action={<Button color="inherit" onClick={reloadStock}>Réessayer le stock</Button>}>{stockError}</Alert>
        ) : buildingStock ? (
          <>
            <StockSummary label="Stock disponible actuellement" available={buildingStock.available_eggs} categories={stockCategories} />
            {Number(currentStock?.totals?.unassigned_sold_eggs || 0) > 0 && (
              <Alert severity="warning" sx={{ mt: 2, borderRadius: 3 }}>
                Certaines ventes ne sont pas attribuées à un bâtiment. Elles sont déduites du stock global, mais le stock de ce bâtiment peut être surestimé.
              </Alert>
            )}
            <Box sx={{ mt: 2 }}><AlertStack lowStockCategory={lowStockCategory} /></Box>
          </>
        ) : <Alert severity="warning">Stock indisponible pour ce bâtiment.</Alert>}
      </Box>
      <Box component="section" aria-label="Journée sélectionnée" aria-busy={!dailyReady} sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 3 }}>
        <DailySectionHeader selectedDate={selectedDate} onDateChange={setSelectedDate} />
        {loadError ? (
          <Alert severity="error" action={<Button color="inherit" onClick={loadData}>Réessayer la journée</Button>}>{loadError}</Alert>
        ) : !dailyReady ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress aria-label="Chargement de la journée" /></Box>
        ) : !batiment ? <Alert severity="warning">Bâtiment introuvable.</Alert> : (
          <>
            <AlertStack mortalite={Number(dailyBuildingStock?.mortalite || 0)} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2.5, mb: 2.5 }}>
              <DailyHeroCard hasProduction={hasProduction} todayStats={todayStats} latestEntry={latestTodayEntry} day={selectedDay}
                onAddProduction={handleAddProduction} onEdit={handleEdit} />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
                <QuickFact tone="blue" label="Grammage global du jour" value={latestGrammage} />
                <QuickFact tone="amber" label="Aliment du jour" value={latestAliment} />
                <QuickFact tone="red" label="Mortalité du jour" value={hasProduction ? formatNumber(dailyBuildingStock?.mortalite || 0) : '-'} />
                <QuickFact tone="blue" label="Ventes du jour" value={formatNumber(todayStats.sold) + ' œufs'} />
                <QuickFact tone="red" label="Cassés du jour" value={hasProduction ? formatNumber(todayStats.lost) + ' œufs' : '-'} />
                <QuickFact tone="green" label="Cartons du jour" value={hasProduction ? formatNumber(selectedDay.cartons) : '-'} />
              </Box>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.6fr) minmax(0, 0.9fr)' }, gap: 2.5, alignItems: 'start' }}>
              <HistoryCard days={dailyHistory} onEdit={handleEdit} onDelete={handleDelete} onAddProduction={handleAddProduction} />
              <Stack spacing={2.5}>
                <SummaryHistoryCard totalStats={totalStats} />
                <MovementListCard movements={buildingMovements} />
              </Stack>
            </Box>
          </>
        )}
      </Box>

      <CycleWeeklyInsights cycleId={insightsCycleId} refreshKey={productions} />
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

function DailyHeroCard({
  hasProduction,
  todayStats,
  latestEntry,
  day,
  onAddProduction,
  onEdit,
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 4,
        height: '100%',
        background: hasProduction
          ? 'radial-gradient(circle at top right, rgba(34, 197, 94, 0.16), transparent 18rem), #ffffff'
          : 'radial-gradient(circle at top right, rgba(245, 158, 11, 0.16), transparent 18rem), #fffaf0',
      }}
    >
      <CardContent sx={{ p: { xs: 2.25, md: 3.25 }, height: '100%', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <Box>
          <Chip
            label={hasProduction ? 'Journée saisie' : 'À saisir'}
            color={hasProduction ? 'success' : 'warning'}
            sx={{ mb: 1.5, fontWeight: 950, borderRadius: 2 }}
          />
          <Typography
            variant="h3"
            fontWeight={950}
            sx={{ lineHeight: 1, letterSpacing: '-0.06em', fontSize: { xs: '2rem', md: '2.65rem' } }}
          >
            {hasProduction ? `${formatNumber(todayStats.produced)} œufs produits` : "Production non saisie"}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1.25 }}>
            {hasProduction
              ? 'Collecte vendable du jour, hors œufs cassés.'
              : 'La saisie quotidienne inclut aussi les œufs cassés.'}
          </Typography>
        </Box>

        {latestEntry && (
          <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.72)', border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={900}>Collecte par type</Typography>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              {Object.entries(day.counts).filter(([type, count]) => !['casse', 'perdu'].includes(type) && count > 0).map(([type, count]) => (
                <Chip key={type} label={(EGG_TYPE_LABELS[type] || type) + ' : ' + formatNumber(count)} size="small" sx={{ bgcolor: 'background.paper', fontWeight: 800 }} />
              ))}
            </Stack>
          </Box>
        )}

        <Button
          variant="contained"
          startIcon={hasProduction ? <EditIcon /> : <AddIcon />}
          onClick={() => (hasProduction ? onEdit(latestEntry) : onAddProduction())}
          sx={{ mt: 'auto', borderRadius: 999, minHeight: 48, fontWeight: 950 }}
        >
          {hasProduction ? 'Modifier la production' : 'Saisir la journée'}
        </Button>
      </CardContent>
    </Card>
  );
}

function AlertStack({ mortalite, lowStockCategory }) {
  const alerts = [];
  if (mortalite > 0) {
    alerts.push({
      severity: mortalite >= 10 ? 'error' : 'warning',
      title: mortalite >= 10 ? 'Mortalité élevée pour cette journée' : 'Mortalité déclarée pour cette journée',
      description: `${formatNumber(mortalite)} mortalite(s) enregistree(s) pour ce batiment.`,
    });
  }
  if (lowStockCategory) {
    alerts.push({
      severity: Number(lowStockCategory.available_eggs || 0) <= 0 ? 'error' : 'warning',
      title: `Stock bas sur ${lowStockCategory.label}`,
      description: `Disponible: ${formatNumber(lowStockCategory.available_eggs)} oeufs.`,
    });
  }

  if (alerts.length === 0) return null;

  return (
    <Stack spacing={1.25} sx={{ mb: 2.5 }}>
      {alerts.map((alert) => (
        <Box
          key={`${alert.title}-${alert.description}`}
          sx={{
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr)',
            gap: 1.5,
            p: 1.75,
            borderRadius: 3,
            bgcolor: alert.severity === 'error' ? 'error.50' : 'warning.50',
            border: '1px solid',
            borderColor: alert.severity === 'error' ? 'error.light' : 'warning.light',
          }}
        >
          <Box sx={{ width: 34, height: 34, borderRadius: 999, bgcolor: 'background.paper', display: 'grid', placeItems: 'center', fontWeight: 950 }}>
            {alert.severity === 'error' ? '!' : 'i'}
          </Box>
          <Box>
            <Typography fontWeight={950}>{alert.title}</Typography>
            <Typography color="text.secondary">{alert.description}</Typography>
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

function QuickFact({ label, value, tone = 'default' }) {
  const tones = {
    green: { bgcolor: 'success.50', borderColor: 'success.light' },
    blue: { bgcolor: 'info.50', borderColor: 'info.light' },
    amber: { bgcolor: 'warning.50', borderColor: 'warning.light' },
    red: { bgcolor: 'error.50', borderColor: 'error.light' },
    default: { bgcolor: 'background.paper', borderColor: 'divider' },
  };
  const current = tones[tone] || tones.default;

  return (
    <Box
      sx={{
        p: 2,
        minHeight: 104,
        borderRadius: 3,
        border: '1px solid',
        ...current,
      }}
    >
      <Typography variant="caption" color="text.secondary" fontWeight={950} textTransform="uppercase">
        {label}
      </Typography>
      <Typography
        fontWeight={950}
        sx={{ mt: 0.75, fontSize: { xs: '1.45rem', md: '1.9rem' }, lineHeight: 1, letterSpacing: '-0.05em', overflowWrap: 'anywhere' }}
      >
        {value ?? '-'}
      </Typography>
    </Box>
  );
}

function MovementListCard({ movements }) {
  const config = {
    production: { color: 'success', prefix: '+' },
    sale: { color: 'info', prefix: '-' },
    loss: { color: 'error', prefix: '-' },
    sale_unassigned: { color: 'warning', prefix: '-' },
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 4, minWidth: 0, height: '100%' }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h5" fontWeight={950}>Activité de la journée</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          Collectes, ventes et œufs cassés de ce bâtiment pour cette journée.
        </Typography>
        <Stack spacing={1.25} sx={{ maxHeight: { xs: 340, md: 430 }, overflow: 'auto', pr: 0.25, minWidth: 0 }}>
          {movements.length === 0 ? (
            <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'grey.50' }}>
              <Typography color="text.secondary">Aucun mouvement pour cette date.</Typography>
            </Box>
          ) : movements.map((movement, index) => {
            const current = config[movement.type] || config.production;
            return (
              <Box
                key={`${movement.type}-${movement.time}-${index}`}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' },
                  gap: 1.5,
                  alignItems: 'center',
                  p: 1.75,
                  borderRadius: 3,
                  bgcolor: 'grey.50',
                  minWidth: 0,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={950} sx={{ overflowWrap: 'anywhere' }}>{movement.type === 'loss' ? 'Œufs cassés' : movement.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {movement.time || '--:--'} - {movement.detail || 'Sans detail'}
                  </Typography>
                </Box>
                <Chip
                  color={current.color}
                  label={`${current.prefix}${formatNumber(Math.abs(Number(movement.quantity || 0)))} oeufs`}
                  sx={{ fontWeight: 950, justifySelf: { xs: 'start', sm: 'end' }, maxWidth: '100%' }}
                />
              </Box>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}

function HistoryCard({ days, onEdit, onDelete, onAddProduction }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 4, minWidth: 0 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h5" fontWeight={950}>Historique récent</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          Une carte par journée, avec le détail de la collecte.
        </Typography>

        {days.length === 0 ? (
          <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'grey.50', textAlign: 'center', minWidth: 0 }}>
            <Typography fontWeight={900}>Aucune saisie pour ce batiment</Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75, mb: 1.5 }}>
              Ajoutez la premiere collecte pour commencer le suivi.
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={onAddProduction} sx={{ borderRadius: 999, width: { xs: '100%', sm: 'auto' } }}>
              Nouvelle saisie
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: '1fr' }, gap: 1.25, maxHeight: { xs: 360, md: 430 }, overflow: 'auto', pr: 0.25, minWidth: 0 }}>
            {days.slice(0, 24).map((day) => (
              <Box key={day.key} sx={{ p: 1.75, borderRadius: 3, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" justifyContent="space-between" spacing={1.5} sx={{ minWidth: 0 }}>
                  <Typography fontWeight={950} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    {formatShortDate(day.date)}
                  </Typography>
                  <Stack direction="row" spacing={0.25}>
                    <IconButton aria-label={`Modifier la journée du ${formatShortDate(day.date)}`} size="small" color="primary" onClick={() => onEdit(day.representative)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton aria-label={`Désactiver la journée du ${formatShortDate(day.date)}`} size="small" color="error" onClick={() => onDelete(day)}><DeleteIcon fontSize="small" /></IconButton>
                  </Stack>
                </Stack>
                <Typography fontWeight={950} sx={{ mt: 1 }}>
                  {formatNumber(day.collected)} œufs collectés
                </Typography>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                  {Object.entries(day.counts).filter(([type, count]) => !['casse', 'perdu'].includes(type) && count > 0).map(([type, count]) => (
                    <Chip key={type} label={`${EGG_TYPE_LABELS[type] || type} : ${formatNumber(count)}`} size="small" sx={{ fontWeight: 900, bgcolor: 'background.paper' }} />
                  ))}
                  {day.lost > 0 && <Chip label={`Cassés : ${formatNumber(day.lost)}`} color="error" variant="outlined" size="small" sx={{ fontWeight: 900 }} />}
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Grammage global : {day.grammage != null ? `${formatDecimal(day.grammage, 1)} g` : '-'} · {formatNumber(day.cartons)} cartons
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryHistoryCard({ totalStats }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 4, minWidth: 0, height: '100%' }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h5" fontWeight={950}>Résumé des collectes</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          Collectes enregistrées jusqu’à la date consultée.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))', xl: '1fr' }, gap: 1 }}>
          <Fact label="Total collecté" value={`${formatNumber(totalStats.oeufs)} oeufs`} />
          <Fact label="Cartons" value={totalStats.cartons} />
          <Fact label="Journées saisies" value={totalStats.saisies} />
        </Box>
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: 'grey.50' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
      <Typography fontWeight={900}>{value ?? '-'}</Typography>
    </Box>
  );
}

export default BatimentProductionPage;
