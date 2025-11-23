/**
 * Page Profil Client.
 * 
 * Affiche le profil complet d'un client avec :
 * - Header : Nom client, statut, boutons d'action (Éditer, Nouvelle transaction)
 * - Cartes statistiques (StatCard) : Total ventes, Nombre transactions, Montant moyen
 * - Graphique : Évolution des ventes (6 derniers mois) avec recharts
 * - Tableau transactions : Historique complet (DataGrid)
 * - Bouton Export : Exporter l'historique (Excel)
 * 
 * Route : /clients/:id/profile
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
  ShoppingCart as ShoppingCartIcon,
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
 * Composant ClientProfile.
 */
function ClientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const notification = useNotification();

  // États pour les données
  const [client, setClient] = useState(null);
  const [statistiques, setStatistiques] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [statsMensuelles, setStatsMensuelles] = useState([]);
  const [produits, setProduits] = useState([]);
  const [produitsAchetes, setProduitsAchetes] = useState(null);
  const [insightsFinanciers, setInsightsFinanciers] = useState(null);
  const [clientScore, setClientScore] = useState(null);
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
   * Charge les produits achetés par le client.
   */
  const fetchProduitsAchetes = async () => {
    try {
      const produitsData = await get(`/clients/${id}/produits-achetes`);
      setProduitsAchetes(produitsData);
    } catch (err) {
      console.error('Erreur lors du chargement des produits achetés:', err);
    }
  };

  /**
   * Charge les insights financiers du client.
   */
  const fetchInsightsFinanciers = async () => {
    try {
      const insightsData = await get(`/clients/${id}/insights-financiers`);
      setInsightsFinanciers(insightsData);
    } catch (err) {
      console.error('Erreur lors du chargement des insights financiers:', err);
    }
  };

  /**
   * Charge le score de fiabilité du client.
   */
  const fetchClientScore = async () => {
    try {
      const scoreData = await get(`/clients/${id}/score`);
      setClientScore(scoreData);
    } catch (err) {
      console.error('Erreur lors du chargement du score client:', err);
    }
  };

  /**
   * Charge le profil du client.
   */
  const fetchClientProfile = async () => {
    setLoading(true);
    setError(null);

    try {
      // Charger le profil avec les statistiques et transactions
      const profileData = await get(`/clients/${id}/profile`, {
        params: {
          limit: 1000, // Limite élevée pour récupérer toutes les transactions
        },
      });

      setClient(profileData.client);
      setStatistiques(profileData.statistiques);
      setTransactions(profileData.transactions || []);

      // Charger les statistiques mensuelles pour le graphique (6 derniers mois)
      const statsMensuellesData = await get(`/clients/${id}/stats-mensuelles`, {
        params: {
          periode: 6,
        },
      });

      setStatsMensuelles(statsMensuellesData.data || []);

      // Charger les produits achetés, les insights financiers et le score
      await Promise.all([
        fetchProduitsAchetes(),
        fetchInsightsFinanciers(),
        fetchClientScore(),
      ]);
    } catch (err) {
      console.error('Erreur lors du chargement du profil client:', err);
      const errorMessage = err?.message || 'Une erreur est survenue lors du chargement du profil client';
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
      fetchClientProfile();
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
            sx={{ color: 'success.main' }}
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
        `transactions_client_${client?.nom_client?.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}`,
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
   * Schéma de validation Yup pour le formulaire client.
   */
  const clientValidationSchema = yup.object().shape({
    nom_client: yup
      .string()
      .required('Le nom du client est requis')
      .min(1, 'Le nom doit contenir au moins 1 caractère')
      .max(255, 'Le nom ne peut pas dépasser 255 caractères')
      .trim(),
    est_actif: yup.boolean().required('Le statut est requis'),
  });

  /**
   * Configuration des champs du formulaire.
   */
  const clientFields = [
    {
      name: 'nom_client',
      label: 'Nom du client',
      type: 'text',
      placeholder: 'Entrez le nom du client',
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
      await put(`/clients/${client.id_client}`, data);

      // Fermer la modal et rafraîchir les données
      setModalOpen(false);
      await fetchClientProfile();
      
      // Afficher une notification de succès
      notification.success('Client modifié avec succès');
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
      await fetchClientProfile();
      
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
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/clients')}>
          Retour à la liste
        </Button>
      </Box>
    );
  }

  if (!client) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Client introuvable
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/clients')}>
          Retour à la liste
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' }, 
        mb: { xs: 2, sm: 2.5, md: 3 }, 
        gap: { xs: 1.5, sm: 2 }, 
        flexWrap: 'wrap' 
      }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/clients')}
          variant="outlined"
          size={isMobile ? 'small' : 'medium'}
          sx={{ width: { xs: '100%', sm: 'auto' } }}
        >
          Retour
        </Button>
        <Box sx={{ 
          flexGrow: 1, 
          display: 'flex', 
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' }, 
          gap: { xs: 1, sm: 2 }, 
          flexWrap: 'wrap' 
        }}>
          <Typography 
            variant="h4" 
            component="h1"
            sx={{ fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2.125rem' } }}
          >
            {client.nom_client}
          </Typography>
          <Chip
            label={client.est_actif ? 'Actif' : 'Inactif'}
            color={client.est_actif ? 'success' : 'default'}
            size={isMobile ? 'small' : 'medium'}
          />
        </Box>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', sm: 'row' },
          gap: { xs: 1.5, sm: 2 }, 
          width: { xs: '100%', sm: 'auto' }
        }}>
          <Button
            variant="outlined"
            startIcon={!isMobile && <EditIcon />}
            onClick={handleEdit}
            size={isMobile ? 'medium' : 'medium'}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Éditer
          </Button>
          <Button
            variant="contained"
            startIcon={!isMobile && <AddIcon />}
            onClick={handleNewTransaction}
            size={isMobile ? 'medium' : 'medium'}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Nouvelle transaction
          </Button>
        </Box>
      </Box>

      {/* Cartes statistiques */}
      <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }} sx={{ mb: { xs: 2, sm: 2.5, md: 3 } }}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            title="Total ventes"
            value={statistiques?.montant_total_ventes || 0}
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
        type="client"
      />

      {/* Graphique d'évolution des ventes */}
      <Card sx={{ mb: { xs: 2, sm: 2.5, md: 3 } }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
          <Typography 
            variant="h6" 
            component="h2" 
            gutterBottom
            sx={{ fontSize: { xs: '1rem', sm: '1.125rem', md: '1.25rem' } }}
          >
            Évolution des ventes (6 derniers mois)
          </Typography>
          <Divider sx={{ mb: { xs: 1.5, sm: 2 } }} />
          {chartData.length > 0 ? (
            <Box sx={{ 
              width: '100%', 
              height: { xs: 300, sm: 350, md: 400 }, 
              mt: { xs: 2, sm: 2.5, md: 3 } 
            }}>
              <ResponsiveContainer>
                <LineChart
                  data={chartData}
                  margin={{
                    top: 5,
                    right: isMobile ? 10 : 30,
                    left: isMobile ? 5 : 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="mois"
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    label={{ 
                      value: 'Montant (MAD)', 
                      angle: -90, 
                      position: 'insideLeft',
                      style: { fontSize: isMobile ? 10 : 12 }
                    }}
                    tickFormatter={(value) => formatMontantForAxis(value)}
                    width={isMobile ? 60 : 80}
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                  />
                  <Tooltip
                    formatter={(value) => formatMontantForTooltip(value)}
                    labelFormatter={(label) => `Mois: ${label}`}
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: isMobile ? '0.75rem' : '0.875rem' }}
                  />
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

      {/* Section Produits Achetés */}
      {produitsAchetes && produitsAchetes.produits && produitsAchetes.produits.length > 0 && (
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
              Produits Achetés - Inventaire Client
            </Typography>

            {/* KPIs Produits */}
            <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }} sx={{ mb: { xs: 2, sm: 2.5, md: 3 } }}>
              <Grid item xs={12} sm={6} md={4}>
                <StatCard
                  title="Produits différents"
                  value={produitsAchetes.nombre_produits_differents || 0}
                  icon={<ShoppingCartIcon />}
                  valueFormat="number"
                  color="info"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <StatCard
                  title="Quantité totale"
                  value={produitsAchetes.quantite_totale_tous_produits || 0}
                  icon={<InventoryIcon />}
                  valueFormat="number"
                  color="warning"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <StatCardWithGauge
                  title="SCORE"
                  score={clientScore?.score_total || 0}
                  label={clientScore?.label || ''}
                  color={clientScore?.couleur || 'primary'}
                  loading={loading}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Tableau des transactions */}
      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
          <Box sx={{ 
            display: 'flex', 
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between', 
            alignItems: { xs: 'stretch', sm: 'center' }, 
            mb: { xs: 1.5, sm: 2 },
            gap: { xs: 1.5, sm: 0 }
          }}>
            <Typography 
              variant="h6" 
              component="h2"
              sx={{ fontSize: { xs: '1rem', sm: '1.125rem', md: '1.25rem' } }}
            >
              Historique des transactions
            </Typography>
            <Button
              variant="outlined"
              startIcon={!isMobile && <FileDownloadIcon />}
              onClick={handleExportExcel}
              disabled={!transactions || transactions.length === 0}
              size={isMobile ? 'small' : 'medium'}
              sx={{ width: { xs: '100%', sm: 'auto' } }}
            >
              {isMobile ? 'Exporter' : 'Exporter (Excel)'}
            </Button>
          </Box>
          <Divider sx={{ mb: { xs: 1.5, sm: 2 } }} />
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
          client
            ? {
                nom_client: client.nom_client,
                est_actif: client.est_actif,
              }
            : {
                nom_client: '',
                est_actif: true,
              }
        }
        validationSchema={clientValidationSchema}
        fields={clientFields}
        title="Modifier le client"
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
        prefillClientId={parseInt(id)}
        prefillFournisseurId={null}
      />
    </Box>
  );
}

export default ClientProfile;

