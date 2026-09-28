/**
 * Page Profil Client.
 * 
 * Affiche le profil complet d'un client avec :
 * - Header : Nom client, statut, boutons d'action (Éditer, Nouvelle vente)
 * - Cartes statistiques (StatCard) : Total ventes, Nombre transactions, Montant moyen
 * - Graphique : Évolution des ventes (6 derniers mois) avec recharts
 * - Tableau transactions : Historique complet (DataGrid)
 * - Bouton Export : Exporter l'historique (Excel)
 * 
 * Route : /clients/:id/profile
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
import { format, startOfMonth, startOfWeek, startOfYear } from 'date-fns';
import fr from 'date-fns/locale/fr';
import StatCard from '../../components/StatCard/StatCard';
import ModalForm from '../../components/ModalForm/ModalForm';
import TransactionForm from '../Transactions/TransactionForm';
import FinancialInsights from '../../components/FinancialInsights/FinancialInsights';
import StatCardWithGauge from '../../components/StatCard/StatCardWithGauge';
import TransactionsExcelRegister, { getPaymentReglementSummary } from '../../components/TransactionsExcelRegister';
import { get, put, post } from '../../services/api';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import useNotification from '../../hooks/useNotification';
import { formatMontant } from '../../utils/formatNumber';
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
  const [batiments, setBatiments] = useState([]);
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
  const [activeTab, setActiveTab] = useState('resume');
  const [balancePeriod, setBalancePeriod] = useState('month');

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

  const batimentsMap = useMemo(() => {
    const map = new Map();
    batiments.forEach((batiment) => {
      map.set(batiment.id_batiment, batiment.nom);
    });
    return map;
  }, [batiments]);

  /**
   * Charge les produits.
   */
  const fetchProduits = async () => {
    try {
      const [produitsData, batimentsData] = await Promise.all([
        get('/produits', {
          params: { limit: 1000, est_actif: true },
        }),
        get('/batiments'),
      ]);
      setProduits(produitsData || []);
      setBatiments(batimentsData || []);
    } catch (err) {
      console.error('Erreur lors du chargement des données de référence:', err);
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

  const clientCreanceRows = useMemo(() => {
    const today = new Date();
    const periodStart = {
      week: startOfWeek(today, { weekStartsOn: 1 }),
      month: startOfMonth(today),
      year: startOfYear(today),
    }[balancePeriod];

    return transactions
      .filter((transaction) => new Date(transaction.date_transaction) >= periodStart)
      .sort((a, b) => new Date(b.date_transaction) - new Date(a.date_transaction));
  }, [balancePeriod, transactions]);

  const clientCreanceSummary = useMemo(() => {
    return clientCreanceRows.reduce(
      (summary, transaction) => ({
        total: summary.total + Math.abs(Number(transaction.montant_total || 0)),
        encaisse: summary.encaisse + Math.abs(Number(transaction.montant_paye || 0)),
        reste: summary.reste + Math.abs(Number(transaction.montant_restant || 0)),
      }),
      { total: 0, encaisse: 0, reste: 0 }
    );
  }, [clientCreanceRows]);

  const getPaymentLabel = (transaction) => {
    const paiement = transaction.paiements?.[0];
    if (!paiement) return 'Non réglé';

    const labels = {
      cash: 'Espèces',
      cheque: 'Chèque',
      virement: 'Virement',
      carte: 'Carte',
      lc: 'LC',
      compensation: 'Compensation',
      autre: 'Autre',
    };

    const reference = paiement.reference_virement
      || paiement.numero_cheque
      || paiement.numero_reference_lc
      || (paiement.id_lc ? `LC #${paiement.id_lc}` : null);

    return reference
      ? `${labels[paiement.type_paiement] || paiement.type_paiement} - ${reference}`
      : labels[paiement.type_paiement] || paiement.type_paiement;
  };

  /**
   * Colonnes exportées dans le même ordre que le registre visible.
   */
  const transactionColumns = [
    {
      id: 'date_transaction',
      label: 'Date',
    },
    {
      id: 'type_transaction',
      label: 'Type',
    },
    {
      id: 'client_ou_fournisseur',
      label: 'Client / Fournisseur',
    },
    {
      id: 'produit',
      label: 'Produit',
    },
    {
      id: 'batiment',
      label: 'Bâtiment',
    },
    {
      id: 'quantite',
      label: 'Quantité',
    },
    {
      id: 'montant_total',
      label: 'Total',
    },
    {
      id: 'montant_paye',
      label: 'Payé',
    },
    {
      id: 'montant_restant',
      label: 'Reste',
    },
    {
      id: 'reglement',
      label: 'Règlement',
    },
    {
      id: 'statut_paiement',
      label: 'Statut',
    },
  ];

  /**
   * Gère l'export Excel des transactions.
   */
  const handleExportExcel = async () => {
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
        type_transaction: (value, row) => (
          row.id_client !== null && row.id_client !== undefined ? 'Vente' : 'Achat'
        ),
        client_ou_fournisseur: () => client?.nom_client || 'Client',
        batiment: (value, row) => (
          row.id_batiment ? (batimentsMap.get(row.id_batiment) || `Bâtiment #${row.id_batiment}`) : '-'
        ),
        montant_total: (value, row) => {
          const amount = Math.abs(Number(value || 0));
          const sign = row.id_client !== null && row.id_client !== undefined ? '+' : '-';
          return `${sign}${formatMontant(amount, { useCompactNotation: false })}`;
        },
        montant_paye: (value) => {
          if (value === null || value === undefined) return '-';
          return formatMontant(value, { useCompactNotation: false });
        },
        montant_restant: (value) => {
          if (value === null || value === undefined) return '-';
          return formatMontant(value, { useCompactNotation: false });
        },
        reglement: (value, row) => getPaymentReglementSummary(row),
        statut_paiement: (value, row) => {
          if (row.est_actif === false) return 'Inactive';
          const statut = row.est_en_retard ? 'en_retard' : (row.statut_paiement || 'impaye');
          return {
            paye: 'Payé',
            partiel: 'Partiel',
            impaye: 'Impayé',
            en_retard: 'En retard',
          }[statut] || statut;
        },
      };

      await exportToExcelAdvanced(
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
  });

  /**
   * Configuration des champs du formulaire.
   */
  const clientFields = [
    {
      name: 'nom_client',
      label: 'Nom du client',
      type: 'text',
      placeholder: 'Ex. Marché central',
      required: true,
      helperText: "Utilisez le nom que l'équipe reconnaît au quotidien.",
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
            Nouvelle vente
          </Button>
        </Box>
      </Box>

      <Card
        variant="outlined"
        sx={{
          mb: { xs: 2, sm: 2.5, md: 3 },
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          variant={isMobile ? 'scrollable' : 'fullWidth'}
          scrollButtons="auto"
          sx={{
            px: { xs: 1, sm: 2 },
            '& .MuiTab-root': {
              minHeight: 58,
              fontWeight: 800,
              textTransform: 'none',
            },
          }}
        >
          <Tab value="resume" label="Résumé" />
          <Tab value="transactions" label="Transactions" />
          <Tab value="produits" label="Œufs achetés" />
          <Tab value="analyse" label="Analyse" />
        </Tabs>
      </Card>

      <Box sx={{ display: activeTab === 'resume' ? 'block' : 'none' }}>
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

      <Card sx={{ mb: { xs: 2, sm: 2.5, md: 3 }, borderRadius: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            <Box>
              <Typography variant="h6" component="h2" fontWeight={900}>
                Tableau des créances
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Ventes, règlements et reste à encaisser pour ce client.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {[
                { value: 'week', label: 'Semaine' },
                { value: 'month', label: 'Mois' },
                { value: 'year', label: 'Année' },
              ].map((period) => (
                <Button
                  key={period.value}
                  size="small"
                  variant={balancePeriod === period.value ? 'contained' : 'outlined'}
                  onClick={() => setBalancePeriod(period.value)}
                  sx={{ borderRadius: 999 }}
                >
                  {period.label}
                </Button>
              ))}
            </Box>
          </Box>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={4}>
              <MiniBalanceCard label="Montant vendu" value={clientCreanceSummary.total} color="primary.main" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <MiniBalanceCard label="Déjà encaissé" value={clientCreanceSummary.encaisse} color="success.main" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <MiniBalanceCard label="Reste à encaisser" value={clientCreanceSummary.reste} color="warning.main" />
            </Grid>
          </Grid>

          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 1080 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Produit</TableCell>
                  <TableCell>Bâtiment</TableCell>
                  <TableCell align="right">Quantité</TableCell>
                  <TableCell align="right">Prix</TableCell>
                  <TableCell align="right">Montant vendu</TableCell>
                  <TableCell>Règlement</TableCell>
                  <TableCell>Échéance</TableCell>
                  <TableCell align="right">Encaissé</TableCell>
                  <TableCell align="right">Reste</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clientCreanceRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 3 }}>
                      Aucune vente client sur cette période
                    </TableCell>
                  </TableRow>
                ) : (
                  clientCreanceRows.map((transaction) => (
                    <TableRow key={transaction.id_transaction} hover>
                      <TableCell>{formatDate(transaction.date_transaction)}</TableCell>
                      <TableCell>{produitsMap.get(transaction.id_produit) || `Produit #${transaction.id_produit || '-'}`}</TableCell>
                      <TableCell>{transaction.id_batiment ? (batimentsMap.get(transaction.id_batiment) || `Bâtiment #${transaction.id_batiment}`) : '-'}</TableCell>
                      <TableCell align="right">{transaction.quantite}</TableCell>
                      <TableCell align="right">{formatMontant(transaction.prix_unitaire, { useCompactNotation: false })}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>
                        {formatMontant(Math.abs(Number(transaction.montant_total || 0)), { useCompactNotation: false })}
                      </TableCell>
                      <TableCell>{getPaymentLabel(transaction)}</TableCell>
                      <TableCell>{formatDate(transaction.date_echeance)}</TableCell>
                      <TableCell align="right" sx={{ color: 'success.main', fontWeight: 800 }}>
                        {formatMontant(Math.abs(Number(transaction.montant_paye || 0)), { useCompactNotation: false })}
                      </TableCell>
                      <TableCell align="right" sx={{ color: Number(transaction.montant_restant || 0) > 0 ? 'warning.main' : 'success.main', fontWeight: 900 }}>
                        {formatMontant(Math.abs(Number(transaction.montant_restant || 0)), { useCompactNotation: false })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
      </Box>

      <Box sx={{ display: activeTab === 'analyse' ? 'block' : 'none' }}>
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

      </Box>

      <Box sx={{ display: activeTab === 'produits' ? 'block' : 'none' }}>
      {/* Section Produits Achetés */}
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
            Produits achetés - Inventaire client
          </Typography>

          {/* KPIs Produits */}
          <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }} sx={{ mb: { xs: 2, sm: 2.5, md: 3 } }}>
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Produits différents"
                value={produitsAchetes?.nombre_produits_differents || 0}
                icon={<ShoppingCartIcon />}
                valueFormat="number"
                color="info"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title="Quantité totale"
                value={produitsAchetes?.quantite_totale_tous_produits || 0}
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

          {(!produitsAchetes?.produits || produitsAchetes.produits.length === 0) && (
            <Box sx={{ 
              textAlign: 'center', 
              py: 4, 
              px: 2, 
              border: '1px dashed', 
              borderColor: 'divider', 
              borderRadius: 2, 
              backgroundColor: 'action.hover' 
            }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Aucun produit acheté pour le moment
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Les statistiques de vente et l'inventaire s'afficheront dès que des transactions seront créées pour ce client.
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
      </Box>

      <Box sx={{ display: activeTab === 'transactions' ? 'block' : 'none' }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: { xs: 1.5, sm: 2 } }}>
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
        <TransactionsExcelRegister
          rows={transactions || []}
          loading={false}
          getClientOuFournisseur={() => client?.nom_client || 'Client'}
          produitsMap={produitsMap}
          batimentsMap={batimentsMap}
          formatMontant={(value) => formatMontant(value, { useCompactNotation: false })}
          dailySummaryMode="entries"
          onView={handleViewTransaction}
          title="Historique des transactions"
          description=""
          emptyTitle="Aucune transaction disponible"
          emptyDescription="Ce client n'a pas encore de transaction."
        />
      </Box>

      {/* Modal de modification */}
      <ModalForm
        open={modalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        initialValues={
          client
            ? {
                nom_client: client.nom_client,
                est_actif: true,
              }
            : {
                nom_client: '',
                est_actif: true,
              }
        }
        validationSchema={clientValidationSchema}
        fields={clientFields}
        title="Modifier ce client"
        submitLabel="Enregistrer"
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

function MiniBalanceCard({ label, value, color }) {
  return (
    <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.5, fontSize: '1.25rem', fontWeight: 900, color }}>
        {formatMontant(value, { useCompactNotation: false })}
      </Typography>
    </Box>
  );
}
