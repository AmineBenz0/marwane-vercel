import DateField from '../../utils/DateField';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
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
import { useNavigate } from 'react-router-dom';
import { productionService, batimentService } from '../../services/productionService';
import ProductionForm from './ProductionForm';
import useNotificationStore from '../../store/notificationStore';

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

function ProductionDashboard() {
  const navigate = useNavigate();
  const notifyError = useNotificationStore((state) => state.error);

  const [stockData, setStockData] = useState(null);
  const [cumulativeStock, setCumulativeStock] = useState(null);
  const [batiments, setBatiments] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [selectedBatimentId, setSelectedBatimentId] = useState('');
  const [selectedEggType, setSelectedEggType] = useState('normal');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [stock, cumulative, batimentData] = await Promise.all([
        productionService.getDailyStock(selectedDate),
        productionService.getStock(selectedDate),
        batimentService.getBatiments(),
      ]);
      setStockData(stock);
      setCumulativeStock(cumulative);
      setBatiments(batimentData || []);
    } catch (err) {
      notifyError(err?.message || "Erreur lors du chargement du stock de production");
    } finally {
      setLoading(false);
    }
  }, [notifyError, selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totals = stockData?.totals || {};
  const cumulativeTotals = cumulativeStock?.totals || {};
  const buildingRows = useMemo(() => {
    const dailyById = new Map((stockData?.batiments || []).map((building) => [building.id_batiment, building]));
    return (cumulativeStock?.batiments || []).map((stock) => ({
      ...stock,
      daily: dailyById.get(stock.id_batiment),
    }));
  }, [stockData, cumulativeStock]);
  const categoryStocks = useMemo(() => (cumulativeStock?.categories || [])
    .filter((category) => !['casse', 'perdu'].includes(category.type_oeuf))
    .map((category) => ({ ...category, key: `${category.type_oeuf}-${category.calibre || 'none'}` })),
  [cumulativeStock]);
  const completedBuildingsCount = Math.max(
    0,
    Number(totals.buildings_count || 0) - Number(totals.missing_buildings_count || 0),
  );

  const handleOpenProduction = (batimentId = '', eggType = 'normal', title = '', description = '') => {
    setSelectedBatimentId(batimentId || '');
    setSelectedEggType(eggType);
    setFormTitle(title);
    setFormDescription(description);
    setOpenForm(true);
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
        onDateChange={setSelectedDate}
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
        <SummaryCard icon={<EggIcon />} label="Production du jour" value={totals.produced_eggs} tone="green" />
        <SummaryCard icon={<InventoryIcon />} label="Stock global cumulé" value={Number(cumulativeTotals.available_eggs || 0)} tone="dark" />
        <SummaryCard icon={<LocalShippingIcon />} label="Ventes du jour" value={totals.sold_eggs} tone="blue" />
        <SummaryCard icon={<TrendingDownIcon />} label="Cassés du jour" value={totals.lost_eggs} tone="red" />
      </Box>

      {Number(cumulativeTotals.unassigned_sold_eggs || 0) > 0 && (
        <Alert severity="warning" sx={{ mb: 2.5, borderRadius: 3 }}>
          {formatNumber(cumulativeTotals.unassigned_sold_eggs)} oeufs vendus sans bâtiment source.
          Ces ventes sont déduites du stock global. Attribuez-les pour fiabiliser le stock de chaque bâtiment.
        </Alert>
      )}

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
            onAddProduction={() => handleOpenProduction(batiment.id_batiment)}
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
          preselectedDate={selectedDate}
          title={formTitle}
          description={formDescription}
        />
      )}

    </Box>
  );
}

function HeroHeader({
  selectedDate,
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
              Stock cumulé des productions et ventes enregistrées jusqu'à la date choisie.
              Les chiffres du jour restent visibles pour suivre la saisie quotidienne.
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
              <DateField
                label="Stock au"

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
      </CardContent>
    </Card>
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

function BuildingStockCard({ batiment, onAddProduction, onOpenDetail }) {
  const status = STATUS_CONFIG[batiment.status] || STATUS_CONFIG.ok;
  const showEmpty = !batiment.daily?.entries_count;
  const canAddProduction = showEmpty && batiment.est_actif !== false;
  const hasDailyAlert = Number(batiment.daily?.mortalite || 0) > 0;

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
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              Stock cumulé
            </Typography>
          </Box>
          <Chip label={batiment.est_actif === false ? 'Archivé' : status.label} color={batiment.est_actif === false ? 'default' : status.color} sx={{ fontWeight: 900, borderRadius: 2 }} />
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
            {formatEggs(batiment.available_eggs)}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {showEmpty ? 'Aucune saisie pour le jour choisi' : `${formatNumber(batiment.daily.produced_eggs)} oeufs produits ce jour`}
          </Typography>
        </Box>

        {hasDailyAlert && (
          <Alert severity="warning" sx={{ mt: 1.5, borderRadius: 2.5 }}>
            Mortalite {formatNumber(batiment.daily?.mortalite || 0)}
          </Alert>
        )}

        <Divider sx={{ my: 1.5 }} />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          {canAddProduction && (
            <Button
              variant="contained"
              onClick={onAddProduction}
              startIcon={<AddIcon />}
              size="small"
              sx={{ borderRadius: 1.75, flex: 1, minHeight: 34, fontSize: '0.85rem', fontWeight: 800, px: 1.25 }}
            >
              Saisir
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
        <Typography variant="h6" fontWeight={900}>Stock global par catégorie</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Cumul de toutes les productions vendables, moins toutes les ventes jusqu'à la date choisie.
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
