import React, { useEffect, useMemo, useState } from 'react';
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
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  FileDownload as FileDownloadIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import chargeService from '../../services/chargeService';
import compteBancaireService from '../../services/compteBancaireService';
import useNotification from '../../hooks/useNotification';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import { formatMontant } from '../../utils/formatNumber';

const CATEGORIES = [
  'Fixe (Loyer, Salaire...)',
  'Variable (Électricité, Eau...)',
  'Maintenance / Réparation',
  'Administration',
  'Taxes',
  'Divers',
];

const PERIODS = [
  { value: 'month', label: 'Ce mois' },
  { value: 'today', label: "Aujourd'hui" },
  { value: '30days', label: '30 derniers jours' },
  { value: 'all', label: 'Tout' },
];

const cleanText = (value = '') => (
  value
    .replaceAll('Ã©', 'é')
    .replaceAll('Ã¨', 'è')
    .replaceAll('Ã‰', 'É')
    .replaceAll('Ãª', 'ê')
    .replaceAll('Ã ', 'à')
    .replaceAll('Ã®', 'î')
);

const toDateKey = (date) => format(date, 'yyyy-MM-dd');

const parseDateKey = (value) => new Date(`${value}T00:00:00`);

const formatDate = (value) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parseDateKey(value));
};

const formatExpenseAmount = (value) => `- ${formatMontant(Number(value || 0), { maximumFractionDigits: 0 })}`;

const getPeriodStart = (period) => {
  const today = new Date();
  if (period === 'today') return toDateKey(today);
  if (period === '30days') {
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    return toDateKey(start);
  }
  if (period === 'month') {
    return toDateKey(new Date(today.getFullYear(), today.getMonth(), 1));
  }
  return null;
};

function ChargesList() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const notification = useNotification();

  const [charges, setCharges] = useState([]);
  const [comptes, setComptes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('month');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [formData, setFormData] = useState(getInitialFormData());

  const comptesMap = useMemo(() => {
    const map = new Map();
    comptes.forEach((compte) => {
      map.set(compte.id_compte, compte.nom_banque);
    });
    return map;
  }, [comptes]);

  const categoryOptions = useMemo(() => {
    const values = new Set(CATEGORIES);
    charges.forEach((charge) => {
      if (charge.categorie) values.add(cleanText(charge.categorie));
    });
    return [...values];
  }, [charges]);

  const visibleCharges = useMemo(() => {
    const startKey = getPeriodStart(period);
    const normalizedSearch = search.trim().toLowerCase();

    return charges.filter((charge) => {
      const dateMatches = !startKey || charge.date_charge >= startKey;
      const categoryMatches = categoryFilter === 'all' || cleanText(charge.categorie) === categoryFilter;
      const searchMatches = !normalizedSearch || [
        charge.libelle,
        charge.categorie,
        charge.notes,
        getPaymentSource(charge, comptesMap),
      ].some((value) => cleanText(String(value || '')).toLowerCase().includes(normalizedSearch));

      return dateMatches && categoryMatches && searchMatches;
    });
  }, [charges, period, categoryFilter, search, comptesMap]);

  const monthCharges = useMemo(() => {
    const monthStart = getPeriodStart('month');
    return charges.filter((charge) => charge.date_charge >= monthStart);
  }, [charges]);

  const stats = useMemo(() => {
    const todayKey = toDateKey(new Date());
    const totalMonth = monthCharges.reduce((sum, charge) => sum + Number(charge.montant || 0), 0);
    const totalToday = charges
      .filter((charge) => charge.date_charge === todayKey)
      .reduce((sum, charge) => sum + Number(charge.montant || 0), 0);
    const byCategory = monthCharges.reduce((acc, charge) => {
      const category = cleanText(charge.categorie || 'Divers');
      acc.set(category, (acc.get(category) || 0) + Number(charge.montant || 0));
      return acc;
    }, new Map());
    const biggestCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
    const bankCount = monthCharges.filter((charge) => charge.id_compte).length;

    return {
      totalMonth,
      totalToday,
      countMonth: monthCharges.length,
      biggestCategory,
      bankCount,
      cashCount: monthCharges.length - bankCount,
    };
  }, [charges, monthCharges]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [chargesData, comptesData] = await Promise.all([
        chargeService.getAll({ limit: 1000 }),
        compteBancaireService.getComptes(),
      ]);
      setCharges(chargesData || []);
      setComptes(comptesData || []);
    } catch (err) {
      console.error('Erreur chargement dépenses:', err);
      notification.error('Erreur lors du chargement des dépenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenDialog = (charge = null) => {
    if (charge) {
      setEditingCharge(charge);
      setFormData({
        libelle: charge.libelle || '',
        montant: charge.montant || '',
        date_charge: charge.date_charge || toDateKey(new Date()),
        categorie: cleanText(charge.categorie || 'Divers'),
        notes: charge.notes || '',
        payeDepuis: charge.id_compte ? String(charge.id_compte) : 'caisse',
      });
    } else {
      setEditingCharge(null);
      setFormData(getInitialFormData());
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    if (!submitting) setDialogOpen(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);

    const payload = {
      libelle: formData.libelle.trim(),
      montant: formData.montant,
      date_charge: formData.date_charge,
      categorie: formData.categorie,
      notes: formData.notes.trim() || null,
      id_compte: formData.payeDepuis === 'caisse' ? null : Number(formData.payeDepuis),
    };

    try {
      if (editingCharge) {
        await chargeService.update(editingCharge.id_charge, payload);
        notification.success('Dépense mise à jour');
      } else {
        await chargeService.create(payload);
        notification.success('Dépense enregistrée');
      }
      setDialogOpen(false);
      setEditingCharge(null);
      await fetchData();
    } catch (err) {
      console.error('Erreur soumission dépense:', err);
      notification.error(err?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await chargeService.delete(deleteTarget.id_charge);
      notification.success('Dépense supprimée');
      setDeleteTarget(null);
      await fetchData();
    } catch (err) {
      console.error('Erreur suppression dépense:', err);
      notification.error(err?.message || 'Erreur lors de la suppression');
    }
  };

  const handleExportExcel = () => {
    const rows = visibleCharges.map((charge) => ({
      date_charge: charge.date_charge,
      libelle: charge.libelle,
      categorie: cleanText(charge.categorie),
      paye_depuis: getPaymentSource(charge, comptesMap),
      notes: charge.notes || '',
      montant: Number(charge.montant || 0),
    }));

    exportToExcelAdvanced(
      rows,
      [
        { id: 'date_charge', label: 'Date' },
        { id: 'libelle', label: 'Dépense' },
        { id: 'categorie', label: 'Catégorie' },
        { id: 'paye_depuis', label: 'Payé depuis' },
        { id: 'notes', label: 'Notes' },
        { id: 'montant', label: 'Montant' },
      ],
      `depenses_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}`,
      'Dépenses'
    );
  };

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'flex-start' }}
        spacing={2}
        sx={{ mb: 2.5 }}
      >
        <Box>
          <Typography variant="h4" component="h1" fontWeight={900}>
            Dépenses
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 760 }}>
            Enregistrer les sorties hors achats fournisseurs: loyer, salaire, électricité, réparation, taxes ou divers.
          </Typography>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <Button
            variant="outlined"
            startIcon={!isMobile && <FileDownloadIcon />}
            disabled={loading || visibleCharges.length === 0}
            onClick={handleExportExcel}
          >
            {isMobile ? 'Exporter' : 'Exporter Excel'}
          </Button>
          <Button
            variant="contained"
            startIcon={!isMobile && <AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Nouvelle dépense
          </Button>
        </Stack>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
          gap: 2,
          mb: 2.5,
        }}
      >
        <SummaryCard label="Total du mois" value={formatMontant(stats.totalMonth, { maximumFractionDigits: 0 })} helper={`${stats.countMonth} dépense(s)`} tone="error" />
        <SummaryCard label="Aujourd'hui" value={formatMontant(stats.totalToday, { maximumFractionDigits: 0 })} helper="Sorties enregistrées" tone="warning" />
        <SummaryCard label="Plus grosse catégorie" value={stats.biggestCategory} helper="Sur le mois" tone="primary" />
        <SummaryCard label="Payé depuis" value={`${stats.cashCount} caisse`} helper={`${stats.bankCount} banque(s)`} tone="success" />
      </Box>

      <Card variant="outlined" sx={{ borderRadius: 4, mb: 2.5 }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', lg: 'center' }}>
            <TextField
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une dépense"
              size="small"
              sx={{ flex: 1, minWidth: { lg: 300 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              select
              size="small"
              label="Période"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              sx={{ minWidth: { lg: 180 } }}
            >
              {PERIODS.map((option) => (
                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Catégorie"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              sx={{ minWidth: { lg: 240 } }}
            >
              <MenuItem value="all">Toutes catégories</MenuItem>
              {categoryOptions.map((category) => (
                <MenuItem key={category} value={category}>{category}</MenuItem>
              ))}
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 4 }}>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="h6" fontWeight={900}>Registre des dépenses</Typography>
              <Typography color="text.secondary">
                {visibleCharges.length} dépense(s) affichée(s)
              </Typography>
            </Box>
          </Stack>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : visibleCharges.length === 0 ? (
            <EmptyState hasFilters={Boolean(search || categoryFilter !== 'all' || period !== 'month')} onCreate={() => handleOpenDialog()} />
          ) : isMobile ? (
            <Stack spacing={1.5}>
              {visibleCharges.map((charge) => (
                <ExpenseMobileCard
                  key={charge.id_charge}
                  charge={charge}
                  paymentSource={getPaymentSource(charge, comptesMap)}
                  onEdit={() => handleOpenDialog(charge)}
                  onDelete={() => setDeleteTarget(charge)}
                />
              ))}
            </Stack>
          ) : (
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table sx={{ minWidth: 920 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Dépense</TableCell>
                    <TableCell>Catégorie</TableCell>
                    <TableCell>Payé depuis</TableCell>
                    <TableCell>Notes</TableCell>
                    <TableCell align="right">Montant</TableCell>
                    <TableCell align="right"></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleCharges.map((charge) => (
                    <TableRow key={charge.id_charge} hover>
                      <TableCell>{formatDate(charge.date_charge)}</TableCell>
                      <TableCell sx={{ fontWeight: 900 }}>{charge.libelle}</TableCell>
                      <TableCell>
                        <CategoryChip category={charge.categorie} />
                      </TableCell>
                      <TableCell>{getPaymentSource(charge, comptesMap)}</TableCell>
                      <TableCell sx={{ color: 'text.secondary', maxWidth: 260 }}>
                        {charge.notes || '-'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 900, color: 'error.main', whiteSpace: 'nowrap' }}>
                        {formatExpenseAmount(charge.montant)}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => handleOpenDialog(charge)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => setDeleteTarget(charge)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <ChargeDialog
        open={dialogOpen}
        editingCharge={editingCharge}
        formData={formData}
        setFormData={setFormData}
        comptes={comptes}
        submitting={submitting}
        onClose={handleCloseDialog}
        onSubmit={handleSubmit}
      />

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Supprimer cette dépense ?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            Cette action supprimera aussi la sortie associée dans la caisse ou le compte bancaire.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Annuler</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            Supprimer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function getInitialFormData() {
  return {
    libelle: '',
    montant: '',
    date_charge: toDateKey(new Date()),
    categorie: 'Divers',
    notes: '',
    payeDepuis: 'caisse',
  };
}

function getPaymentSource(charge, comptesMap) {
  if (!charge.id_compte) return 'Caisse';
  return comptesMap.get(charge.id_compte) || `Compte #${charge.id_compte}`;
}

function getCategoryColor(category) {
  const cleanCategory = cleanText(category || '');
  if (cleanCategory.startsWith('Fixe')) return 'warning';
  if (cleanCategory.startsWith('Variable')) return 'info';
  if (cleanCategory.startsWith('Maintenance')) return 'error';
  if (cleanCategory.startsWith('Administration')) return 'success';
  if (cleanCategory.startsWith('Taxes')) return 'secondary';
  return 'default';
}

function SummaryCard({ label, value, helper, tone }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 4, height: '100%' }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary" fontWeight={900}>
          {label}
        </Typography>
        <Typography fontWeight={900} fontSize="1.5rem" sx={{ mt: 1, color: `${tone}.main`, lineHeight: 1.15 }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          {helper}
        </Typography>
      </CardContent>
    </Card>
  );
}

function CategoryChip({ category }) {
  return (
    <Chip
      label={cleanText(category || 'Divers')}
      size="small"
      color={getCategoryColor(category)}
      variant="outlined"
      sx={{ fontWeight: 800 }}
    />
  );
}

function ExpenseMobileCard({ charge, paymentSource, onEdit, onDelete }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="flex-start">
          <Box>
            <Typography fontWeight={900}>{charge.libelle}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {formatDate(charge.date_charge)} · {paymentSource}
            </Typography>
          </Box>
          <Typography fontWeight={900} color="error.main" sx={{ whiteSpace: 'nowrap' }}>
            {formatExpenseAmount(charge.montant)}
          </Typography>
        </Stack>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5} sx={{ mt: 1.5 }}>
          <CategoryChip category={charge.categorie} />
          <Box>
            <IconButton size="small" onClick={onEdit}>
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" color="error" onClick={onDelete}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        </Stack>
        {charge.notes && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>
            {charge.notes}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ hasFilters, onCreate }) {
  return (
    <Box sx={{ textAlign: 'center', py: { xs: 5, md: 7 }, px: 2 }}>
      <Typography variant="h5" fontWeight={900}>
        {hasFilters ? 'Aucune dépense trouvée' : 'Aucune dépense enregistrée'}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3, maxWidth: 560, mx: 'auto' }}>
        {hasFilters
          ? 'Essayez une autre période, catégorie ou recherche.'
          : 'Les dépenses sont les sorties qui ne sont pas des achats fournisseurs. Commencez avec une seule dépense.'}
      </Typography>
      {!hasFilters && (
        <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>
          Créer la première dépense
        </Button>
      )}
    </Box>
  );
}

function ChargeDialog({
  open,
  editingCharge,
  formData,
  setFormData,
  comptes,
  submitting,
  onClose,
  onSubmit,
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <Box component="form" onSubmit={onSubmit}>
        <DialogTitle>
          {editingCharge ? 'Modifier la dépense' : 'Nouvelle dépense'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField
              fullWidth
              label="Dépense"
              required
              placeholder="Ex. facture électricité, salaire, réparation..."
              value={formData.libelle}
              onChange={(event) => setFormData({ ...formData, libelle: event.target.value })}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField
                fullWidth
                label="Montant"
                type="number"
                required
                inputProps={{ step: '0.01', min: '0.01' }}
                value={formData.montant}
                onChange={(event) => setFormData({ ...formData, montant: event.target.value })}
              />
              <TextField
                fullWidth
                label="Date"
                type="date"
                required
                InputLabelProps={{ shrink: true }}
                value={formData.date_charge}
                onChange={(event) => setFormData({ ...formData, date_charge: event.target.value })}
              />
            </Box>
            <TextField
              fullWidth
              select
              label="Catégorie"
              required
              value={formData.categorie}
              onChange={(event) => setFormData({ ...formData, categorie: event.target.value })}
            >
              {CATEGORIES.map((category) => (
                <MenuItem key={category} value={category}>{category}</MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              select
              label="Payé depuis"
              required
              value={formData.payeDepuis}
              onChange={(event) => setFormData({ ...formData, payeDepuis: event.target.value })}
            >
              <MenuItem value="caisse">Caisse</MenuItem>
              {comptes.map((compte) => (
                <MenuItem key={compte.id_compte} value={String(compte.id_compte)}>
                  {compte.nom_banque}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              label="Notes"
              multiline
              rows={3}
              placeholder="Optionnel"
              value={formData.notes}
              onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
            />
            <Alert severity="info">
              La dépense sera automatiquement ajoutée comme sortie dans la caisse ou le compte bancaire choisi.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>Annuler</Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export default ChargesList;
