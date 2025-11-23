/**
 * Page Profil Fournisseur.
 * 
 * Affiche le profil complet d'un fournisseur avec :
 * - Header : Nom fournisseur, statut, boutons d'action (Éditer, Nouvelle transaction)
 * - Cartes statistiques (StatCard) : Total achats, Nombre transactions, Montant moyen
 * - Graphique : Évolution des achats (6 derniers mois) avec recharts
 * - Tableau transactions : Historique complet (DataGrid)
 * - Bouton Export : Exporter l'historique (Excel)
 * 
 * Route : /fournisseurs/:id/profile
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Chip,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  useTheme,
  useMediaQuery,
  Divider,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Add as AddIcon,
  FileDownload as FileDownloadIcon,
  AttachMoney as AttachMoneyIcon,
  Receipt as ReceiptIcon,
  TrendingUp as TrendingUpIcon,
  Inventory as InventoryIcon,
  Store as StoreIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format, subMonths, startOfMonth } from 'date-fns';
import fr from 'date-fns/locale/fr';
import StatCard from '../../components/StatCard/StatCard';
import DataGrid from '../../components/DataGrid/DataGrid';
import ModalForm from '../../components/ModalForm/ModalForm';
import TransactionForm from '../Transactions/TransactionForm';
import PaymentStatusBadge from '../../components/PaymentStatusBadge';
import FinancialInsights from '../../components/FinancialInsights/FinancialInsights';
import StatCardWithGauge from '../../components/StatCard/StatCardWithGauge';
import { get, put, post } from '../../services/api';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import useNotification from '../../hooks/useNotification';
import { formatMontant, formatMontantComplet } from '../../utils/formatNumber';
import { formatMontantForAxis, formatMontantForTooltip } from '../../utils/formatNumberForChart';
import * as yup from 'yup';

/**
 * Formate une date pour l'affichage.
 */
const formatDate = (dateValue) => {
  if (!dateValue) return '-';
  try {
    return format(new Date(dateValue), 'dd/MM/yyyy', { locale: fr });
  } catch {
    return dateValue;
  }
};

/**
 * Formate un mois pour l'affichage dans le graphique.
 */
const formatMonth = (monthStr) => {
  try {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return format(date, 'MMM yyyy', { locale: fr });
  } catch {
    return monthStr;
  }
};

/**
 * Composant FournisseurProfile.
 */
function FournisseurProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const notification = useNotification();

  // États pour les données
  const [fournisseur, setFournisseur] = useState(null);
  const [statistiques, setStatistiques] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [statsMensuelles, setStatsMensuelles] = useState([]);
  const [produits, setProduits] = useState([]);
  const [produitsVendus, setProduitsVendus] = useState(null);
  const [insightsFinanciers, setInsightsFinanciers] = useState(null);
  const [fournisseurScore, setFournisseurScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // État pour la modal d'édition
  const [modalOpen, setModalOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  // État pour la modal de nouvelle transaction
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [transactionFormLoading, setTransactionFormLoading] = useState(false);
  const [transactionFormError, setTransactionFormError] = useState(null);

  /**
   * Crée une map de lookup pour les produits.
   */
  const produitsMap = useMemo(() => {
    const map = new Map();
    produits.forEach((produit) => {
      map.set(produit.id_produit, produit.nom_produit);
    });
    return map;
  }, [produits]);

  /**
   * Charge les produits.
   */
  const fetchProduits = async () => {
    try {
      const produitsData = await get('/produits', {
        params: { limit: 1000, est_actif: true },
      });
      setProduits(produitsData || []);
    } catch (err) {
      console.error('Erreur lors du chargement des produits:', err);
    }
  };

  /**
   * Charge les produits vendus par le fournisseur.
   */
  const fetchProduitsVendus = async () => {
    try {
      const produitsData = await get(`/fournisseurs/${id}/produits-vendus`);
      setProduitsVendus(produitsData);
    } catch (err) {
      console.error('Erreur lors du chargement des produits vendus:', err);
    }
  };

  /**
   * Charge les insights financiers du fournisseur.
   */
  const fetchInsightsFinanciers = async () => {
    try {
      const insightsData = await get(`/fournisseurs/${id}/insights-financiers`);
      setInsightsFinanciers(insightsData);
    } catch (err) {
      console.error('Erreur lors du chargement des insights financiers:', err);
    }
  };

  /**
   * Charge le score de performance du fournisseur.
   */
  const fetchFournisseurScore = async () => {
    try {
      const scoreData = await get(`/fournisseurs/${id}/score`);
      setFournisseurScore(scoreData);
    } catch (err) {
      console.error('Erreur lors du chargement du score fournisseur:', err);
    }
  };

  /**
   * Charge le profil du fournisseur.
   */
  const fetchFournisseurProfile = async () => {
    setLoading(true);
    setError(null);

    try {
      // Charger le profil avec les statistiques et transactions
      const profileData = await get(`/fournisseurs/${id}/profile`, {
        params: {
          limit: 1000, // Limite élevée pour récupérer toutes les transactions
        },
      });

      setFournisseur(profileData.fournisseur);
      setStatistiques(profileData.statistiques);
      setTransactions(profileData.transactions || []);

      // Charger les statistiques mensuelles pour le graphique (6 derniers mois)
      const statsMensuellesData = await get(`/fournisseurs/${id}/stats-mensuelles`, {
        params: {
          periode: 6,
        },
      });

      setStatsMensuelles(statsMensuellesData.data || []);

      // Charger les produits vendus, les insights financiers et le score
      await Promise.all([
        fetchProduitsVendus(),
        fetchInsightsFinanciers(),
        fetchFournisseurScore(),
      ]);
    } catch (err) {
      console.error('Erreur lors du chargement du profil fournisseur:', err);
      const errorMessage = err?.message || 'Une erreur est survenue lors du chargement du profil fournisseur';
      setError(errorMessage);
      notification.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Charge les données au montage et lorsque l'ID change.
   */
  useEffect(() => {
    if (id) {
      fetchProduits();
      fetchFournisseurProfile();
    }
  }, [id]);

  /**
   * Prépare les données pour le graphique.
   */
  const chartData = useMemo(() => {
    if (!statsMensuelles || statsMensuelles.length === 0) {
      return [];
    }

    return statsMensuelles.map((item) => ({
      mois: formatMonth(item.mois),
      moisKey: item.mois,
      montant: parseFloat(item.montant || 0),
      nb_transactions: item.nb_transactions || 0,
    }));
  }, [statsMensuelles]);

  /**
   * Configuration des colonnes pour le DataGrid des transactions.
   * Mêmes colonnes que la liste principale des transactions.
   */
  const transactionColumns = [
    {
      id: 'id_transaction',
      label: 'ID',
      sortable: true,
      filterable: false,
      align: 'right',
    },
    {
      id: 'date_transaction',
      label: 'Date',
      sortable: true,
      filterable: false,
      format: (value) => formatDate(value),
    },
    {
      id: 'produit',
      label: 'Produit',
      sortable: false,
      filterable: false,
      format: (value, row) => {
        // Utiliser la map de produits pour afficher le nom
        return produitsMap.get(row.id_produit) || `Produit #${row.id_produit || '-'}`;
      },
    },
    {
      id: 'prix_unitaire',
      label: 'Prix unitaire',
      sortable: true,
      filterable: false,
      align: 'right',
      format: (value) => {
        if (value === null || value === undefined) return '-';
        return formatMontant(value, { useCompactNotation: false });
      },
    },
    {
      id: 'quantite',
      label: 'Quantité',
      sortable: true,
      filterable: false,
      align: 'right',
    },
    {
      id: 'montant_total',
      label: 'Montant total',
      sortable: true,
      filterable: false,
      align: 'right',
      format: (value) => {
        return (
          <Typography
            variant="body2"
            fontWeight="bold"
            sx={{ color: 'error.main' }}
          >
            {formatMontant(value, { useCompactNotation: false })}
          </Typography>
        );
      },
    },
    {
      id: 'statut_paiement',
      label: 'Paiement',
      sortable: false,
      filterable: false,
      format: (value, row) => {
        const statut = row.est_en_retard ? 'en_retard' : (row.statut_paiement || 'impaye');
        return <PaymentStatusBadge statut={statut} />;
      },
    },
    {
      id: 'est_actif',
      label: 'Statut',
      sortable: true,
      filterable: false,
      format: (value) => (
        <Chip
          label={value ? 'Actif' : 'Inactif'}
          color={value ? 'success' : 'default'}
          size="small"
        />
      ),
    },
  ];

  /**
   * Gère l'export Excel des transactions.
   */
  const handleExportExcel = () => {
    try {
      if (!transactions || transactions.length === 0) {
        notification.warning('Aucune transaction à exporter');
        return;
      }

      const customFormatters = {
        date_transaction: (value) => {
          if (!value) return '-';
          try {
            return formatDate(value);
          } catch {
            return value;
          }
        },
        produit: (value, row) => {
          return produitsMap.get(row.id_produit) || `Produit #${row.id_produit || '-'}`;
        },
        prix_unitaire: (value) => {
          if (value === null || value === undefined) return '-';
          return parseFloat(value).toFixed(2);
        },
        montant_total: (value) => {
          if (value === null || value === undefined) return '-';
          return parseFloat(value).toFixed(2);
        },
        est_actif: (value) => (value ? 'Actif' : 'Inactif'),
      };

      exportToExcelAdvanced(
        transactions,
        transactionColumns,
        `transactions_fournisseur_${fournisseur?.nom_fournisseur?.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}`,
        'Transactions',
        customFormatters
      );

      notification.success('Export Excel réussi');
    } catch (error) {
      console.error('Erreur lors de l\'export Excel:', error);
      notification.error('Une erreur est survenue lors de l\'export Excel');
    }
  };

  /**
   * Schéma de validation Yup pour le formulaire fournisseur.
   */
  const fournisseurValidationSchema = yup.object().shape({
    nom_fournisseur: yup
      .string()
      .required('Le nom du fournisseur est requis')
      .min(1, 'Le nom doit contenir au moins 1 caractère')
      .max(255, 'Le nom ne peut pas dépasser 255 caractères')
      .trim(),
    est_actif: yup.boolean().required('Le statut est requis'),
  });

  /**
   * Configuration des champs du formulaire.
   */
  const fournisseurFields = [
    {
      name: 'nom_fournisseur',
      label: 'Nom du fournisseur',
      type: 'text',
      placeholder: 'Entrez le nom du fournisseur',
      required: true,
    },
    {
      name: 'est_actif',
      label: 'Actif',
      type: 'switch',
    },
  ];

  /**
   * Gère l'ouverture de la modal d'édition.
   */
  const handleEdit = () => {
    setFormError(null);
    setModalOpen(true);
  };

  /**
   * Gère la soumission du formulaire d'édition.
   */
  const handleSubmit = async (data) => {
    setFormLoading(true);
    setFormError(null);

    try {
      // Mode édition : PUT
      await put(`/fournisseurs/${fournisseur.id_fournisseur}`, data);

      // Fermer la modal et rafraîchir les données
      setModalOpen(false);
      await fetchFournisseurProfile();
      
      // Afficher une notification de succès
      notification.success('Fournisseur modifié avec succès');
    } catch (err) {
      console.error('Erreur lors de la soumission:', err);
      const errorMessage = err?.message || 'Une erreur est survenue lors de l\'enregistrement';
      setFormError(errorMessage);
      notification.error(errorMessage);
      throw err; // Re-throw pour que ModalForm puisse gérer les erreurs de validation
    } finally {
      setFormLoading(false);
    }
  };

  /**
   * Gère la fermeture de la modal.
   */
  const handleCloseModal = () => {
    if (!formLoading) {
      setModalOpen(false);
      setFormError(null);
    }
  };

  /**
   * Gère l'ouverture de la modal de nouvelle transaction.
   */
  const handleNewTransaction = () => {
    setTransactionFormError(null);
    setTransactionModalOpen(true);
  };

  /**
   * Gère la soumission de la nouvelle transaction.
   */
  const handleTransactionSubmit = async (data) => {
    setTransactionFormLoading(true);
    setTransactionFormError(null);

    try {
      // Mode création : POST
      await post('/transactions', data);

      // Fermer la modal et rafraîchir les données du profil
      setTransactionModalOpen(false);
      await fetchFournisseurProfile();
      
      // Afficher une notification de succès
      notification.success('Transaction créée avec succès');
    } catch (err) {
      console.error('Erreur lors de la soumission:', err);
      const errorMessage = err?.message || 'Une erreur est survenue lors de l\'enregistrement';
      setTransactionFormError(errorMessage);
      notification.error(errorMessage);
      throw err; // Re-throw pour que le formulaire puisse gérer les erreurs de validation
    } finally {
      setTransactionFormLoading(false);
    }
  };

  /**
   * Gère la fermeture de la modal de nouvelle transaction.
   */
  const handleCloseTransactionModal = () => {
    if (!transactionFormLoading) {
      setTransactionModalOpen(false);
      setTransactionFormError(null);
    }
  };

  /**
   * Gère la navigation vers les détails d'une transaction.
   */
  const handleViewTransaction = (transaction) => {
    navigate(`/transactions/${transaction.id_transaction}`);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/fournisseurs')}>
          Retour à la liste
        </Button>
      </Box>
    );
  }

  if (!fournisseur) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Fournisseur introuvable
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/fournisseurs')}>
          Retour à la liste
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/fournisseurs')}
          variant="outlined"
        >
          Retour
        </Button>
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h4" component="h1">
            {fournisseur.nom_fournisseur}
          </Typography>
          <Chip
            label={fournisseur.est_actif ? 'Actif' : 'Inactif'}
            color={fournisseur.est_actif ? 'success' : 'default'}
            size="medium"
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={handleEdit}
          >
            Éditer
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleNewTransaction}
          >
            Nouvelle transaction
          </Button>
        </Box>
      </Box>

      {/* Cartes statistiques */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            title="Total achats"
            value={statistiques?.montant_total_achats || 0}
            icon={<AttachMoneyIcon />}
            valueFormat="currency"
            currency="MAD"
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            title="Nombre transactions"
            value={statistiques?.total_transactions || 0}
            icon={<ReceiptIcon />}
            valueFormat="number"
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            title="Montant moyen"
            value={statistiques?.montant_moyen_transaction || 0}
            icon={<TrendingUpIcon />}
            valueFormat="currency"
            currency="MAD"
            color="success"
          />
        </Grid>
      </Grid>

      {/* Insights Financiers */}
      <FinancialInsights 
        insights={insightsFinanciers}
        loading={loading}
        type="fournisseur"
      />

      {/* Graphique d'évolution des achats */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" component="h2" gutterBottom>
            Évolution des achats (6 derniers mois)
          </Typography>
          <Divider sx={{ mb: 2 }} />
          {chartData.length > 0 ? (
            <Box sx={{ width: '100%', height: 400, mt: 3 }}>
              <ResponsiveContainer>
                <LineChart
                  data={chartData}
                  margin={{
                    top: 5,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="mois"
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    label={{ value: 'Montant (MAD)', angle: -90, position: 'insideLeft' }}
                    tickFormatter={(value) => formatMontantForAxis(value)}
                    width={80}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value) => formatMontantForTooltip(value)}
                    labelFormatter={(label) => `Mois: ${label}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="montant"
                    stroke={theme.palette.primary.main}
                    strokeWidth={2}
                    name="Montant total (MAD)"
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
              <Typography variant="body2" color="text.secondary">
                Aucune donnée disponible pour le graphique
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Section Produits Vendus */}
      {produitsVendus && produitsVendus.produits && produitsVendus.produits.length > 0 && (
        <Card sx={{ mb: { xs: 2, sm: 2.5, md: 3 } }}>
          <CardContent sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
            <Typography 
              variant="h6" 
              component="h2" 
              gutterBottom
              sx={{ 
                fontSize: { xs: '1rem', sm: '1.125rem', md: '1.25rem' },
                mb: { xs: 2, sm: 2.5, md: 3 }
              }}
            >
             Produits Vendus - Inventaire Fournisseur
            </Typography>

            {/* KPIs Produits */}
            <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }} sx={{ mb: { xs: 2, sm: 2.5, md: 3 } }}>
              <Grid item xs={12} sm={6} md={4}>
                <StatCard
                  title="Produits différents"
                  value={produitsVendus.nombre_produits_differents || 0}
                  icon={<StoreIcon />}
                  valueFormat="number"
                  color="info"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <StatCard
                  title="Quantité totale"
                  value={produitsVendus.quantite_totale_tous_produits || 0}
                  icon={<InventoryIcon />}
                  valueFormat="number"
                  color="warning"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <StatCardWithGauge
                  title="SCORE"
                  score={fournisseurScore?.score_total || 0}
                  label={fournisseurScore?.label || ''}
                  color={fournisseurScore?.couleur || 'primary'}
                  loading={loading}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Tableau des transactions */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" component="h2">
              Historique des transactions
            </Typography>
            <Button
              variant="outlined"
              startIcon={<FileDownloadIcon />}
              onClick={handleExportExcel}
              disabled={!transactions || transactions.length === 0}
            >
              Exporter (Excel)
            </Button>
          </Box>
          <Divider sx={{ mb: 2 }} />
          {transactions && transactions.length > 0 ? (
            <DataGrid
              rows={transactions}
              columns={transactionColumns}
              onView={handleViewTransaction}
              loading={false}
              pageSize={10}
              showActions={true}
            />
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              Aucune transaction disponible
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Modal de modification */}
      <ModalForm
        open={modalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        initialValues={
          fournisseur
            ? {
                nom_fournisseur: fournisseur.nom_fournisseur,
                est_actif: fournisseur.est_actif,
              }
            : {
                nom_fournisseur: '',
                est_actif: true,
              }
        }
        validationSchema={fournisseurValidationSchema}
        fields={fournisseurFields}
        title="Modifier le fournisseur"
        submitLabel="Modifier"
        loading={formLoading}
        errorMessage={formError}
      />

      {/* Modal de nouvelle transaction */}
      <TransactionForm
        open={transactionModalOpen}
        onClose={handleCloseTransactionModal}
        onSubmit={handleTransactionSubmit}
        initialValues={{}}
        loading={transactionFormLoading}
        errorMessage={transactionFormError}
        prefillClientId={null}
        prefillFournisseurId={parseInt(id)}
      />
    </Box>
  );
}

export default FournisseurProfile;

