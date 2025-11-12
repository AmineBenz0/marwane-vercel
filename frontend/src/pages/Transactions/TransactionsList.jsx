/**
 * Page Liste Transactions.
 * 
 * Affiche la liste des transactions avec :
 * - DataGrid pour l'affichage tabulaire
 * - Filtres avancés : date (range), client, fournisseur, montant (min/max), statut
 * - Actions : créer, voir détails, éditer, supprimer (soft delete)
 * - Pagination
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  FileDownload as FileDownloadIcon,
  PictureAsPdf as PictureAsPdfIcon,
} from '@mui/icons-material';
import DataGrid from '../../components/DataGrid/DataGrid';
import TransactionForm from './TransactionForm';
import { get, post, put, patch, del } from '../../services/api';
import { format } from 'date-fns';
import fr from 'date-fns/locale/fr';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import { exportToPDF } from '../../utils/exportToPDF';
import useNotification from '../../hooks/useNotification';
import { formatMontant as formatMontantUtil, formatMontantComplet } from '../../utils/formatNumber';

/**
 * Composant TransactionsList.
 */
function TransactionsList() {
  const navigate = useNavigate();
  
  // Hook pour les notifications
  const notification = useNotification();

  // État pour les transactions
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // État pour les clients et fournisseurs (pour les filtres et l'affichage)
  const [clients, setClients] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [loadingClientsFournisseurs, setLoadingClientsFournisseurs] = useState(false);

  // État pour la modal de création/édition
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  // État pour la confirmation de suppression
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // État pour les filtres
  const [filterDateDebut, setFilterDateDebut] = useState('');
  const [filterDateFin, setFilterDateFin] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterFournisseur, setFilterFournisseur] = useState('');
  const [filterMontantMin, setFilterMontantMin] = useState('');
  const [filterMontantMax, setFilterMontantMax] = useState('');
  const [filterEstActif, setFilterEstActif] = useState('');

  /**
   * Crée des maps de lookup pour clients et fournisseurs.
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

  /**
   * Charge la liste des clients et fournisseurs.
   */
  const fetchClientsFournisseurs = async () => {
    setLoadingClientsFournisseurs(true);
    try {
      const [clientsData, fournisseursData] = await Promise.all([
        get('/clients', { params: { limit: 1000, est_actif: true } }),
        get('/fournisseurs', { params: { limit: 1000, est_actif: true } }),
      ]);
      setClients(clientsData || []);
      setFournisseurs(fournisseursData || []);
    } catch (err) {
      console.error('Erreur lors du chargement des clients/fournisseurs:', err);
    } finally {
      setLoadingClientsFournisseurs(false);
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
      
      if (filterDateDebut) {
        params.date_debut = filterDateDebut;
      }
      if (filterDateFin) {
        params.date_fin = filterDateFin;
      }
      if (filterClient !== '') {
        params.id_client = parseInt(filterClient);
      }
      if (filterFournisseur !== '') {
        params.id_fournisseur = parseInt(filterFournisseur);
      }
      if (filterMontantMin !== '') {
        params.montant_min = parseFloat(filterMontantMin);
      }
      if (filterMontantMax !== '') {
        params.montant_max = parseFloat(filterMontantMax);
      }
      if (filterEstActif !== '') {
        params.est_actif = filterEstActif === 'true';
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

  // Charger les clients et fournisseurs au montage
  useEffect(() => {
    fetchClientsFournisseurs();
  }, []);

  // Charger les transactions au montage et lorsque les filtres changent
  useEffect(() => {
    fetchTransactions();
  }, [
    filterDateDebut,
    filterDateFin,
    filterClient,
    filterFournisseur,
    filterMontantMin,
    filterMontantMax,
    filterEstActif,
  ]);

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
      // Récupérer les détails complets de la transaction avec ses lignes
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
        // Mode édition : PUT
        await put(`/transactions/${editingTransaction.id_transaction}`, data);
      } else {
        // Mode création : POST
        await post('/transactions', data);
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
      // Utiliser des formatters personnalisés pour l'export
      const customFormatters = {
        date_transaction: (value) => {
          if (!value) return '-';
          try {
            return format(new Date(value), 'dd/MM/yyyy', { locale: fr });
          } catch {
            return value;
          }
        },
        montant_total: (value) => {
          if (value === null || value === undefined) return '-';
          return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'MAD',
          }).format(value);
        },
        est_actif: (value) => (value ? 'Actif' : 'Inactif'),
      };

      exportToExcelAdvanced(
        transactionsForGrid,
        columns,
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
      const customFormatters = {
        date_transaction: (value) => {
          if (!value) return '-';
          try {
            return format(new Date(value), 'dd/MM/yyyy', { locale: fr });
          } catch {
            return value;
          }
        },
        montant_total: (value) => {
          if (value === null || value === undefined) return '-';
          return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'MAD',
          }).format(value);
        },
        est_actif: (value) => (value ? 'Actif' : 'Inactif'),
      };

      exportToPDF(
        transactionsForGrid,
        columns,
        'Rapport des Transactions',
        'rapport_transactions',
        { customFormatters }
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
      filterable: false, // Désactivé car nous avons un filtre dédié au-dessus
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
      format: (value, row) => getClientOuFournisseur(row),
    },
    {
      id: 'montant_total',
      label: 'Montant total',
      sortable: true,
      filterable: false, // Désactivé car nous avons un filtre dédié au-dessus
      align: 'right',
      format: (value) => formatMontant(value),
    },
    {
      id: 'est_actif',
      label: 'Statut',
      sortable: true,
      filterable: false, // Désactivé car nous avons un filtre dédié au-dessus
      format: (value) => (
        <Chip
          label={value ? 'Actif' : 'Inactif'}
          color={value ? 'success' : 'default'}
          size="small"
        />
      ),
    },
  ];

  // Préparer les données pour le DataGrid avec le champ calculé
  const transactionsForGrid = useMemo(() => {
    return transactions.map((transaction) => ({
      ...transaction,
      client_ou_fournisseur: getClientOuFournisseur(transaction),
    }));
  }, [transactions, clientsMap, fournisseursMap]);

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
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={handleExportExcel}
            disabled={loading || transactionsForGrid.length === 0}
          >
            Excel
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<PictureAsPdfIcon />}
            onClick={handleExportPDF}
            disabled={loading || transactionsForGrid.length === 0}
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

      {/* Filtres avancés */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          mb: 3,
          flexWrap: 'wrap',
        }}
      >
        <TextField
          label="Date début"
          type="date"
          variant="outlined"
          size="small"
          value={filterDateDebut}
          onChange={(e) => setFilterDateDebut(e.target.value)}
          InputLabelProps={{
            shrink: true,
          }}
          sx={{ minWidth: 180 }}
        />
        <TextField
          label="Date fin"
          type="date"
          variant="outlined"
          size="small"
          value={filterDateFin}
          onChange={(e) => setFilterDateFin(e.target.value)}
          InputLabelProps={{
            shrink: true,
          }}
          sx={{ minWidth: 180 }}
        />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Client</InputLabel>
          <Select
            value={filterClient}
            label="Client"
            onChange={(e) => setFilterClient(e.target.value)}
          >
            <MenuItem value="">Tous</MenuItem>
            {clients.map((client) => (
              <MenuItem key={client.id_client} value={client.id_client.toString()}>
                {client.nom_client}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Fournisseur</InputLabel>
          <Select
            value={filterFournisseur}
            label="Fournisseur"
            onChange={(e) => setFilterFournisseur(e.target.value)}
          >
            <MenuItem value="">Tous</MenuItem>
            {fournisseurs.map((fournisseur) => (
              <MenuItem key={fournisseur.id_fournisseur} value={fournisseur.id_fournisseur.toString()}>
                {fournisseur.nom_fournisseur}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Montant min"
          type="number"
          variant="outlined"
          size="small"
          value={filterMontantMin}
          onChange={(e) => setFilterMontantMin(e.target.value)}
          inputProps={{ min: 0, step: 0.01 }}
          sx={{ minWidth: 150 }}
        />
        <TextField
          label="Montant max"
          type="number"
          variant="outlined"
          size="small"
          value={filterMontantMax}
          onChange={(e) => setFilterMontantMax(e.target.value)}
          inputProps={{ min: 0, step: 0.01 }}
          sx={{ minWidth: 150 }}
        />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Statut</InputLabel>
          <Select
            value={filterEstActif}
            label="Statut"
            onChange={(e) => setFilterEstActif(e.target.value)}
          >
            <MenuItem value="">Tous</MenuItem>
            <MenuItem value="true">Actifs</MenuItem>
            <MenuItem value="false">Inactifs</MenuItem>
          </Select>
        </FormControl>
      </Box>

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

