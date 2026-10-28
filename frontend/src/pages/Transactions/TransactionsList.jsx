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
import { deferredSaleStatus } from './deferredSaleStatus';
import { deferredStockQuantities } from './deferredStockQuantities';
import { countTransactionQuickFilters, filterTransactions, summarizeTransactions } from './transactionListModel';
import SmartFilterPanel from '../../components/Filters/SmartFilterPanel';
import PaymentStatusBadge from '../../components/PaymentStatusBadge';
import TransactionsExcelRegister, { getPaymentReglementSummary } from '../../components/TransactionsExcelRegister';
import { get, post, put, patch, del } from '../../services/api';
import { format } from 'date-fns';
import { formatShortDate } from '../../utils/dateFormatting';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import { exportToPDF } from '../../utils/exportToPDF';
import useNotification from '../../hooks/useNotification';
import { buildTransactionPaymentBatch } from './transactionPaymentBatch';
import { formatMontant as formatMontantUtil } from '../../utils/formatNumber';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ðtat pour les clients, fournisseurs et produits (pour les filtres et l'affichage)
  const [clients, setClients] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [produits, setProduits] = useState([]);
  const [batiments, setBatiments] = useState([]);

  // ðtat pour la modal de création/édition
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [prefillBatimentId, setPrefillBatimentId] = useState(null);

  // ðtat pour la confirmation de suppression
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
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

      // Récupérer les transactions
      const data = await get('/transactions', {
        params: {
          ...params,
          limit: 1000, // Limite élevée pour récupérer toutes les transactions
        },
      });

      if (request === loadRequest.current) setTransactions(data || []);
    } catch (err) {
      if (request !== loadRequest.current) return;
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
  const handleCreate = () => {
    setEditingTransaction(null);
    setPrefillBatimentId(null);
    setFormError(null);
    setModalOpen(true);
  };

  /**
   * Gère l'ouverture de la page de détails d'une transaction.
   */
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
   * Gère la réactivation d'une transaction.
   */
  const handleReactivate = async (transaction) => {
    try {
      // Appeler l'API pour réactiver (PATCH)
      await patch(`/transactions/${transaction.id_transaction}/reactivate`, {});
      
      // Rafraîchir la liste
      await fetchTransactions();
      
      // Notification de succès
      notification.success('Transaction réactivée avec succès');
    } catch (err) {
      console.error('Erreur lors de la réactivation:', err);
      setError(
        err?.message || 'Une erreur est survenue lors de la réactivation'
      );
    }
  };

  /**
   * Formate le montant pour l'affichage (wrapper de l'utilitaire).
   */
  const formatMontant = (montant, options = {}) => {
    return formatMontantUtil(montant, { useCompactNotation: false, ...options });
  };

  /**
   * Gère l'export Excel des transactions filtrées.
   */
  const handleExportExcel = async () => {
    try {
      const hasPromises = rowsForExport.some(row => row.est_promesse);
      const columnsForExport = [...columns.filter((col) => col.id !== 'est_actif'), ...(hasPromises ? [
        { id: 'quantite_completee', label: 'Quantité complétée' },
        { id: 'quantite_reservee', label: 'Stock prêt à compléter' },
        { id: 'quantite_en_attente', label: 'Reste à fournir' },
        { id: 'quantite_a_produire', label: 'À produire' },
        { id: 'quantite_annulee', label: 'Reste clôturé' },
      ] : [])];
      const promiseRows = rowsForExport.map(row => ({
        ...row,
        quantite_a_produire: deferredStockQuantities(row).toProduce,
      }));
      const totalMontant = rowsForExport.reduce(
        (acc, row) => acc + (row?.montant_total ? Number(row.montant_total) : 0),
        0
      );

      const createEmptyRow = () =>
        columnsForExport.reduce((acc, col) => {
          acc[col.id] = '';
          return acc;
        }, {});

      const spacerRow = { ...createEmptyRow(), __summaryType: 'spacer' };

      const montantColumnIndex = columnsForExport.findIndex(
        (col) => col.id === 'montant_total'
      );
      const totalLabelColumnId =
        montantColumnIndex > 0
          ? columnsForExport[montantColumnIndex - 1]?.id
          : null;

      const totalRow = {
        ...createEmptyRow(),
        __summaryType: 'total',
        montant_total: totalMontant,
      };

      if (totalLabelColumnId) {
        totalRow[totalLabelColumnId] = 'Total :';
      }

      const dataForExcel = [...promiseRows, spacerRow, totalRow];

      // Utiliser des formatters personnalisés pour l'export
      const customFormatters = {
        date_transaction: (value, row) => {
          if (row?.__summaryType) return '';
          if (!value) return '-';
          try {
            return formatShortDate(value, String(value));
          } catch {
            return value;
          }
        },
        produit: (value, row) => {
          if (row?.__summaryType) return '';
          return produitsMap.get(row.id_produit) || `Produit #${row.id_produit}`;
        },
        batiment: (value, row) => {
          if (row?.__summaryType) return '';
          return row.id_batiment
            ? (batimentsMap.get(row.id_batiment) || `Bâtiment #${row.id_batiment}`)
            : '-';
        },
        reglement: (value, row) => {
          if (row?.__summaryType) return '';
          return getPaymentReglementSummary(row);
        },
        montant_total: (value, row) => {
          if (row?.__summaryType === 'spacer') return '';
          if (row?.__summaryType === 'total') {
            return new Intl.NumberFormat('fr-FR', {
              style: 'currency',
              currency: 'MAD',
            }).format(value || 0);
          }
          if (value === null || value === undefined) return '-';
          return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'MAD',
          }).format(value);
        },
        montant_paye: (value, row) => {
          if (row?.__summaryType) return '';
          if (value === null || value === undefined) return '-';
          return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'MAD',
          }).format(value);
        },
        montant_restant: (value, row) => {
          if (row?.__summaryType) return '';
          if (value === null || value === undefined) return '-';
          return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'MAD',
          }).format(value);
        },
      };

      await exportToExcelAdvanced(
        dataForExcel,
        columnsForExport,
        `transactions_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}`,
        'Transactions',
        customFormatters
      );
    } catch (error) {
      console.error('Erreur lors de l\'export Excel:', error);
      setError('Une erreur est survenue lors de l\'export Excel');
    }
  };

  /**
   * Gère l'export PDF des transactions filtrées.
   */
  const handleExportPDF = () => {
    try {
      const hasPromises = rowsForExport.some(row => row.est_promesse);
      const columnsForExport = [...columns.filter((col) => col.id !== 'est_actif'), ...(hasPromises ? [
        { id: 'quantite_completee', label: 'Quantité complétée' },
        { id: 'quantite_reservee', label: 'Stock prêt à compléter' },
        { id: 'quantite_en_attente', label: 'Reste à fournir' },
        { id: 'quantite_a_produire', label: 'À produire' },
        { id: 'quantite_annulee', label: 'Reste clôturé' },
      ] : [])];
      const promiseRows = rowsForExport.map(row => ({
        ...row,
        quantite_a_produire: deferredStockQuantities(row).toProduce,
      }));
      const totalMontant = rowsForExport.reduce(
        (acc, row) => acc + (row?.montant_total ? Number(row.montant_total) : 0),
        0
      );
      const totalMontantFormatted =
        new Intl.NumberFormat('fr-FR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
          .format(totalMontant)
          .replace(/\s/g, '\u00A0') + '\u00A0MAD';

      const customFormatters = {
        date_transaction: (value) => {
          if (!value) return '-';
          try {
            return formatShortDate(value, String(value));
          } catch {
            return value;
          }
        },
        produit: (value, row) => {
          return produitsMap.get(row.id_produit) || `Produit #${row.id_produit}`;
        },
        batiment: (value, row) => {
          return row.id_batiment
            ? (batimentsMap.get(row.id_batiment) || `Bâtiment #${row.id_batiment}`)
            : '-';
        },
        reglement: (value, row) => getPaymentReglementSummary(row),
        montant_total: (value) => {
          if (value === null || value === undefined) return '-';
          // Conserver les séparateurs de milliers et empêcher les retours à la ligne
          return (
            new Intl.NumberFormat('fr-FR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
              .format(value)
              .replace(/\s/g, '\u00A0') + '\u00A0MAD'
          );
        },
        montant_paye: (value) => {
          if (value === null || value === undefined) return '-';
          return (
            new Intl.NumberFormat('fr-FR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
              .format(value)
              .replace(/\s/g, '\u00A0') + '\u00A0MAD'
          );
        },
        montant_restant: (value) => {
          if (value === null || value === undefined) return '-';
          return (
            new Intl.NumberFormat('fr-FR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
              .format(value)
              .replace(/\s/g, '\u00A0') + '\u00A0MAD'
          );
        },
      };

      exportToPDF(
        promiseRows,
        columnsForExport,
        'Rapport des Transactions',
        'rapport_transactions',
        { 
          customFormatters,
          colorByType: (rowIndex) => {
            // Retourne true si c'est une entrée (client), false si sortie (fournisseur)
            const transaction = rowsForExport[rowIndex];
            if (!transaction) return null;
            return transaction.id_client !== null;
          },
          footerTotals: {
            label: 'Total :',
            value: totalMontantFormatted,
            columnId: 'montant_total',
          },
        }
      );
    } catch (error) {
      console.error('Erreur lors de l\'export PDF:', error);
      setError('Une erreur est survenue lors de l\'export PDF');
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

  /**
   * Configuration des colonnes utilisées pour les exports.
   * Ordre : ID, Date, Client/Fournisseur, Produit, Bâtiment, Quantité, montants, règlement, statut.
   * mobilePriority: true pour les colonnes à afficher en priorité sur mobile
   */
  const columns = [
    {
      id: 'id_transaction',
      label: 'ID',
      sortable: true,
      filterable: false,
      align: 'right',
      mobilePriority: false,
    },
    {
      id: 'date_transaction',
      label: 'Date',
      sortable: true,
      filterable: false,
      mobilePriority: true,
      format: (value) => {
        if (!value) return '-';
        try {
    return formatShortDate(value, String(value));
        } catch {
          return value;
        }
      },
    },
    {
      id: 'client_ou_fournisseur',
      label: 'Client / Fournisseur',
      sortable: false,
      filterable: false,
      mobilePriority: true,
      format: (value, row) => {
        const isClient = row.id_client !== null;
        const name = getClientOuFournisseur(row);
        
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: isClient ? 'success.main' : 'error.main',
                flexShrink: 0,
              }}
            />
            <Typography variant="body2">{name}</Typography>
          </Box>
        );
      },
    },
    {
      id: 'produit',
      label: 'Produit vendu / acheté',
      sortable: false,
      filterable: false,
      mobilePriority: false,
      format: (value, row) => {
        return produitsMap.get(row.id_produit) || `Produit #${row.id_produit}`;
      },
    },
    {
      id: 'batiment',
      label: 'Bâtiment',
      sortable: false,
      filterable: false,
      mobilePriority: false,
      format: (value, row) => {
        return row.id_batiment
          ? (batimentsMap.get(row.id_batiment) || `Bâtiment #${row.id_batiment}`)
          : '-';
      },
    },
    {
      id: 'quantite',
      label: 'Quantité',
      sortable: true,
      filterable: false,
      align: 'right',
      mobilePriority: false,
    },
    {
      id: 'montant_total',
      label: 'Montant total',
      sortable: true,
      filterable: false,
      align: 'right',
      mobilePriority: true,
      format: (value, row) => {
        // Vert pour les entrées d'argent (transactions clients)
        // Rouge pour les sorties d'argent (transactions fournisseurs)
        const isEntree = row.id_client !== null;
        const color = isEntree ? 'success.main' : 'error.main';
        
        const formatted = formatMontant(value);
        return (
          <Typography
            component="span"
            variant="body2"
            fontWeight="bold"
            sx={{
              color,
              display: 'inline-flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {formatted}
          </Typography>
        );
      },
    },
    {
      id: 'montant_paye',
      label: 'Payé',
      sortable: true,
      filterable: false,
      align: 'right',
      mobilePriority: false,
      format: (value) => formatMontant(value || 0),
    },
    {
      id: 'montant_restant',
      label: 'Reste',
      sortable: true,
      filterable: false,
      align: 'right',
      mobilePriority: false,
      format: (value) => formatMontant(value || 0),
    },
    {
      id: 'reglement',
      label: 'Règlement',
      sortable: false,
      filterable: false,
      mobilePriority: false,
      format: (value, row) => getPaymentReglementSummary(row),
    },
    {
      id: 'statut_paiement',
      label: 'Paiement',
      sortable: false,
      filterable: false,
      mobilePriority: false,
      format: (value, row) => {
        // Déterminer le statut : si en retard, afficher "en_retard", sinon le statut normal
        const statut = row.est_en_retard ? 'en_retard' : (row.statut_paiement || 'impaye');
        return <PaymentStatusBadge statut={statut} />;
      },
    },
    { id: 'etat_stock', label: 'Stock' },
    { id: 'date_livraison_prevue', label: 'Livraison prévue' },
  ];

  // Préparer les données pour le registre
  const transactionsForGrid = useMemo(() => {
    return transactions.map((transaction) => ({
      ...transaction,
      client_ou_fournisseur: getClientOuFournisseur(transaction),
      etat_stock: deferredSaleStatus(transaction)?.label || '—',
      id: transaction.id_transaction, // ID pour React key
    }));
  }, [transactions, clientsMap, fournisseursMap, produitsMap]);

  const quickFilterCounts = useMemo(() => {
    return countTransactionQuickFilters(transactionsForGrid);
  }, [transactionsForGrid]);

  const quickFilterOptions = useMemo(() => [
    { id: 'all', label: 'Tout', count: quickFilterCounts.all },
    { id: 'ventes', label: 'Ventes', count: quickFilterCounts.ventes },
    { id: 'achats', label: 'Achats', count: quickFilterCounts.achats },
    { id: 'non_payees', label: 'Non payées', count: quickFilterCounts.non_payees },
    { id: 'deferred', label: 'Livraisons différées', count: quickFilterCounts.deferred },
  ], [quickFilterCounts]);

  const displayedTransactions = useMemo(() => {
    return filterTransactions(transactionsForGrid, quickFilter, stockFilter);
  }, [quickFilter, stockFilter, transactionsForGrid]);

  const transactionSummary = useMemo(() => summarizeTransactions(displayedTransactions), [displayedTransactions]);

  /**
   * Lignes actuellement affichées dans le registre, utilisées pour les exports.
   */
  const rowsForExport = displayedTransactions;

  return (
    <Box sx={{ maxWidth: 1480, mx: 'auto', overflowX: 'hidden' }}>
      <Box
        sx={{
          p: { xs: 2, md: 3 },
          mb: 3,
          borderRadius: 4,
          border: '1px solid',
          borderColor: 'divider',
          background:
            'linear-gradient(135deg, rgba(240,253,250,0.92), rgba(255,251,235,0.82)), #fff',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'flex-start' }}
          spacing={2}
        >
          <Box>
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: '1.8rem', md: '2.45rem' },
                fontWeight: 900,
                letterSpacing: 0,
                color: '#17211D',
              }}
            >
              Ventes & achats
            </Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
            <Button
              variant="outlined"
              startIcon={<FileDownloadIcon />}
              onClick={handleExportExcel}
              disabled={loading || rowsForExport.length === 0}
            >
              Exporter en Excel
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<PictureAsPdfIcon />}
              onClick={handleExportPDF}
              disabled={loading || rowsForExport.length === 0}
            >
              Exporter en PDF
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
              Nouvelle transaction
            </Button>
          </Stack>
        </Stack>
      </Box>

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
            loading={loading}
            icon={<ReceiptLongIcon />}
            color="#315F85"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <TransactionMetric
            label="Ventes"
            value={formatMontant(transactionSummary.totalVentes)}
            helper={`${transactionSummary.ventes} transaction(s) client`}
            loading={loading}
            icon={<TrendingUpIcon />}
            color="#1D6F50"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <TransactionMetric
            label="Achats"
            value={formatMontant(transactionSummary.totalAchats)}
            helper={`${transactionSummary.achats} transaction(s) fournisseur`}
            loading={loading}
            icon={<TrendingDownIcon />}
            color="#A84435"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <TransactionMetric
            label="À suivre"
            value={transactionSummary.nonPayees}
            helper="Impayées, partielles ou en retard"
            loading={loading}
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
                  onClick={() => selectQuickFilter(option.id)}
                  sx={{ borderRadius: 999 }}
                >
                  {option.label}{loading ? ' (…)': option.count !== undefined ? ` (${option.count})` : ''}
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
        rows={displayedTransactions}
        loading={loading}
        getClientOuFournisseur={getClientOuFournisseur}
        formatMontant={formatMontant}
        onView={handleViewDetails}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
        onReactivate={handleReactivate}
        title="Résultat filtré"
        description=""
      />

      <TransactionForm
        open={modalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        initialValues={editingTransaction || {}}
        loading={formLoading}
        errorMessage={formError}
        prefillBatimentId={prefillBatimentId}
      />

      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">{transactionToDelete?.est_promesse ? 'Annuler cette vente ?' : 'Confirmer la suppression'}</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            {transactionToDelete?.est_promesse ? <>La vente sera retirée du registre actif. Les paiements associés seront annulés et conservés dans l’historique. Si vous réactivez la vente plus tard, ils ne seront pas réactivés automatiquement.</> : <>Retirer cette transaction du registre actif ?<br /><br />Elle restera dans l'historique et pourra être réactivée plus tard.</>}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deleteLoading} color="inherit">
            Annuler
          </Button>
          <Button onClick={handleDeleteConfirm} disabled={deleteLoading} color="error" variant="contained">
            {deleteLoading ? 'Annulation...' : transactionToDelete?.est_promesse ? 'Annuler la vente' : 'Supprimer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

}

function TransactionMetric({ label, value, helper, icon, color, loading = false }) {
  return (
    <Card sx={{ height: '100%', borderRadius: 2 }}>
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
              {loading ? 'Chargement…' : value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {loading ? 'Chargement des données…' : helper}
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

export default TransactionsList;
