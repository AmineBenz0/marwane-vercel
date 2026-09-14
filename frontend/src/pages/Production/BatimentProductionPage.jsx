import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { productionService, batimentService } from '../../services/productionService';
import useNotificationStore from '../../store/notificationStore';
import ProductionForm from './ProductionForm';

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
  const [batiments, setBatiments] = useState([]);
  const [stockData, setStockData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [editingProduction, setEditingProduction] = useState(null);
  const [preselectedEggType, setPreselectedEggType] = useState('normal');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const selectedBatimentId = Number(id);
  const batiment = batiments.find((item) => Number(item.id_batiment) === selectedBatimentId);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [batData, stock, productionData] = await Promise.all([
        batimentService.getBatiments(),
        productionService.getDailyStock(selectedDate),
        productionService.getProductions({
          limit: 500,
          id_batiment: selectedBatimentId,
        }),
      ]);

      setBatiments(batData || []);
      setStockData(stock);
      setProductions(productionData || []);
    } catch (err) {
      notifyError('Erreur lors du chargement des donnees du batiment');
    } finally {
      setLoading(false);
    }
  }, [notifyError, selectedBatimentId, selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedDateLabel = useMemo(() => {
    try {
      return format(new Date(selectedDate), 'EEEE dd MMMM yyyy', { locale: fr });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  const buildingStock = useMemo(
    () => (stockData?.batiments || []).find((item) => Number(item.id_batiment) === selectedBatimentId),
    [stockData, selectedBatimentId],
  );

  const buildingMovements = useMemo(
    () => (stockData?.movements || []).filter((movement) => Number(movement.id_batiment) === selectedBatimentId),
    [stockData, selectedBatimentId],
  );

  const todayStats = useMemo(() => ({
    produced: Number(buildingStock?.produced_eggs || 0),
    sold: Number(buildingStock?.sold_eggs || 0),
    lost: Number(buildingStock?.lost_eggs || 0),
    available: Number(buildingStock?.available_eggs || 0),
  }), [buildingStock]);

  const selectedDateProductions = useMemo(
    () => productions.filter((production) => String(production.date_production || '').slice(0, 10) === selectedDate),
    [productions, selectedDate],
  );

  const todayProductionEntries = selectedDateProductions.filter((production) => production.type_oeuf !== 'perdu');
  const latestTodayEntry = todayProductionEntries[0] || null;

  const totalStats = useMemo(() => ({
    oeufs: productions.reduce((sum, item) => sum + (Number(item.nombre_oeufs) || 0), 0),
    cartons: productions.reduce((sum, item) => sum + (Number(item.nombre_cartons) || 0), 0),
    saisies: productions.length,
  }), [productions]);
  const stockCategories = (buildingStock?.categories || []).filter((category) => category.type_oeuf !== 'perdu');
  const latestGrammage = latestTodayEntry?.grammage != null ? `${formatDecimal(latestTodayEntry.grammage, 1)} g` : '-';
  const latestAliment = latestTodayEntry?.consommation_aliment_kg != null
    ? `${formatDecimal(latestTodayEntry.consommation_aliment_kg, 2)} kg`
    : '-';
  const lowStockCategory = stockCategories.find((category) => Number(category.available_eggs || 0) <= 0)
    || stockCategories.find((category) => Number(category.available_eggs || 0) < 200);
  const hasProduction = todayProductionEntries.length > 0;

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
    setFormDescription('Mettez a jour cette saisie pour corriger les totaux du batiment.');
    setOpenForm(true);
  };

  const handleDelete = async (production) => {
    if (!window.confirm('Desactiver cette saisie de production ?')) return;
    try {
      await productionService.deleteProduction(production.id_production);
      notifySuccess('Saisie desactivee');
      loadData();
    } catch (err) {
      notifyError('Erreur lors de la desactivation');
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
    <Box sx={{ pb: 4, minWidth: 0 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2.75 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/production')} variant="outlined" sx={{ borderRadius: 999, width: { xs: '100%', sm: 'auto' } }}>
          Vue globale
        </Button>
        <TextField
          label="Voir la journee du"
          type="date"
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{
            width: { xs: '100%', sm: 210 },
            '& .MuiOutlinedInput-root': { borderRadius: 3, bgcolor: 'background.paper' },
          }}
        />
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.1fr) minmax(360px, 0.9fr)' }, gap: 2.5, mb: 2.5 }}>
        <Card
          variant="outlined"
          sx={{
            borderRadius: 4,
            overflow: 'hidden',
            background: 'radial-gradient(circle at top right, rgba(17, 148, 127, 0.14), transparent 24rem), #fffdf7',
          }}
        >
          <CardContent sx={{ p: { xs: 2.25, md: 3.5 } }}>
            <Typography
              component="h1"
              sx={{
                fontWeight: 950,
                fontSize: { xs: '2.35rem', md: '4.5rem' },
                lineHeight: 0.92,
                letterSpacing: '-0.07em',
                overflowWrap: 'anywhere',
              }}
            >
              {batiment?.nom || 'Batiment'}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1.5, fontSize: { md: '1.1rem' }, maxWidth: 760 }}>
              Saisissez la production du jour et consultez l'historique complet de ce bâtiment.
            </Typography>
          </CardContent>
        </Card>

        <DailyHeroCard
          hasProduction={hasProduction}
          selectedDateLabel={selectedDateLabel}
          todayStats={todayStats}
          latestEntry={latestTodayEntry}
          onAddProduction={handleAddProduction}
          onEdit={handleEdit}
        />
      </Box>

      <AlertStack
        mortalite={Number(buildingStock?.mortalite || 0)}
        lowStockCategory={lowStockCategory}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 2.5 }}>
        <QuickFact tone="blue" label="Grammage moyen" value={latestGrammage} />
        <QuickFact tone="amber" label="Aliment" value={latestAliment} />
        <QuickFact tone="red" label="Mortalite" value={formatNumber(buildingStock?.mortalite || 0)} />
        <QuickFact tone="green" label="Stock disponible" value={`${formatNumber(todayStats.available)} oeufs`} />
      </Box>

      <Box sx={{ display: 'grid', gap: 2.5, minWidth: 0 }}>
        <StockCategoryCard categories={stockCategories} />

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              lg: 'repeat(2, minmax(0, 1fr))',
              xl: 'minmax(0, 0.9fr) minmax(0, 1.15fr) minmax(280px, 0.75fr)',
            },
            gap: 2.5,
            alignItems: 'stretch',
            minWidth: 0,
          }}
        >
          <MovementListCard movements={buildingMovements} />
          <HistoryCard
            productions={productions}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAddProduction={handleAddProduction}
          />
          <SummaryHistoryCard totalStats={totalStats} />
        </Box>
      </Box>

      {openForm && (
        <ProductionForm
          key={`${selectedBatimentId}-${preselectedEggType}-${formTitle}-${editingProduction?.id_production || 'new'}`}
          open={openForm}
          onClose={() => setOpenForm(false)}
          onSuccess={() => {
            setOpenForm(false);
            loadData();
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
  selectedDateLabel,
  todayStats,
  latestEntry,
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
            label={hasProduction ? 'Journee saisie' : 'A saisir'}
            color={hasProduction ? 'success' : 'warning'}
            sx={{ mb: 1.5, fontWeight: 950, borderRadius: 2 }}
          />
          <Typography
            variant="h3"
            fontWeight={950}
            sx={{ lineHeight: 1, letterSpacing: '-0.06em', fontSize: { xs: '2rem', md: '2.65rem' } }}
          >
            {hasProduction ? `${formatNumber(todayStats.produced)} oeufs saisis` : "Production non saisie"}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1.25 }}>
            {hasProduction
              ? 'Les pertes du jour sont incluses dans la meme saisie quotidienne.'
              : 'La saisie quotidienne inclut aussi les oeufs perdus.'}
          </Typography>
          <Typography variant="caption" color="text.secondary" fontWeight={900} sx={{ display: 'block', mt: 1.5, textTransform: 'capitalize' }}>
            {selectedDateLabel}
          </Typography>
        </Box>

        {latestEntry && (
          <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.72)', border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={900} textTransform="uppercase">
              Derniere saisie
            </Typography>
            <Typography fontWeight={950}>
              {formatNumber(latestEntry.nombre_oeufs)} oeufs
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Mortalite {latestEntry.mortalite ?? '-'} - Grammage {latestEntry.grammage ?? '-'} g
            </Typography>
          </Box>
        )}

        <Button
          variant="contained"
          startIcon={hasProduction ? <EditIcon /> : <AddIcon />}
          onClick={() => (hasProduction ? onEdit(latestEntry) : onAddProduction())}
          sx={{ mt: 'auto', borderRadius: 999, minHeight: 48, fontWeight: 950 }}
        >
          {hasProduction ? 'Modifier la production' : "Saisir aujourd'hui"}
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
      title: mortalite >= 10 ? 'Mortalite elevee aujourd’hui' : 'Mortalite declaree aujourd’hui',
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
        {value || '-'}
      </Typography>
    </Box>
  );
}

function StockCategoryCard({ categories }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 4, minWidth: 0 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h5" fontWeight={950}>Stock du batiment</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          Lecture par categories disponibles, uniquement pour ce batiment.
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' },
            gap: 1.25,
            maxHeight: { xs: 360, md: 430 },
            overflow: 'auto',
            pr: 0.25,
            minWidth: 0,
          }}
        >
          {categories.length === 0 ? (
            <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'grey.50', gridColumn: '1 / -1' }}>
              <Typography color="text.secondary">Aucune categorie disponible pour ce batiment.</Typography>
            </Box>
          ) : categories.map((category) => {
            const available = Number(category.available_eggs || 0);
            const tone = available <= 0 ? 'error' : available < 200 ? 'warning' : 'success';
            return (
              <Box
                key={`${category.type_oeuf}-${category.calibre || 'none'}`}
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
                  <Typography fontWeight={950} sx={{ overflowWrap: 'anywhere' }}>{category.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Produit {formatNumber(category.produced_eggs)} oeufs
                    {Number(category.sold_eggs || 0) > 0 ? ` - vendu ${formatNumber(category.sold_eggs)}` : ''}
                    {Number(category.lost_eggs || 0) > 0 ? ` - pertes ${formatNumber(category.lost_eggs)}` : ''}
                  </Typography>
                </Box>
                <Chip
                  color={tone}
                  label={`${formatNumber(available)} oeufs`}
                  sx={{ fontWeight: 950, justifySelf: { xs: 'start', sm: 'end' }, maxWidth: '100%' }}
                />
              </Box>
            );
          })}
        </Box>
      </CardContent>
    </Card>
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
        <Typography variant="h5" fontWeight={950}>Mouvements du jour</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          Production, ventes et pertes attribuees au batiment.
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
                  <Typography fontWeight={950} sx={{ overflowWrap: 'anywhere' }}>{movement.label}</Typography>
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

function HistoryCard({ productions, onEdit, onDelete, onAddProduction }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 4, minWidth: 0, height: '100%' }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h5" fontWeight={950}>Historique recent</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          Dernieres saisies modifiables.
        </Typography>

        {productions.length === 0 ? (
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
            {productions.slice(0, 24).map((production) => (
              <Box key={production.id_production} sx={{ p: 1.75, borderRadius: 3, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" justifyContent="space-between" spacing={1.5} sx={{ minWidth: 0 }}>
                  <Typography fontWeight={950} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    {format(new Date(production.date_production), 'dd MMMM yyyy', { locale: fr })}
                  </Typography>
                  <Stack direction="row" spacing={0.25}>
                    <IconButton size="small" color="primary" onClick={() => onEdit(production)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={() => onDelete(production)}><DeleteIcon fontSize="small" /></IconButton>
                  </Stack>
                </Stack>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                  <Chip label={`${formatNumber(production.nombre_oeufs)} oeufs`} size="small" sx={{ fontWeight: 900, bgcolor: 'background.paper' }} />
                  <Chip label={production.type_oeuf} color={production.type_oeuf === 'normal' ? 'success' : 'warning'} size="small" sx={{ fontWeight: 900 }} />
                  <Chip label={`${production.nombre_cartons} cartons`} size="small" sx={{ fontWeight: 900, bgcolor: 'background.paper' }} />
                </Stack>
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
        <Typography variant="h5" fontWeight={950}>Resume historique</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          Total des saisies enregistrées pour ce bâtiment.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))', xl: '1fr' }, gap: 1 }}>
          <Fact label="Total oeufs" value={`${formatNumber(totalStats.oeufs)} oeufs`} />
          <Fact label="Cartons" value={totalStats.cartons} />
          <Fact label="Saisies" value={totalStats.saisies} />
        </Box>
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: 'grey.50' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
      <Typography fontWeight={900}>{value || '-'}</Typography>
    </Box>
  );
}

export default BatimentProductionPage;
