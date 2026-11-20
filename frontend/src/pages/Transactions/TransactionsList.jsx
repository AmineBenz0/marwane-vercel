/**
 * Page Liste Transactions.
 * 
 * Affiche la liste des transactions avec :
 * - Registre Excel lisible
 * - Filtres avancés : date (range), client, fournisseur, produit, montant (min/max), statut
 * - Actions : créer, voir détails, éditer, supprimer (soft delete)
 * - Pagination
 * 
 * Chaque transaction représente une ligne de vente/achat avec un seul produit.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Typography,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Chip,
  Stack,
} from '@mui/material';
import {
  Add as AddIcon,
  FileDownload as FileDownloadIcon,
  PictureAsPdf as PictureAsPdfIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Payments as PaymentsIcon,
  ReceiptLong as ReceiptLongIcon,
} from '@mui/icons-material';
import TransactionForm from './TransactionForm';
import TransactionEditForm from './TransactionEditForm';
import ReactivationReviewDialog from './ReactivationReviewDialog';
import useCorrectionRefresh from '../../components/Corrections/useCorrectionRefresh';

import { deferredSaleStatus } from './deferredSaleStatus';
import SmartFilterPanel from '../../components/Filters/SmartFilterPanel';
import { get, post, put, del } from '../../services/api';
import { format } from 'date-fns';
import { formatShortDate } from '../../utils/dateFormatting';
import { exportToExcelSheets } from '../../utils/exportToExcel';
import { exportTransactionsReportPDF } from '../../utils/exportTransactionsReportPDF';
import { getSettlementStatus, SETTLEMENT_STATUS_LABELS } from '../../utils/settlementStatus';
import { sumActiveTransactionAmounts, transactionNetAmount } from '../../utils/transactionAmounts';
import { resolveTransactionExportRows } from './resolveTransactionExportReferences';
import { loadTransactionPages } from './transactionPages';
import { countTransactionQuickFilters, filterTransactions, summarizeTransactions } from './transactionListModel';
import useNotification from '../../hooks/useNotification';
import { buildTransactionPaymentBatch } from './transactionPaymentBatch';
import { formatMontant as formatMontantUtil, formatMontantComplet } from '../../utils/formatNumber';
import TransactionsExcelRegister from '../../components/TransactionsExcelRegister';
import PageHeader from '../../components/Layout/PageHeader';

const CORRECTION_WRITES_ENABLED = import.meta.env.VITE_ENABLE_CORRECTION_WRITES === 'true';

/**
 * Composant TransactionsList.
 */
function TransactionsList() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Hook pour les notifications
  const notification = useNotification();

  // ðtat pour les transactions
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  // ðtat pour les clients, fournisseurs et produits (pour les filtres et l'affichage)
  const [clients, setClients] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [produits, setProduits] = useState([]);
  const [batiments, setBatiments] = useState([]);

  // ðtat pour la modal de création/édition
  const [modalOpen, setModalOpen] = useState(false);
  const [newTransactionType, setNewTransactionType] = useState('client');
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [prefillBatimentId, setPrefillBatimentId] = useState(null);

  // ðtat pour la confirmation de suppression
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [transactionToRestore, setTransactionToRestore] = useState(null);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ðtat pour les filtres (objet unique)
  const [filters, setFilters] = useState({
    dateDebut: '',
    dateFin: '',
    client: '',
    fournisseur: '',
    produit: '',
    montantMin: '',
    montantMax: '',
    estActif: '',
  });
  const [quickFilter, setQuickFilter] = useState(() => new URLSearchParams(location.search).get('view') || 'all');
  const loadRequest = useRef(0);
  const [stockFilter, setStockFilter] = useState(() => new URLSearchParams(location.search).get('stock') || 'all');
  const deferredOnly = quickFilter === 'deferred';
  const sourceBuilding = new URLSearchParams(location.search).get('building');
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setQuickFilter(params.get('view') || 'all');
    setStockFilter(params.get('stock') || 'all');
  }, [location.search]);
  const selectQuickFilter = value => {
    setQuickFilter(value);
    setStockFilter('all');
    const params = new URLSearchParams(location.search);
    params.delete('stock');
    if (value !== 'all') params.set('view', value);
    else params.delete('view');
    if (params.toString() !== location.search.replace(/^\?/, '')) navigate({ pathname: location.pathname, search: params.toString() });
  };

  /**
   * Gestion des filtres.
   */
  const handleFilterChange = (filterId, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterId]: value,
    }));
  };

  const handleClearAllFilters = () => {
    setFilters({
      dateDebut: '',
      dateFin: '',
      client: '',
      fournisseur: '',
      produit: '',
      montantMin: '',
      montantMax: '',
      estActif: '',
    });
  };

  /**
   * Crée des maps de lookup pour clients, fournisseurs et produits.
   */
  const clientsMap = useMemo(() => {
    const map = new Map();
    clients.forEach((client) => {
      map.set(client.id_client, client.nom_client);
    });
    return map;
  }, [clients]);

  const fournisseursMap = useMemo(() => {
    const map = new Map();
    fournisseurs.forEach((fournisseur) => {
      map.set(fournisseur.id_fournisseur, fournisseur.nom_fournisseur);
    });
    return map;
  }, [fournisseurs]);

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
   * Définitions des filtres pour SmartFilterPanel.
   */
  const filterDefinitions = useMemo(() => [
    {
      id: 'dateDebut',
      label: 'Date début',
      type: 'date',
      alwaysInline: true, // Toujours visible
      formatChipValue: (value) => {
        try {
          return formatShortDate(value, String(value));
        } catch {
          return value;
        }
      },
    },
    {
      id: 'dateFin',
      label: 'Date fin',
      type: 'date',
      alwaysInline: true, // Toujours visible
      formatChipValue: (value) => {
        try {
          return formatShortDate(value, String(value));
        } catch {
          return value;
        }
      },
    },
    {
      id: 'client',
      label: 'Client',
      type: 'select',
      options: clients.map((c) => ({
        value: c.id_client.toString(),
        label: c.nom_client,
      })),
      formatChipValue: (value) => {
        const client = clients.find((c) => c.id_client.toString() === value);
        return client ? client.nom_client : value;
      },
    },
    {
      id: 'fournisseur',
      label: 'Fournisseur',
      type: 'select',
      options: fournisseurs.map((f) => ({
        value: f.id_fournisseur.toString(),
        label: f.nom_fournisseur,
      })),
      formatChipValue: (value) => {
        const fournisseur = fournisseurs.find((f) => f.id_fournisseur.toString() === value);
        return fournisseur ? fournisseur.nom_fournisseur : value;
      },
    },
    {
      id: 'produit',
      label: 'Produit vendu / acheté',
      type: 'select',
      options: produits.map((p) => ({
        value: p.id_produit.toString(),
        label: p.nom_produit,
      })),
      formatChipValue: (value) => {
        const produit = produits.find((p) => p.id_produit.toString() === value);
        return produit ? produit.nom_produit : value;
      },
    },
    {
      id: 'montantMin',
      label: 'Montant min',
      type: 'number',
      min: 0,
      step: 0.01,
      formatChipValue: (value) => `${value} MAD`,
    },
    {
      id: 'montantMax',
      label: 'Montant max',
      type: 'number',
      min: 0,
      step: 0.01,
      formatChipValue: (value) => `${value} MAD`,
    },
  ], [clients, fournisseurs, produits]);

  /**
   * Charge la liste des clients, fournisseurs et produits.
   */
  const fetchReferenceData = async () => {
    try {
      const [clientsData, fournisseursData, produitsData, batimentsData] = await Promise.all([
        get('/clients', { referenceData: true, params: { limit: 1000, est_actif: true } }),
        get('/fournisseurs', { referenceData: true, params: { limit: 1000, est_actif: true } }),
        get('/produits', { referenceData: true, params: { limit: 1000, est_actif: true } }),
        get('/batiments', { referenceData: true }),
      ]);
      setClients(clientsData || []);
      setFournisseurs(fournisseursData || []);
      setProduits(produitsData || []);
      setBatiments(batimentsData || []);
    } catch (err) {
      console.error('Erreur lors du chargement des données de référence:', err);
    }
  };

  /**
   * Charge la liste des transactions depuis l'API.
   */
  const fetchTransactions = async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    setError(null);

    try {
      // Construire les paramètres de requête
      const params = {};
      
      if (filters.dateDebut) {
        params.date_debut = filters.dateDebut;
      }
      if (filters.dateFin) {
        params.date_fin = filters.dateFin;
      }
      if (filters.client !== '') {
        params.id_client = parseInt(filters.client);
      }
      if (filters.fournisseur !== '') {
        params.id_fournisseur = parseInt(filters.fournisseur);
      }
      if (filters.produit !== '') {
        params.id_produit = parseInt(filters.produit);
      }
      if (filters.montantMin !== '') {
        params.montant_min = parseFloat(filters.montantMin);
      }
      if (filters.montantMax !== '') {
        params.montant_max = parseFloat(filters.montantMax);
      }
      if (filters.estActif !== '') {
        params.est_actif = filters.estActif === 'true';
      }

      if (deferredOnly) params.est_promesse = true;
      if (sourceBuilding) params.id_batiment = Number(sourceBuilding);

      const data = await loadTransactionPages(get, params);

      if (request === loadRequest.current) setTransactions(data || []);
    } catch (err) {
      if (request !== loadRequest.current) return;
      setTransactions([]);
      console.error('Erreur lors du chargement des transactions:', err);
      setError(
        err?.message || 'Une erreur est survenue lors du chargement des transactions'
      );
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  };

  // Charger les données de référence au montage
  useEffect(() => {
    fetchReferenceData();
  }, []);

  // Charger les transactions au montage et lorsque les filtres changent
  useEffect(() => {
    fetchTransactions();
    return () => { loadRequest.current += 1; };
  }, [filters, deferredOnly, sourceBuilding]);

  useEffect(() => {
    const sourceBatimentId = location.state?.sourceBatimentId;
    if (!sourceBatimentId) return;

    setPrefillBatimentId(sourceBatimentId);
    setEditingTransaction(null);
    setFormError(null);
    setModalOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  /**
   * Gère l'ouverture de la modal pour créer une nouvelle transaction.
   */
  const handleCreate = (type = 'client') => {
    setEditingTransaction(null);
    setPrefillBatimentId(null);
    setFormError(null);
    setNewTransactionType(type);
    setModalOpen(true);
  };

  // Shortcut links such as /transactions?nouveau=vente (from the home page)
  // open the creation form directly; the parameter is removed afterwards.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requested = params.get('nouveau');
    if (requested !== 'vente' && requested !== 'achat') return;
    handleCreate(requested === 'achat' ? 'fournisseur' : 'client');
    params.delete('nouveau');
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : '' }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  /**
   * Gère l'ouverture de la page de détails d'une transaction.
   */
  useCorrectionRefresh(() => fetchTransactions());

  const handleViewDetails = (transaction) => {
    navigate(`/transactions/${transaction.id_transaction}`);
  };

  /**
   * Gère l'ouverture de la modal pour éditer une transaction existante.
   */
  const handleEdit = async (transaction) => {
    try {
      // Récupérer les détails complets de la transaction
      const details = await get(`/transactions/${transaction.id_transaction}`);
      setEditingTransaction(details);
      setPrefillBatimentId(null);
      setFormError(null);
      setModalOpen(true);
    } catch (err) {
      console.error('Erreur lors de la récupération des détails:', err);
      setError(err?.message || 'Erreur lors de la récupération des détails');
    }
  };

  /**
   * Gère la soumission du formulaire (création ou édition).
   */
  const handleSubmit = async (data) => {
    setFormLoading(true);
    setFormError(null);

    try {
      let result = null;
      
      if (editingTransaction) {
        // Mode édition : PUT (une seule transaction)
        // Extraire les données de paiement si présentes
        const transactionData = { ...data };
        delete transactionData.paiement;
        
        result = await put(`/transactions/${editingTransaction.id_transaction}`, transactionData);
        
        // Gérer les paiements si présents
        if (data.paiements && data.paiements.length > 0) {
          const paymentsPromises = data.paiements.map(async (p) => {
            const pData = {
              ...p,
              id_transaction: editingTransaction.id_transaction,
            };
            if (p.id_paiement) {
              return put(`/paiements/${p.id_paiement}`, pData);
            } else {
              return post('/paiements', pData);
            }
          });
          try {
            await Promise.all(paymentsPromises);
          } catch (err) {
            console.error('Erreur lors de la gestion des paiements:', err);
            notification.warning('Transaction modifiée mais certains paiements ont échoué');
          }
        }
        
        notification.success('Transaction modifiée avec succès');
      } else {
        // Mode création : vérifier si c'est un batch ou une transaction simple
        if (data.batch && data.transactions) {
          result = await post(
            '/transactions/batch-with-payments',
            buildTransactionPaymentBatch(data)
          );
          const paymentCount = result.reduce(
            (total, item) => total + (item.paiements?.length || 0),
            0
          );
          notification.success(
            `${result.length} transaction(s) créée(s) avec ${paymentCount} paiement(s).`
          );
        } else {
          // Création simple : POST /transactions
          result = await post('/transactions', data);
        }
      }

      // Fermer la modal et rafraîchir la liste
      setModalOpen(false);
      setEditingTransaction(null);
      setPrefillBatimentId(null);
      await fetchTransactions();
      
      return result;
    } catch (err) {
      console.error('Erreur lors de la soumission:', err);
      setFormError(
        err?.message || 'Une erreur est survenue lors de l\'enregistrement'
      );
      throw err; // Re-throw pour que le formulaire puisse gérer les erreurs de validation
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
      setEditingTransaction(null);
      setPrefillBatimentId(null);
      setFormError(null);
    }
  };

  /**
   * Gère le clic sur le bouton de suppression.
   */
  const handleDeleteClick = (transaction) => {
    setTransactionToDelete(transaction);
    setDeleteDialogOpen(true);
  };

  /**
   * Gère la confirmation de suppression.
   */
  const handleDeleteConfirm = async () => {
    if (!transactionToDelete) return;

    setDeleteLoading(true);

    try {
      // Appeler l'API pour supprimer (soft delete)
      await del(`/transactions/${transactionToDelete.id_transaction}`);

      // Fermer le dialogue et rafraîchir la liste
      setDeleteDialogOpen(false);
      setTransactionToDelete(null);
      await fetchTransactions();
    } catch (err) {
      console.error('Erreur lors de la suppression:', err);
      setError(
        err?.message || 'Une erreur est survenue lors de la suppression'
      );
      setDeleteDialogOpen(false);
      setTransactionToDelete(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  /**
   * Gère l'annulation de la suppression.
   */
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setTransactionToDelete(null);
  };

  /**
   * Formate le montant pour l'affichage (wrapper de l'utilitaire).
   */
  const formatMontant = (montant, options = {}) => {
    return formatMontantUtil(montant, { useCompactNotation: false, ...options });
  };

  const handleExport = async (format) => {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      const namedRows = await resolveTransactionExportRows(rowsForExport, {
        clients: clientsMap, fournisseurs: fournisseursMap, produits: produitsMap, batiments: batimentsMap,
      }, get);
      const rows = namedRows.map(row => ({
        ...row,
        etat_transaction: row.est_actif === false ? 'Annulée' : 'Active',
        quantite_a_produire: row.est_promesse && row.est_actif !== false
          ? Math.max(0, Number(row.quantite_en_attente ?? 0) - Number(row.quantite_reservee ?? 0))
          : null,
      }));
      if (format === 'pdf') exportTransactionsReportPDF(rows);
      else await exportTransactionWorkbook(rows);
    } catch (error) {
      console.error('Erreur lors de l’export des transactions:', error);
      setError(error?.message || "Une erreur est survenue lors de l’export des transactions.");
    } finally {
      setExporting(false);
    }
  };

  /**
   * Obtient le nom du client ou fournisseur pour une transaction.
   */
  const getClientOuFournisseur = (transaction) => {
    if (transaction.id_client) {
      return clientsMap.get(transaction.id_client) || `Client #${transaction.id_client}`;
    } else if (transaction.id_fournisseur) {
      return fournisseursMap.get(transaction.id_fournisseur) || `Fournisseur #${transaction.id_fournisseur}`;
    }
    return '-';
  };

  // Préparer les données pour le registre
  const transactionsForGrid = useMemo(() => {
    return transactions.map((transaction) => ({
      ...transaction,
      client_ou_fournisseur: getClientOuFournisseur(transaction),
      etat_stock: deferredSaleStatus(transaction)?.label || '—',
      id: transaction.id_transaction, // ID pour React key
    }));
  }, [transactions, clientsMap, fournisseursMap, produitsMap]);

  const quickFilterCounts = useMemo(() => countTransactionQuickFilters(transactionsForGrid), [transactionsForGrid]);
  const quickFilterOptions = [
    { id: 'all', label: 'Tout', count: quickFilterCounts.all },
    { id: 'ventes', label: 'Ventes', count: quickFilterCounts.ventes },
    { id: 'achats', label: 'Achats', count: quickFilterCounts.achats },
    { id: 'non_payees', label: 'Non payées', count: quickFilterCounts.non_payees },
    { id: 'deferred', label: 'Livraisons différées', count: quickFilterCounts.deferred },
  ];

  const displayedTransactions = useMemo(
    () => filterTransactions(transactionsForGrid, quickFilter, stockFilter),
    [quickFilter, stockFilter, transactionsForGrid],
  );
  const transactionSummary = useMemo(
    () => summarizeTransactions(displayedTransactions),
    [displayedTransactions],
  );

  /**
   * Lignes actuellement affichées dans le registre, utilisées pour les exports.
   */
  const rowsForExport = displayedTransactions;

  return (
    <Box sx={{ maxWidth: 1480, mx: 'auto', overflowX: 'hidden' }}>
      <PageHeader
        title="Ventes & achats"
        description="Toutes les ventes aux clients et les achats aux fournisseurs, jour par jour."
        actions={(
          <>
            <Button
              variant="outlined"
              startIcon={<FileDownloadIcon />}
              onClick={() => handleExport('excel')}
              disabled={loading || exporting || rowsForExport.length === 0}
            >
              Exporter Excel
            </Button>
            <Button
              variant="outlined"
              startIcon={<PictureAsPdfIcon />}
              onClick={() => handleExport('pdf')}
              disabled={loading || exporting || rowsForExport.length === 0}
            >
              Exporter PDF
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleCreate()}>
              Nouvelle transaction
            </Button>
          </>
        )}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <TransactionMetric
            label="Toutes les opérations"
            value={transactionSummary.total}
            helper="Dans le résultat actuel"
            icon={<ReceiptLongIcon />}
            color="#315F85"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <TransactionMetric
            label="Ventes"
            value={formatMontant(transactionSummary.totalVentes)}
            helper={`${transactionSummary.ventes} transaction(s) client · montant net actuel`}
            icon={<TrendingUpIcon />}
            color="#1D6F50"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <TransactionMetric
            label="Achats"
            value={formatMontant(transactionSummary.totalAchats)}
            helper={`${transactionSummary.achats} transaction(s) fournisseur`}
            icon={<TrendingDownIcon />}
            color="#A84435"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <TransactionMetric
            label="À suivre"
            value={transactionSummary.nonPayees}
            helper="Impayées, partielles ou en retard"
            icon={<PaymentsIcon />}
            color="#A96522"
          />
        </Grid>
      </Grid>

      <Card sx={{ mb: 2.5, borderRadius: 2 }}>
        <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {quickFilterOptions.map((option) => (
                <Button
                  key={option.id}
                  variant={quickFilter === option.id ? 'contained' : 'outlined'}
                  size="small"
                  aria-pressed={quickFilter === option.id}
                  onClick={() => selectQuickFilter(option.id)}
                  sx={{ borderRadius: 999 }}
                >
                  {option.label}{!loading && (!deferredOnly || option.id === 'deferred') && (
                    ` (${deferredOnly ? displayedTransactions.length : option.count})`
                  )}
                </Button>
              ))}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {sourceBuilding && <Chip sx={{ mb: 2 }} label={`Bâtiment : ${batimentsMap.get(Number(sourceBuilding)) || sourceBuilding}`} onDelete={() => {
        const params = new URLSearchParams(location.search);
        params.delete('building');
        navigate({ pathname: location.pathname, search: params.toString() });
      }} />}
      {deferredOnly && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }} aria-label="Filtrer par état du stock">
        {[['all', 'Tous les états du stock'], ['pending', 'À produire'], ['reserved', 'Avec du stock réservé'], ['ready', 'Stock partiellement réservé'], ['waiting', 'En attente de production'], ['complete', 'Réservation complète']].map(([value, label]) =>
          <Button key={value} size="small" variant={stockFilter === value ? 'contained' : 'outlined'} aria-pressed={stockFilter === value} onClick={() => {
            const params = new URLSearchParams(location.search);
            params.set('stock', value);
            navigate({ pathname: location.pathname, search: params.toString() });
          }}>{label}</Button>)}
      </Stack>}

      <SmartFilterPanel
        pageKey="transactions"
        filterDefinitions={filterDefinitions}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearAll={handleClearAllFilters}
        maxInlineFilters={2}
        resultCount={displayedTransactions.length}
        totalCount={transactions.length}
      />

      <TransactionsExcelRegister
        title="Registre des transactions"
        description=""
        rows={displayedTransactions}
        loading={loading}
        getClientOuFournisseur={getClientOuFournisseur}
        produitsMap={produitsMap}
        batimentsMap={batimentsMap}
        formatMontant={formatMontant}
        onView={handleViewDetails}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
        onReactivate={setTransactionToRestore}
      />

      {transactionToRestore && <ReactivationReviewDialog
        transaction={transactionToRestore}
        onClose={() => setTransactionToRestore(null)}
        onSaved={() => {
          setTransactionToRestore(null);
          notification.success('Transaction réactivée avec succès');
        }}
      />}

      {CORRECTION_WRITES_ENABLED && editingTransaction && modalOpen ? (
        <TransactionEditForm
          open
          initialValues={editingTransaction}
          onClose={handleCloseModal}
          onCorrected={async () => {
            handleCloseModal();
            await fetchTransactions();
            notification.success('Correction enregistrée');
          }}
        />
      ) : (
        <TransactionForm
          open={modalOpen}
          onClose={handleCloseModal}
          onSubmit={handleSubmit}
          initialValues={editingTransaction || {}}
          loading={formLoading}
          errorMessage={formError}
          prefillBatimentId={prefillBatimentId}
          initialType={newTransactionType}
        />
      )}

      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">Confirmer la suppression</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Retirer cette transaction du registre actif ?
            <br />
            <br />
            Elle restera dans l'historique.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deleteLoading} color="inherit">
            Annuler
          </Button>
          <Button onClick={handleDeleteConfirm} disabled={deleteLoading} color="error" variant="contained">
            {deleteLoading ? 'Suppression...' : 'Supprimer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

}

function TransactionMetric({ label, value, helper, icon, color }) {
  return (
    <Card role="group" aria-label={label} sx={{ height: '100%', borderRadius: 2 }}>
      <CardContent sx={{ p: 2.25 }}>
        <Stack direction="row" spacing={1.5} justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography
              variant="overline"
              sx={{ color: 'text.secondary', fontWeight: 800, letterSpacing: '0.08em' }}
            >
              {label}
            </Typography>
            <Typography sx={{ mt: 0.5, fontWeight: 900, fontSize: '1.5rem', letterSpacing: 0 }}>
              {value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {helper}
            </Typography>
          </Box>
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color,
              backgroundColor: `${color}1F`,
              flexShrink: 0,
              '& .MuiSvgIcon-root': { fontSize: 22 },
            }}
          >
            {icon}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

const PAYMENT_TYPE_LABELS = {
  cash: 'Espèce',
  cheque: 'Chèque',
  virement: 'Virement',
  carte: 'Carte',
  compensation: 'Compensation',
  lc: 'LC',
  autre: 'Autre',
};

const REFERENCE_PAYMENT_TYPES = new Set(['cheque', 'virement', 'lc']);






const getPaymentTypeLabel = (payment) => (
  PAYMENT_TYPE_LABELS[payment?.type_paiement] || payment?.type_paiement || 'Paiement'
);

const getPaymentReferenceValue = (payment) => {
  if (!payment) return null;

  if (payment.type_paiement === 'cheque') {
    return payment.numero_cheque || null;
  }

  if (payment.type_paiement === 'virement') {
    return payment.reference_virement || null;
  }

  if (payment.type_paiement === 'lc') {
    return payment.numero_reference_lc || (payment.id_lc ? `LC ${payment.id_lc}` : null);
  }

  return payment.reference_virement
    || payment.numero_cheque
    || payment.numero_reference_lc
    || (payment.id_lc ? `LC ${payment.id_lc}` : null);
};



const SETTLEMENT_OPERATION_LABELS = {
  paiement: 'Paiement',
  remboursement: 'Remboursement',
  credit_recu: 'Crédit utilisé',
  credit_transfere: 'Crédit transféré',
};

const settlementExportColumns = [
  { id: 'numero_export', label: 'N° export' },
  { id: 'date_transaction', label: 'Date transaction' },
  { id: 'client_ou_fournisseur', label: 'Client / Fournisseur', excelWidth: 38 },
  { id: 'produit_label', label: 'Produit vendu / acheté', excelWidth: 40 },
  { id: 'etat_transaction', label: 'État transaction' },
  { id: 'date_paiement', label: 'Date règlement' },
  { id: 'operation', label: 'Opération', excelWidth: 20 },
  { id: 'moyen', label: 'Moyen' },
  { id: 'reference', label: 'Référence', excelWidth: 24 },
  { id: 'montant', label: 'Montant', excelNumberFormat: () => '#,##0.00 "MAD"' },
  { id: 'statut', label: 'Statut' },
];

const getSettlementExportRows = (transactions) => transactions.flatMap(transaction =>
  (transaction.paiements || []).filter(Boolean).map(payment => {
    const { nature, type_paiement } = payment;
    const isTransfer = nature === 'credit_transfere';
    const isCredit = isTransfer || nature === 'credit_recu';
    const isOutgoing = isTransfer || nature === 'remboursement';
    const amount = payment.montant == null ? null : Number(payment.montant);
    return {
      numero_export: transaction.numero_export,
      date_transaction: transaction.date_transaction,
      client_ou_fournisseur: transaction.client_ou_fournisseur,
      produit_label: transaction.produit_label,
      etat_transaction: transaction.etat_transaction,
      date_paiement: formatShortDate(payment.date_paiement, ''),
      operation: SETTLEMENT_OPERATION_LABELS[nature] || nature || 'Paiement',
      moyen: isCredit ? '' : getPaymentTypeLabel(payment),
      reference: isCredit ? '' : getPaymentReferenceValue(payment)
        || (REFERENCE_PAYMENT_TYPES.has(type_paiement) ? 'réf. manquante' : ''),
      montant: amount != null && isOutgoing ? -amount : amount,
      statut: SETTLEMENT_STATUS_LABELS[getSettlementStatus(payment)],
    };
  })
);

const transactionExportColumns = [
  { id: 'date_transaction', label: 'Date' },
  { id: 'client_ou_fournisseur', label: 'Client / Fournisseur', excelWidth: 38 },
  { id: 'produit_label', label: 'Produit vendu / acheté', excelWidth: 40 },
  { id: 'batiment_label', label: 'Bâtiment', excelWidth: 26 },
  { id: 'quantite', label: 'Quantité' },
  { id: 'montant_total', label: 'Montant initial', excelNumberFormat: () => '#,##0.00 "MAD"' },
  { id: 'montant_avoir', label: 'Avoirs commerciaux', excelNumberFormat: () => '#,##0.00 "MAD"' },
  { id: 'montant_net', label: 'Montant net', excelNumberFormat: () => '#,##0.00 "MAD"' },
  { id: 'avoirs_details', label: 'Détail des avoirs', excelWidth: 47 },
  { id: 'montant_paye', label: 'Payé', excelNumberFormat: () => '#,##0.00 "MAD"' },
  { id: 'montant_restant', label: 'Reste', excelNumberFormat: () => '#,##0.00 "MAD"' },
  { id: 'numero_export', label: 'N° export' },
  { id: 'statut_paiement', label: 'Paiement' },
  { id: 'etat_stock', label: 'Stock' },
  { id: 'date_livraison_prevue', label: 'Livraison prévue' },
  { id: 'etat_transaction', label: 'État' },
];

const deferredExportColumns = [
  { id: 'quantite_couverte', label: 'Quantité couverte' },
  { id: 'quantite_reservee', label: 'Stock prêt à compléter' },
  { id: 'quantite_en_attente', label: 'Reste à fournir' },
  { id: 'quantite_a_produire', label: 'À produire' },
  { id: 'quantite_annulee', label: 'Quantité annulée' },
];

export const exportTransactionWorkbook = (rows) => {
  const hasDeferred = rows.some(row => row.est_promesse);
  const columns = hasDeferred ? [...transactionExportColumns, ...deferredExportColumns] : transactionExportColumns;
  const data = rows.map((row, index) => {
    const status = row.est_en_retard ? 'en_retard' : row.statut_paiement;
    return {
      ...row,
      numero_export: index + 1,
      date_transaction: formatShortDate(row.date_transaction, row.date_transaction || '-'),
      date_livraison_prevue: row.date_livraison_prevue
        ? formatShortDate(row.date_livraison_prevue, row.date_livraison_prevue)
        : '',
      montant_total: Number(row.montant_total ?? 0),
      montant_avoir: Number(row.montant_avoir ?? 0),
      montant_net: transactionNetAmount(row),
      avoirs_details: (row.avoirs_livraison_differee || [])
        .map(avoir => `${formatShortDate(avoir.date_effet)} : ${formatMontantComplet(avoir.montant_avoir)}`)
        .join(' | '),
      montant_paye: Number(row.montant_paye ?? 0),
      montant_restant: Number(row.montant_restant ?? 0),
      etat_transaction: row.est_actif === false ? 'Annulée' : 'Active',
      statut_paiement: {
        impaye: 'Impayé', partiel: 'Partiel', paye: 'Payé', surpaye: 'Surpayé', en_retard: 'En retard',
      }[status] || status || '-',
      quantite_couverte: row.est_promesse ? row.quantite_couverte : '',
      quantite_reservee: row.est_promesse ? row.quantite_reservee : '',
      quantite_en_attente: row.est_promesse ? row.quantite_en_attente : '',
    };
  });
  const totals = sumActiveTransactionAmounts(rows);
  const settlements = getSettlementExportRows(data);
  return exportToExcelSheets([
    {
      sheetName: 'Transactions',
      columns,
      filterRows: data.length,
      data: [...data, {}, {
        quantite: 'Total :', montant_total: totals.gross,
        montant_avoir: totals.credits,
        montant_net: totals.net,
        montant_paye: totals.paid,
        montant_restant: totals.remaining,
      }],
    },
    {
      sheetName: 'Règlements',
      columns: settlementExportColumns,
      filterRows: settlements.length,
      data: settlements,
    },
  ], `transactions_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}`);
};

export default TransactionsList;
