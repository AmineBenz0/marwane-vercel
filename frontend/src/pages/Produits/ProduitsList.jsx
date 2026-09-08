import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  FileDownload as FileDownloadIcon,
  Search as SearchIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import ProduitForm from './ProduitForm';
import { get, post, put } from '../../services/api';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';

const formatMoney = (value, maximumFractionDigits = 2) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'MAD',
    maximumFractionDigits,
  }).format(amount);
};

const formatDate = (value) => {
  if (!value) return 'Aucun achat';
  return new Intl.DateTimeFormat('fr-FR').format(new Date(value));
};

const pluralize = (count, singular, plural = `${singular}s`) => (
  count > 1 ? plural : singular
);

function ProduitsList() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [produits, setProduits] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduit, setEditingProduit] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  const fournisseursMap = useMemo(() => {
    const map = new Map();
    fournisseurs.forEach((fournisseur) => {
      map.set(fournisseur.id_fournisseur, fournisseur.nom_fournisseur);
    });
    return map;
  }, [fournisseurs]);

  const productInsights = useMemo(() => {
    const map = new Map();

    transactions
      .filter((transaction) => transaction.id_fournisseur !== null && transaction.id_fournisseur !== undefined)
      .forEach((transaction) => {
        const current = map.get(transaction.id_produit) || {
          suppliers: new Set(),
          purchases: 0,
          quantity: 0,
          total: 0,
          lastPurchase: null,
        };

        current.suppliers.add(transaction.id_fournisseur);
        current.purchases += 1;
        current.quantity += Number(transaction.quantite || 0);
        current.total += Number(transaction.montant_total || 0);

        if (
          !current.lastPurchase ||
          new Date(transaction.date_transaction) > new Date(current.lastPurchase.date_transaction)
        ) {
          current.lastPurchase = transaction;
        }

        map.set(transaction.id_produit, current);
      });

    return map;
  }, [transactions]);

  const filteredProduits = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return produits;

    return produits.filter((produit) => (
      produit.nom_produit?.toLowerCase().includes(normalizedSearch)
    ));
  }, [produits, search]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [produitsData, transactionsData, fournisseursData] = await Promise.all([
        get('/produits', {
          params: {
            est_actif: true,
            limit: 1000,
          },
        }),
        get('/transactions', {
          params: {
            est_actif: true,
            limit: 5000,
          },
        }),
        get('/fournisseurs', {
          params: {
            est_actif: true,
            limit: 1000,
          },
        }),
      ]);

      setProduits(produitsData || []);
      setTransactions(transactionsData || []);
      setFournisseurs(fournisseursData || []);
    } catch (err) {
      console.error('Erreur lors du chargement des produits:', err);
      setError(err?.message || 'Une erreur est survenue lors du chargement des produits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = () => {
    setEditingProduit(null);
    setFormError(null);
    setModalOpen(true);
  };

  const handleEdit = (produit) => {
    setEditingProduit(produit);
    setFormError(null);
    setModalOpen(true);
  };

  const handleViewDetails = (produit) => {
    navigate(`/produits/${produit.id_produit}`);
  };

  const handleSubmit = async (data) => {
    setFormLoading(true);
    setFormError(null);

    try {
      if (editingProduit) {
        await put(`/produits/${editingProduit.id_produit}`, data);
      } else {
        await post('/produits', data);
      }

      setModalOpen(false);
      setEditingProduit(null);
      await fetchData();
    } catch (err) {
      console.error('Erreur lors de la soumission:', err);
      setFormError(err?.message || "Une erreur est survenue lors de l'enregistrement");
      throw err;
    } finally {
      setFormLoading(false);
    }
  };

  const handleCloseModal = () => {
    if (!formLoading) {
      setModalOpen(false);
      setEditingProduit(null);
      setFormError(null);
    }
  };

  const handleExportExcel = async () => {
    try {
      const rows = filteredProduits.map((produit) => {
        const insight = productInsights.get(produit.id_produit);
        const lastPurchase = insight?.lastPurchase;

        return {
          nom_produit: produit.nom_produit,
          fournisseurs: insight?.suppliers.size || 0,
          dernier_fournisseur: lastPurchase
            ? fournisseursMap.get(lastPurchase.id_fournisseur) || `Fournisseur #${lastPurchase.id_fournisseur}`
            : '-',
          dernier_prix: lastPurchase?.prix_unitaire || '',
          dernier_achat: lastPurchase?.date_transaction || '',
          quantite_totale: insight?.quantity || 0,
          montant_total: insight?.total || 0,
        };
      });

      await exportToExcelAdvanced(
        rows,
        [
          { id: 'nom_produit', label: 'Produit' },
          { id: 'fournisseurs', label: 'Fournisseurs' },
          { id: 'dernier_fournisseur', label: 'Dernier fournisseur' },
          { id: 'dernier_prix', label: 'Dernier prix' },
          { id: 'dernier_achat', label: 'Dernier achat' },
          { id: 'quantite_totale', label: 'Quantité totale' },
          { id: 'montant_total', label: 'Montant total' },
        ],
        `produits_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}`,
        'Produits'
      );
    } catch (err) {
      console.error("Erreur lors de l'export Excel:", err);
      setError("Une erreur est survenue lors de l'export Excel");
    }
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
          <Typography
            variant="h4"
            component="h1"
            fontWeight={900}
            sx={{ fontSize: { xs: '1.65rem', sm: '2rem', md: '2.25rem' } }}
          >
            Produits achetés
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 760 }}>
            Catalogue simple des produits achetés chez les fournisseurs. Les œufs restent suivis dans Production.
          </Typography>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <Button
            variant="outlined"
            startIcon={!isMobile && <FileDownloadIcon />}
            onClick={handleExportExcel}
            disabled={loading || filteredProduits.length === 0}
          >
            {isMobile ? 'Exporter' : 'Exporter Excel'}
          </Button>
          <Button
            variant="contained"
            startIcon={!isMobile && <AddIcon />}
            onClick={handleCreate}
          >
            {isMobile ? 'Créer' : 'Créer un produit'}
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card variant="outlined" sx={{ borderRadius: 4, mb: 2.5 }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', md: 'center' }}
            justifyContent="space-between"
          >
            <Box>
              <Typography fontWeight={900} fontSize="1.15rem">
                Catalogue des achats
              </Typography>
                <Typography variant="body2" color="text.secondary">
                Matières premières, produits finis et services dans un référentiel unique.
              </Typography>
            </Box>

            <TextField
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un produit"
              size="small"
              sx={{ minWidth: { xs: '100%', md: 330 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        </CardContent>
      </Card>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : filteredProduits.length === 0 ? (
        <EmptyProductsState hasSearch={Boolean(search.trim())} onCreate={handleCreate} />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              lg: 'repeat(3, minmax(0, 1fr))',
            },
            gap: 2,
          }}
        >
          {filteredProduits.map((produit) => (
            <ProductCard
              key={produit.id_produit}
              produit={produit}
              insight={productInsights.get(produit.id_produit)}
              fournisseursMap={fournisseursMap}
              onView={() => handleViewDetails(produit)}
              onEdit={() => handleEdit(produit)}
            />
          ))}
        </Box>
      )}

      <ProduitForm
        open={modalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        initialValues={editingProduit}
        loading={formLoading}
        errorMessage={formError}
      />
    </Box>
  );
}

function ProductCard({ produit, insight, fournisseursMap, onView, onEdit }) {
  const supplierCount = insight?.suppliers.size || 0;
  const lastPurchase = insight?.lastPurchase;
  const lastSupplier = lastPurchase
    ? fournisseursMap.get(lastPurchase.id_fournisseur) || `Fournisseur #${lastPurchase.id_fournisseur}`
    : 'Aucun achat';

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 4,
        height: '100%',
        transition: 'transform 160ms ease, box-shadow 160ms ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 16px 36px rgba(15, 23, 42, 0.08)',
        },
      }}
    >
      <CardContent
        sx={{
          p: 2.5,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          '&:last-child': { pb: 2.5 },
        }}
      >
        <Box>
          <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="flex-start">
            <Typography variant="h6" fontWeight={900} lineHeight={1.15}>
              {produit.nom_produit}
            </Typography>
            <Chip
              size="small"
              color={supplierCount > 0 ? 'success' : 'default'}
              label={
                supplierCount > 0
                  ? `${supplierCount} ${pluralize(supplierCount, 'fournisseur')}`
                  : 'Pas encore acheté'
              }
              sx={{ fontWeight: 800, flexShrink: 0 }}
            />
            <Chip
              size="small"
              variant="outlined"
              label={produit.type_produit === 'matiere_premiere' ? 'Matière première' : produit.type_produit === 'service' ? 'Service' : 'Produit fini'}
              sx={{ fontWeight: 700, flexShrink: 0, mt: 0.75 }}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {supplierCount > 0
              ? `Dernier fournisseur: ${lastSupplier}`
              : 'Le produit est prêt pour les prochains achats.'}
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
            gap: 1,
            mt: 'auto',
          }}
        >
          <MiniMetric label="Dernier prix" value={lastPurchase ? formatMoney(lastPurchase.prix_unitaire, 2) : '-'} />
          <MiniMetric label="Dernier achat" value={formatDate(lastPurchase?.date_transaction)} />
          <MiniMetric label="Quantité totale" value={(insight?.quantity || 0).toLocaleString('fr-FR')} />
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="contained" startIcon={<VisibilityIcon />} onClick={onView} fullWidth>
            Voir
          </Button>
          <Button variant="outlined" startIcon={<EditIcon />} onClick={onEdit} fullWidth>
            Modifier
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value }) {
  return (
    <Box sx={{ bgcolor: 'grey.50', borderRadius: 2.5, p: 1.25, minHeight: 68 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={900}>
        {label}
      </Typography>
      <Typography fontWeight={900} sx={{ mt: 0.25, wordBreak: 'break-word' }}>
        {value}
      </Typography>
    </Box>
  );
}

function EmptyProductsState({ hasSearch, onCreate }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 4 }}>
      <CardContent sx={{ p: { xs: 3, md: 5 }, textAlign: 'center' }}>
        <Typography variant="h5" fontWeight={900}>
          {hasSearch ? 'Aucun produit trouvé' : 'Aucun produit acheté pour le moment'}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3, maxWidth: 520, mx: 'auto' }}>
          {hasSearch
            ? 'Essayez un autre nom ou effacez la recherche.'
            : 'Créez le premier produit acheté chez un fournisseur. Les achats pourront ensuite montrer les fournisseurs et les derniers prix.'}
        </Typography>
        {!hasSearch && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>
            Créer le premier produit
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default ProduitsList;
