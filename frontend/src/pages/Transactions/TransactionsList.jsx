/**
 * Page Liste Transactions.
 * 
 * Affiche la liste des transactions avec :
 * - DataGrid pour l'affichage tabulaire
 * - Filtres avancés : date (range), client, fournisseur, produit, montant (min/max), statut
 * - Actions : créer, voir détails, éditer, supprimer (soft delete)
 * - Pagination
 * 
 * Chaque transaction représente une ligne de vente/achat avec un seul produit.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  FileDownload as FileDownloadIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import DataGrid from '../../components/DataGrid/DataGrid';
import TransactionForm from './TransactionForm';
import SmartFilterPanel from '../../components/Filters/SmartFilterPanel';
import { get, post, put, patch, del } from '../../services/api';
import { format } from 'date-fns';
import fr from 'date-fns/locale/fr';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import { exportToPDF } from '../../utils/exportToPDF';
import useNotification from '../../hooks/useNotification';
import { formatMontant as formatMontantUtil } from '../../utils/formatNumber';

/**
 * Composant TransactionsList.
 */
function TransactionsList() {
  const navigate = useNavigate();
  
  // Hook pour les notifications
  const notification = useNotification();

  // État pour les transactions
  const [transactions, setTransactions] = useState([]);
  const [displayedRows, setDisplayedRows] = useState(null); // lignes visibles dans le DataGrid
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // État pour les clients, fournisseurs et produits (pour les filtres et l'affichage)
  const [clients, setClients] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [produits, setProduits] = useState([]);
  const [loadingReferenceData, setLoadingReferenceData] = useState(false);

  // État pour la modal de création/édition
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  // État pour la confirmation de suppression
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // État pour les filtres (objet unique)
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
          return new Date(value).toLocaleDateString('fr-FR');
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
          return new Date(value).toLocaleDateString('fr-FR');
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
      label: 'Produit',
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
    {
      id: 'estActif',
      label: 'Statut',
      type: 'select',
      options: [
        { value: 'true', label: 'Actifs' },
        { value: 'false', label: 'Inactifs' },
      ],
      formatChipValue: (value) => (value === 'true' ? 'Actifs' : 'Inactifs'),
    },
  ], [clients, fournisseurs, produits]);

  /**
   * Charge la liste des clients, fournisseurs et produits.
   */
  const fetchReferenceData = async () => {
    setLoadingReferenceData(true);
    try {
      const [clientsData, fournisseursData, produitsData] = await Promise.all([
        get('/clients', { params: { limit: 1000, est_actif: true } }),
        get('/fournisseurs', { params: { limit: 1000, est_actif: true } }),
        get('/produits', { params: { limit: 1000, est_actif: true } }),
      ]);
      setClients(clientsData || []);
      setFournisseurs(fournisseursData || []);
      setProduits(produitsData || []);
    } catch (err) {
      console.error('Erreur lors du chargement des données de référence:', err);
    } finally {
      setLoadingReferenceData(false);
    }
  };

  /**
   * Charge la liste des transactions depuis l'API.
   */
  const fetchTransactions = async () => {
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

      // Récupérer les transactions
      const data = await get('/transactions', {
        params: {
          ...params,
          limit: 1000, // Limite élevée pour récupérer toutes les transactions
        },
      });

      setTransactions(data || []);
    } catch (err) {
      console.error('Erreur lors du chargement des transactions:', err);
      setError(
        err?.message || 'Une erreur est survenue lors du chargement des transactions'
      );
    } finally {
      setLoading(false);
    }
  };

  // Charger les données de référence au montage
  useEffect(() => {
    fetchReferenceData();
  }, []);

  // Charger les transactions au montage et lorsque les filtres changent
  useEffect(() => {
    fetchTransactions();
  }, [filters]);

  /**
   * Gère l'ouverture de la modal pour créer une nouvelle transaction.
   */
  const handleCreate = () => {
    setEditingTransaction(null);
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
      if (editingTransaction) {
        // Mode édition : PUT (une seule transaction)
        await put(`/transactions/${editingTransaction.id_transaction}`, data);
      } else {
        // Mode création : vérifier si c'est un batch ou une transaction simple
        if (data.batch && data.transactions) {
          // Création batch : POST /transactions/batch
          await post('/transactions/batch', data.transactions);
        } else {
          // Création simple : POST /transactions
          await post('/transactions', data);
        }
      }

      // Fermer la modal et rafraîchir la liste
      setModalOpen(false);
      setEditingTransaction(null);
      await fetchTransactions();
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
  const handleExportExcel = () => {
    try {
      const columnsForExport = columns.filter((col) => col.id !== 'est_actif');
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

      const dataForExcel = [...rowsForExport, spacerRow, totalRow];

      // Utiliser des formatters personnalisés pour l'export
      const customFormatters = {
        date_transaction: (value, row) => {
          if (row?.__summaryType) return '';
          if (!value) return '-';
          try {
            return format(new Date(value), 'dd/MM/yyyy', { locale: fr });
          } catch {
            return value;
          }
        },
        produit: (value, row) => {
          if (row?.__summaryType) return '';
          return produitsMap.get(row.id_produit) || `Produit #${row.id_produit}`;
        },
        prix_unitaire: (value, row) => {
          if (row?.__summaryType) return '';
          if (value === null || value === undefined) return '-';
          return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'MAD',
          }).format(value);
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
      };

      exportToExcelAdvanced(
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
      const columnsForExport = columns.filter((col) => col.id !== 'est_actif');
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
            return format(new Date(value), 'dd/MM/yyyy', { locale: fr });
          } catch {
            return value;
          }
        },
        produit: (value, row) => {
          return produitsMap.get(row.id_produit) || `Produit #${row.id_produit}`;
        },
        prix_unitaire: (value) => {
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
      };

      exportToPDF(
        rowsForExport,
        columnsForExport,
        'Rapport des Transactions',
        'rapport_transactions',
        { 
          customFormatters,
          colorByType: (rowIndex, tableData) => {
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
   * Configuration des colonnes du DataGrid.
   * Ordre : ID, Date, Client/Fournisseur, Produit, Prix unitaire, Quantité, Montant Total, Statut, Actions
   */
  const columns = [
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
      format: (value) => {
        if (!value) return '-';
        try {
          return format(new Date(value), 'dd/MM/yyyy', { locale: fr });
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
      label: 'Produit',
      sortable: false,
      filterable: false,
      format: (value, row) => {
        return produitsMap.get(row.id_produit) || `Produit #${row.id_produit}`;
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
        return formatMontant(value);
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

  // Préparer les données pour le DataGrid
  const transactionsForGrid = useMemo(() => {
    return transactions.map((transaction) => ({
      ...transaction,
      client_ou_fournisseur: getClientOuFournisseur(transaction),
      id: transaction.id_transaction, // ID pour React key
    }));
  }, [transactions, clientsMap, fournisseursMap, produitsMap]);

  /**
   * Lignes réellement affichées dans le DataGrid (après filtres/tri/pagination internes).
   * Si le DataGrid n'a pas encore remonté l'information, on retombe sur toutes les transactions.
   */
  const rowsForExport = useMemo(() => {
    return displayedRows ?? transactionsForGrid;
  }, [displayedRows, transactionsForGrid]);

  return (
    <Box sx={{ p: 3 }}>
      {/* En-tête */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h4" component="h1">
          Liste des Transactions
        </Typography>

        {/* OPTION 1: Légende dans la barre de boutons (à gauche des boutons) */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Box 
            sx={{ 
              display: 'flex', 
              gap: 2, 
              mr: 1,
              pr: 2,
              borderRight: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
              <Typography variant="caption" color="text.secondary">Entrée</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'error.main' }} />
              <Typography variant="caption" color="text.secondary">Sortie</Typography>
            </Box>
          </Box>
          
          <Button
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={handleExportExcel}
            disabled={loading || rowsForExport.length === 0}
          >
            Excel
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<PictureAsPdfIcon />}
            onClick={handleExportPDF}
            disabled={loading || rowsForExport.length === 0}
          >
            PDF
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreate}
          >
            Créer une transaction
          </Button>
        </Box>
      </Box>

      {/* Message d'erreur global */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}


      {/* Filtres avec SmartFilterPanel */}
      <SmartFilterPanel
        pageKey="transactions"
        filterDefinitions={filterDefinitions}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearAll={handleClearAllFilters}
        maxInlineFilters={2}
        resultCount={transactions.length}
        totalCount={transactions.length}
      />

      {/* DataGrid */}
      <DataGrid
        rows={transactionsForGrid}
        columns={columns}
        onView={handleViewDetails}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
        onReactivate={handleReactivate}
        loading={loading}
        pageSize={10}
        showActions={true}
        onDisplayedRowsChange={setDisplayedRows}
      />

      {/* Modal de création/édition */}
      <TransactionForm
        open={modalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        initialValues={editingTransaction || {}}
        loading={formLoading}
        errorMessage={formError}
      />

      {/* Dialogue de confirmation de suppression */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">
          Confirmer la suppression
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Êtes-vous sûr de vouloir désactiver la transaction{' '}
            <strong>#{transactionToDelete?.id_transaction}</strong> ?
            <br />
            <br />
            Cette action effectuera une suppression logique (soft delete). La
            transaction sera marquée comme inactive mais ne sera pas supprimée
            définitivement de la base de données.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleDeleteCancel}
            disabled={deleteLoading}
            color="inherit"
          >
            Annuler
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            disabled={deleteLoading}
            color="error"
            variant="contained"
          >
            {deleteLoading ? 'Suppression...' : 'Supprimer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default TransactionsList;
