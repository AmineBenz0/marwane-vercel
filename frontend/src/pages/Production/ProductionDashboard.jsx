import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowForward as ArrowForwardIcon,
  Egg as EggIcon,
  Factory as FactoryIcon,
  Inventory as InventoryIcon,
  LocalShipping as LocalShippingIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { productionService, batimentService, cycleProductionService } from '../../services/productionService';
import ProductionForm from './ProductionForm';
import useNotification from '../../hooks/useNotification';
import { LOTS_FEATURE_ENABLED } from '../../config/features';

const STATUS_CONFIG = {
  ok: { label: 'OK', color: 'success', tone: '#1f7a4d', bg: 'rgba(31, 122, 77, 0.1)' },
  low: { label: 'Stock bas', color: 'warning', tone: '#b26a00', bg: 'rgba(245, 158, 11, 0.14)' },
  empty: { label: 'Vide', color: 'error', tone: '#b42318', bg: 'rgba(180, 35, 24, 0.1)' },
  missing: { label: 'A saisir', color: 'warning', tone: '#b26a00', bg: 'rgba(245, 158, 11, 0.14)' },
};

const MOVEMENT_CONFIG = {
  production: { color: 'success', prefix: '+' },
  sale: { color: 'error', prefix: '' },
  loss: { color: 'error', prefix: '' },
  sale_unassigned: { color: 'warning', prefix: '' },
};

const formatNumber = (value) => Number(value || 0).toLocaleString('fr-FR');
const formatEggs = (value) => `${formatNumber(value)} oeufs`;
const DEFAULT_LOT_DURATION_WEEKS = 100;
const buildLotName = (dateValue) => `Lot ${dateValue || new Date().toISOString().split('T')[0]}`;

const getLotOverview = (buildings) => {
  const cycles = buildings.map((building) => building.cycle).filter(Boolean);
  const totalBuildings = buildings.length;

  if (cycles.length === 0) {
    return {
      label: 'Aucun lot actif',
      helper: 'Commencez le lot pour activer la saisie quotidienne.',
      color: 'warning',
      hasActiveLot: false,
      activeBuildingsCount: 0,
      totalBuildings,
    };
  }

  const dates = [...new Set(cycles.map((cycle) => cycle.date_debut).filter(Boolean))];
  const names = [...new Set(cycles.map((cycle) => cycle.nom_cycle).filter(Boolean))];
  const sharedName = names[0] || (dates[0] ? `Lot ${dates[0]}` : 'Lot actuel');
  const isSharedLot = dates.length <= 1;
  const allBuildingsCovered = cycles.length === totalBuildings;

  return {
    label: isSharedLot ? sharedName : 'Lots avec dates differentes',
    helper: isSharedLot
      ? ''
      : "À vérifier : les batiments n'ont pas tous la même date de lot.",
    color: isSharedLot && allBuildingsCovered ? 'success' : 'warning',
    hasActiveLot: true,
    activeBuildingsCount: cycles.length,
    totalBuildings,
  };
};

const getCategoryStocks = (buildings) => {
  const byCategory = new Map();

  buildings.forEach((building) => {
    (building.categories || []).forEach((category) => {
      if (category.type_oeuf === 'perdu') return;
      const key = `${category.type_oeuf}-${category.calibre || 'none'}`;
      const existing = byCategory.get(key) || {
        key,
        label: category.label,
        available_eggs: 0,
        produced_eggs: 0,
        sold_eggs: 0,
        lost_eggs: 0,
      };

      existing.available_eggs += Number(category.available_eggs || 0);
      existing.produced_eggs += Number(category.produced_eggs || 0);
      existing.sold_eggs += Number(category.sold_eggs || 0);
      existing.lost_eggs += Number(category.lost_eggs || 0);
      byCategory.set(key, existing);
    });
  });

  return [...byCategory.values()]
    .filter((category) => (
      category.available_eggs !== 0 ||
      category.produced_eggs !== 0 ||
      category.sold_eggs !== 0 ||
      category.lost_eggs !== 0
    ))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
};

const getActionItems = (buildings, totals) => {
  const items = [];
  const missingCycle = buildings.find((building) => !building.cycle);
  const missingProduction = buildings.find((building) => building.cycle && building.entries_count === 0);
  const lowStock = buildings.find((building) => ['low', 'empty'].includes(building.status) && building.entries_count > 0);

  if (missingCycle && buildings.every((building) => !building.cycle)) {
    items.push({
      kind: 'start-lot',
      title: 'Aucun lot actif',
      description: 'Commencez un lot commun pour tous les batiments.',
      buttonLabel: 'Commencer',
    });
  } else if (missingCycle) {
    items.push({
      kind: 'detail',
      id_batiment: missingCycle.id_batiment,
      title: `${missingCycle.nom_batiment}: lot manquant`,
      description: 'Commencez le lot avant la saisie quotidienne.',
      buttonLabel: 'Ouvrir',
    });
  }

  if (missingProduction) {
    items.push({
      kind: 'production',
      id_batiment: missingProduction.id_batiment,
      title: `${missingProduction.nom_batiment}: production a saisir`,
      description: "Aucune production enregistree aujourd'hui.",
      buttonLabel: 'Saisir',
    });
  }

  if (Number(totals.unassigned_sold_eggs || 0) > 0) {
    items.push({
      kind: 'transactions',
      title: 'Ventes non attribuees',
      description: `${formatEggs(totals.unassigned_sold_eggs)} a rattacher a un batiment.`,
      buttonLabel: 'Corriger',
    });
  }

  if (lowStock) {
    items.push({
      kind: 'detail',
      id_batiment: lowStock.id_batiment,
      title: `${lowStock.nom_batiment}: stock à vérifier`,
      description: `Stock disponible: ${formatEggs(lowStock.available_eggs)}.`,
      buttonLabel: 'Voir',
    });
  }

  return items.slice(0, 3);
};

function ProductionDashboard() {
  const navigate = useNavigate();
  const notification = useNotification();

  const [stockData, setStockData] = useState(null);
  const [batiments, setBatiments] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [selectedBatimentId, setSelectedBatimentId] = useState('');
  const [selectedEggType, setSelectedEggType] = useState('normal');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [openLotForm, setOpenLotForm] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [stock, batimentData] = await Promise.all([
        productionService.getDailyStock(selectedDate),
        batimentService.getBatiments(),
      ]);
      setStockData(stock);
      setBatiments(batimentData || []);
    } catch (err) {
      notification.error(err?.message || "Erreur lors du chargement du stock de production");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const totals = stockData?.totals || {};
  const buildingRows = stockData?.batiments || [];
  const lotOverview = useMemo(() => getLotOverview(buildingRows), [buildingRows]);
  const categoryStocks = useMemo(() => getCategoryStocks(buildingRows), [buildingRows]);
  const actionItems = useMemo(
    () => (LOTS_FEATURE_ENABLED ? getActionItems(buildingRows, totals) : []),
    [buildingRows, totals],
  );
  const completedBuildingsCount = Math.max(
    0,
    Number(totals.buildings_count || 0) - Number(totals.missing_buildings_count || 0),
  );
  const selectedDateLabel = useMemo(() => {
    try {
      return format(new Date(selectedDate), 'EEEE dd MMMM yyyy', { locale: fr });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  const handleOpenProduction = (batimentId = '', eggType = 'normal', title = '', description = '') => {
    setSelectedBatimentId(batimentId || '');
    setSelectedEggType(eggType);
    setFormTitle(title);
    setFormDescription(description);
    setOpenForm(true);
  };

  const handleActionItem = (item) => {
    if (item.kind === 'start-lot') {
      if (!LOTS_FEATURE_ENABLED) return;
      setOpenLotForm(true);
      return;
    }
    if (item.kind === 'production') {
      handleOpenProduction(item.id_batiment);
      return;
    }
    if (item.kind === 'transactions') {
      navigate('/transactions');
      return;
    }
    if (item.id_batiment) {
      navigate(`/production/batiment/${item.id_batiment}`);
    }
  };

  const handleCreateSharedLot = async (payload) => {
    const activeBuildings = buildingRows.filter((building) => building.cycle);
    if (activeBuildings.length > 0) {
      notification.warning("Un lot actif existe deja. Terminez le lot actuel avant d'en commencer un nouveau.");
      return;
    }

    try {
      await Promise.all(payload.allocations.map((allocation) => cycleProductionService.createCycle({
        id_batiment: allocation.id_batiment,
        nom_cycle: buildLotName(payload.date_debut),
        souche: payload.souche || null,
        date_debut: payload.date_debut,
        age_depart_semaines: 0,
        effectif_initial: allocation.effectif_initial,
        duree_semaines: DEFAULT_LOT_DURATION_WEEKS,
        notes: payload.notes || null,
      })));
      notification.success('Lot commun commence pour tous les batiments');
      setOpenLotForm(false);
      loadData();
    } catch (err) {
      notification.error(err.response?.data?.detail || 'Erreur lors de la creation du lot commun');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 4 }}>
        <HeroHeader
        selectedDate={selectedDate}
        selectedDateLabel={selectedDateLabel}
        lotOverview={lotOverview}
        actionItems={actionItems}
        onDateChange={setSelectedDate}
        onOpenProduction={() => handleOpenProduction()}
        onOpenLotForm={() => LOTS_FEATURE_ENABLED && setOpenLotForm(true)}
        onActionItem={handleActionItem}
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(5, minmax(0, 1fr))' },
          gap: 2,
          mb: 2.5,
        }}
      >
        <SummaryCard icon={<FactoryIcon />} label="Batiments saisis" value={`${completedBuildingsCount}/${totals.buildings_count || 0}`} tone="amber" />
        <SummaryCard icon={<EggIcon />} label="Oeufs produits aujourd'hui" value={totals.produced_eggs} tone="green" />
        <SummaryCard icon={<InventoryIcon />} label="Oeufs disponibles" value={totals.available_eggs} tone="dark" />
        <SummaryCard icon={<LocalShippingIcon />} label="Oeufs vendus" value={totals.sold_eggs} tone="blue" />
        <SummaryCard icon={<TrendingDownIcon />} label="Oeufs perdus" value={totals.lost_eggs} tone="red" />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
          gap: 2,
          mb: 2.5,
        }}
      >
        {buildingRows.map((batiment) => (
          <BuildingStockCard
            key={batiment.id_batiment}
            batiment={batiment}
            canStartSharedLot={LOTS_FEATURE_ENABLED && !lotOverview.hasActiveLot}
            onAddProduction={() => handleOpenProduction(batiment.id_batiment)}
            onOpenLotForm={() => LOTS_FEATURE_ENABLED && setOpenLotForm(true)}
            onOpenDetail={() => navigate(`/production/batiment/${batiment.id_batiment}`)}
          />
        ))}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(320px, 0.65fr)' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <CategoryStockCard categories={categoryStocks} />
        <MovementCard movements={stockData?.movements || []} />
      </Box>

      {openForm && (
        <ProductionForm
          key={`${selectedBatimentId}-${selectedEggType}-${formTitle}`}
          open={openForm}
          onClose={() => setOpenForm(false)}
          onSuccess={() => {
            setOpenForm(false);
            loadData();
          }}
          batiments={batiments}
          preselectedBatimentId={selectedBatimentId}
          preselectedEggType={selectedEggType}
          title={formTitle}
          description={formDescription}
        />
      )}

      {LOTS_FEATURE_ENABLED && (
        <SharedLotDialog
          open={openLotForm}
          onClose={() => setOpenLotForm(false)}
          onSubmit={handleCreateSharedLot}
          batiments={batiments}
        />
      )}
    </Box>
  );
}

function HeroHeader({
  selectedDate,
  selectedDateLabel,
  lotOverview,
  onDateChange,
}) {
  return (
    <Card
      elevation={0}
      sx={{
        mb: 2.5,
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
        background:
          'radial-gradient(circle at top left, rgba(20, 184, 166, 0.18), transparent 34%), linear-gradient(135deg, #fffdf7 0%, #f7efe1 100%)',
      }}
    >
      <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            alignItems: 'start',
          }}
        >
          <Box>
            <Typography variant="h3" fontWeight={900} sx={{ fontSize: { xs: '2rem', md: '3rem' }, letterSpacing: '-0.04em' }}>
              Production & stock
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 720 }}>
              La page montre les saisies du jour et les stocks en oeufs.
              Les tableaux detailles restent dans chaque batiment.
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) 190px' },
                gap: 1.5,
                alignItems: 'center',
                mt: 2.5,
                maxWidth: 760,
              }}
            >
              {LOTS_FEATURE_ENABLED && (
                <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.72)', border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={900} textTransform="uppercase">
                    Lot actuel
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mt: 0.5 }}>
                    <Typography variant="h6" fontWeight={950}>{lotOverview.label}</Typography>
                    {lotOverview.color !== 'success' && (
                      <Chip label="À vérifier" color={lotOverview.color} size="small" sx={{ fontWeight: 900 }} />
                    )}
                  </Stack>
                  {lotOverview.helper && (
                    <Typography variant="body2" color="text.secondary">{lotOverview.helper}</Typography>
                  )}
                </Box>
              )}
              <TextField
                label="Jour"
                type="date"
                value={selectedDate}
                onChange={(event) => onDateChange(event.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{
                  bgcolor: 'rgba(255,255,255,0.72)',
                  borderRadius: 2,
                  alignSelf: 'center',
                  '& .MuiInputBase-root': { bgcolor: 'rgba(255,255,255,0.72)' },
                }}
              />
            </Box>
          </Box>
        </Box>
        <Typography sx={{ mt: 2, fontWeight: 800, color: 'text.secondary', textTransform: 'capitalize' }}>
          {selectedDateLabel}
        </Typography>
      </CardContent>
    </Card>
  );
}

function SharedLotDialog({ open, onClose, onSubmit, batiments }) {
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    date_debut: today,
    allocations: {},
  });

  useEffect(() => {
    if (open) {
      setForm({
        date_debut: today,
        allocations: batiments.reduce((acc, batiment) => {
          acc[batiment.id_batiment] = '';
          return acc;
        }, {}),
      });
    }
  }, [open, batiments, today]);

  const allocations = batiments.map((batiment) => ({
    id_batiment: batiment.id_batiment,
    nom_batiment: batiment.nom || batiment.nom_batiment,
    effectif_initial: Number(form.allocations[batiment.id_batiment] || 0),
  }));
  const totalEffectif = allocations.reduce((sum, allocation) => sum + allocation.effectif_initial, 0);
  const canSubmit = form.date_debut && batiments.length > 0 && allocations.every((allocation) => allocation.effectif_initial > 0);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateAllocation = (idBatiment, value) => {
    setForm((current) => ({
      ...current,
      allocations: {
        ...current.allocations,
        [idBatiment]: value,
      },
    }));
  };

  const submit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    onSubmit({
      date_debut: form.date_debut,
      souche: null,
      notes: `Lot commun cree depuis Production & stock. Total poussins: ${totalEffectif}.`,
      allocations,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
      <form onSubmit={submit}>
        <DialogTitle fontWeight={950}>Commencer le lot commun</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.25}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
              <TextField label="Nom du lot" value={buildLotName(form.date_debut)} fullWidth disabled />
              <TextField
                label="Date debut"
                type="date"
                value={form.date_debut}
                onChange={(event) => updateField('date_debut', event.target.value)}
                required
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              <TextField label="Duree fixe" value={`${DEFAULT_LOT_DURATION_WEEKS} semaines`} fullWidth disabled />
            </Box>

            <Box>
              <Typography variant="subtitle2" fontWeight={900} sx={{ mb: 1 }}>
                Poules par batiment
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
                {batiments.map((batiment) => (
                  <TextField
                    key={batiment.id_batiment}
                    label={batiment.nom || batiment.nom_batiment}
                    type="number"
                    value={form.allocations[batiment.id_batiment] || ''}
                    onChange={(event) => updateAllocation(batiment.id_batiment, event.target.value)}
                    inputProps={{ min: 1 }}
                    required
                    fullWidth
                  />
                ))}
              </Box>
              <Box
                sx={{
                  mt: 1.5,
                  p: 1.5,
                  borderRadius: 3,
                  bgcolor: 'rgba(20, 184, 166, 0.08)',
                  border: '1px solid',
                  borderColor: 'success.light',
                }}
              >
                <Typography variant="caption" color="text.secondary" fontWeight={900} textTransform="uppercase">
                  Total du lot
                </Typography>
                <Typography fontWeight={950}>
                  {formatNumber(totalEffectif)} poules
                </Typography>
              </Box>
            </Box>

          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} color="inherit">Annuler</Button>
          <Button type="submit" variant="contained" disabled={!canSubmit}>
            Commencer le lot
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function SummaryCard({ icon, label, value, tone }) {
  const colors = {
    green: { bg: 'rgba(34, 197, 94, 0.1)', color: '#15803d' },
    blue: { bg: 'rgba(14, 165, 233, 0.1)', color: '#0369a1' },
    red: { bg: 'rgba(239, 68, 68, 0.1)', color: '#b91c1c' },
    dark: { bg: 'rgba(15, 23, 42, 0.08)', color: '#0f172a' },
    amber: { bg: 'rgba(245, 158, 11, 0.14)', color: '#b45309' },
  };
  const current = colors[tone] || colors.dark;

  return (
    <Card elevation={0} sx={{ flex: 1, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
        <Box sx={{ display: 'grid', placeItems: 'center', width: 42, height: 42, borderRadius: 2, bgcolor: current.bg, color: current.color }}>
          {icon}
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={900} textTransform="uppercase">
            {label}
          </Typography>
          <Typography variant="h5" fontWeight={900}>
            {typeof value === 'number' ? `${formatNumber(value)} oeufs` : value}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

function BuildingStockCard({ batiment, canStartSharedLot, onAddProduction, onOpenLotForm, onOpenDetail }) {
  const status = STATUS_CONFIG[batiment.status] || STATUS_CONFIG.ok;
  const showEmpty = batiment.entries_count === 0;
  const cycle = batiment.cycle;
  const hasDailyAlert = Number(batiment.mortalite || 0) > 0;
  const remainingHens = cycle?.effectif_actuel != null ? formatNumber(cycle.effectif_actuel) : '-';

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 4,
        border: '1px solid',
        borderColor: batiment.status === 'low' || batiment.status === 'missing' ? 'warning.light' : 'divider',
        overflow: 'hidden',
        background: showEmpty
          ? 'linear-gradient(135deg, #fffaf0, #fff7ed)'
          : 'linear-gradient(135deg, #ffffff, #fbf8ef)',
      }}
    >
      <CardContent sx={{ p: { xs: 2, sm: 2.25 } }}>
        <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="flex-start">
          <Box>
            <Typography variant="h5" fontWeight={900}>{batiment.nom_batiment}</Typography>
            {LOTS_FEATURE_ENABLED && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {cycle ? 'Lot actif' : 'Aucun lot actif'}
              </Typography>
            )}
          </Box>
          <Chip label={status.label} color={status.color} sx={{ fontWeight: 900, borderRadius: 2 }} />
        </Stack>

        <Box
          sx={{
            mt: 2.25,
            minHeight: 82,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <Typography variant="h5" fontWeight={950} sx={{ letterSpacing: '-0.04em', lineHeight: 1.08 }}>
            {showEmpty ? 'Production non saisie' : `${formatNumber(batiment.produced_eggs)} oeufs saisis`}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {LOTS_FEATURE_ENABLED
              ? (cycle ? `${remainingHens} poules restantes` : 'Commencez un lot pour activer la saisie.')
              : `${formatNumber(batiment.available_eggs)} oeufs disponibles`}
          </Typography>
        </Box>

        {hasDailyAlert && (
          <Alert severity="warning" sx={{ mt: 1.5, borderRadius: 2.5 }}>
            Mortalite {formatNumber(batiment.mortalite || 0)}
          </Alert>
        )}

        <Divider sx={{ my: 1.5 }} />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          {showEmpty && (cycle || canStartSharedLot) && (
            <Button
              variant="contained"
              onClick={cycle ? onAddProduction : onOpenLotForm}
              startIcon={<AddIcon />}
              size="small"
              sx={{ borderRadius: 1.75, flex: 1, minHeight: 34, fontSize: '0.85rem', fontWeight: 800, px: 1.25 }}
            >
              {cycle ? 'Saisir' : 'Commencer le lot'}
            </Button>
          )}
          <Button
            variant={showEmpty ? 'outlined' : 'contained'}
            onClick={onOpenDetail}
            endIcon={<ArrowForwardIcon />}
            size="small"
            sx={{ borderRadius: 1.75, flex: 1, minHeight: 34, fontSize: '0.85rem', fontWeight: 800, px: 1.25 }}
          >
            Voir le batiment
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function CategoryStockCard({ categories }) {
  return (
    <Card elevation={0} sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Typography variant="h6" fontWeight={900}>Oeufs disponibles par categorie</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Pas de stock carton ici: on garde la lecture en nombre d'oeufs.
        </Typography>
        <Stack spacing={1} sx={{ mt: 2 }}>
          {categories.length === 0 ? (
            <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'grey.50', textAlign: 'center' }}>
              <Typography color="text.secondary">
                Aucune categorie avec stock disponible pour cette date.
              </Typography>
            </Box>
          ) : (
            categories.map((category) => (
              <Box
                key={category.key}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 1.5,
                  alignItems: 'center',
                  p: 1.4,
                  borderRadius: 2.5,
                  bgcolor: category.available_eggs <= 0 ? 'error.50' : 'grey.50',
                }}
              >
                <Box>
                  <Typography fontWeight={900}>{category.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Produit {formatEggs(category.produced_eggs)}
                    {category.sold_eggs > 0 ? ` - vendu ${formatEggs(category.sold_eggs)}` : ''}
                  </Typography>
                </Box>
                <Chip
                  label={formatEggs(category.available_eggs)}
                  color={category.available_eggs <= 0 ? 'error' : 'success'}
                  sx={{ fontWeight: 900 }}
                />
              </Box>
            ))
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function MovementCard({ movements }) {
  return (
    <Card elevation={0} sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Typography variant="h6" fontWeight={900}>Derniers mouvements</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
          Entrees, ventes et pertes du jour.
        </Typography>
        <Stack spacing={1}>
          {movements.length === 0 ? (
            <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'grey.50', textAlign: 'center' }}>
              <Typography color="text.secondary">Aucun mouvement pour cette date.</Typography>
            </Box>
          ) : (
            movements.map((movement, index) => {
              const config = MOVEMENT_CONFIG[movement.type] || MOVEMENT_CONFIG.production;
              return (
                <Box
                  key={`${movement.type}-${movement.time}-${index}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: 1.25,
                    alignItems: 'center',
                    p: 1.25,
                    borderRadius: 2.5,
                    bgcolor: 'grey.50',
                  }}
                >
                  <Typography variant="caption" color="text.secondary" fontWeight={900}>
                    {movement.time || '--:--'}
                  </Typography>
                  <Box>
                    <Typography fontWeight={900}>{movement.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {movement.nom_batiment ? `${movement.nom_batiment} - ` : ''}{movement.detail}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    color={config.color}
                    label={`${movement.quantity > 0 ? config.prefix : ''}${formatNumber(movement.quantity)} oeufs`}
                    sx={{ fontWeight: 900 }}
                  />
                </Box>
              );
            })
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default ProductionDashboard;
