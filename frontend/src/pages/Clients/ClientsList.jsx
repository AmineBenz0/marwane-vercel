/**
 * Page Liste Clients.
 * 
 * Affiche la liste des clients avec :
 * - DataGrid pour l'affichage tabulaire
 * - Filtres : recherche par nom, est_actif
 * - Actions : créer, éditer, supprimer (soft delete)
 * - Pagination
 */

import React, { useState, useEffect } from 'react';
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
import { Add as AddIcon, FileDownload as FileDownloadIcon } from '@mui/icons-material';
import DataGrid from '../../components/DataGrid/DataGrid';
import ModalForm from '../../components/ModalForm/ModalForm';
import { get, post, put, del } from '../../services/api';
import * as yup from 'yup';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import { format } from 'date-fns';
import useNotification from '../../hooks/useNotification';

/**
 * Composant ClientsList.
 */
function ClientsList() {
  // Hook pour les notifications
  const notification = useNotification();

  // État pour les clients
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // État pour la modal de création/édition
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  // État pour la confirmation de suppression
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // État pour les filtres
  const [filterNom, setFilterNom] = useState('');
  const [filterEstActif, setFilterEstActif] = useState('');

  /**
   * Charge la liste des clients depuis l'API.
   */
  const fetchClients = async () => {
    setLoading(true);
    setError(null);

    try {
      // Construire les paramètres de requête
      const params = {};
      if (filterNom.trim()) {
        params.recherche = filterNom.trim();
      }
      if (filterEstActif !== '') {
        params.est_actif = filterEstActif === 'true';
      }

      // Récupérer tous les clients (on peut augmenter la limite si nécessaire)
      const data = await get('/clients', {
        params: {
          ...params,
          limit: 1000, // Limite élevée pour récupérer tous les clients
        },
      });

      setClients(data || []);
    } catch (err) {
      console.error('Erreur lors du chargement des clients:', err);
      const errorMessage = err?.message || 'Une erreur est survenue lors du chargement des clients';
      setError(errorMessage);
      notification.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Charger les clients au montage et lorsque les filtres changent
  useEffect(() => {
    fetchClients();
  }, [filterNom, filterEstActif]);

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
   * Gère l'ouverture de la modal pour créer un nouveau client.
   */
  const handleCreate = () => {
    setEditingClient(null);
    setFormError(null);
    setModalOpen(true);
  };

  /**
   * Gère l'ouverture de la modal pour éditer un client existant.
   */
  const handleEdit = (client) => {
    setEditingClient(client);
    setFormError(null);
    setModalOpen(true);
  };

  /**
   * Gère la soumission du formulaire (création ou édition).
   */
  const handleSubmit = async (data) => {
    setFormLoading(true);
    setFormError(null);

    try {
      if (editingClient) {
        // Mode édition : PUT
        await put(`/clients/${editingClient.id_client}`, data);
      } else {
        // Mode création : POST
        await post('/clients', data);
      }

      // Fermer la modal et rafraîchir la liste
      setModalOpen(false);
      setEditingClient(null);
      await fetchClients();
      
      // Afficher une notification de succès
      notification.success(
        editingClient 
          ? 'Client modifié avec succès' 
          : 'Client créé avec succès'
      );
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
      setEditingClient(null);
      setFormError(null);
    }
  };

  /**
   * Gère le clic sur le bouton de suppression.
   */
  const handleDeleteClick = (client) => {
    setClientToDelete(client);
    setDeleteDialogOpen(true);
  };

  /**
   * Gère la confirmation de suppression.
   */
  const handleDeleteConfirm = async () => {
    if (!clientToDelete) return;

    setDeleteLoading(true);

    try {
      // Appeler l'API pour supprimer (soft delete)
      await del(`/clients/${clientToDelete.id_client}`);

      // Fermer le dialogue et rafraîchir la liste
      setDeleteDialogOpen(false);
      setClientToDelete(null);
      await fetchClients();
      
      // Afficher une notification de succès
      notification.success('Client supprimé avec succès');
    } catch (err) {
      console.error('Erreur lors de la suppression:', err);
      const errorMessage = err?.message || 'Une erreur est survenue lors de la suppression';
      setError(errorMessage);
      notification.error(errorMessage);
      setDeleteDialogOpen(false);
      setClientToDelete(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  /**
   * Gère l'annulation de la suppression.
   */
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setClientToDelete(null);
  };

  /**
   * Gère l'export Excel des clients filtrés.
   */
  const handleExportExcel = () => {
    try {
      const customFormatters = {
        est_actif: (value) => (value ? 'Actif' : 'Inactif'),
        date_creation: (value) => {
          if (!value) return '-';
          try {
            const date = new Date(value);
            return date.toLocaleDateString('fr-FR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });
          } catch {
            return value;
          }
        },
        date_modification: (value) => {
          if (!value) return '-';
          try {
            const date = new Date(value);
            return date.toLocaleDateString('fr-FR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });
          } catch {
            return value;
          }
        },
      };

      exportToExcelAdvanced(
        clients,
        columns,
        `clients_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}`,
        'Clients',
        customFormatters
      );
    } catch (error) {
      console.error('Erreur lors de l\'export Excel:', error);
      setError('Une erreur est survenue lors de l\'export Excel');
    }
  };

  /**
   * Configuration des colonnes du DataGrid.
   */
  const columns = [
    {
      id: 'id_client',
      label: 'ID',
      sortable: true,
      filterable: false,
      align: 'right',
    },
    {
      id: 'nom_client',
      label: 'Nom du client',
      sortable: true,
      filterable: false, // Désactivé car nous avons un filtre dédié au-dessus
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
    {
      id: 'date_creation',
      label: 'Date de création',
      sortable: true,
      filterable: false,
      format: (value) => {
        if (!value) return '-';
        const date = new Date(value);
        return date.toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      },
    },
    {
      id: 'date_modification',
      label: 'Dernière modification',
      sortable: true,
      filterable: false,
      format: (value) => {
        if (!value) return '-';
        const date = new Date(value);
        return date.toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      },
    },
  ];

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
          Liste des Clients
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={handleExportExcel}
            disabled={loading || clients.length === 0}
          >
            Exporter
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreate}
          >
            Créer un client
          </Button>
        </Box>
      </Box>

      {/* Message d'erreur global */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filtres */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          mb: 3,
          flexWrap: 'wrap',
        }}
      >
        <TextField
          label="Rechercher par nom"
          variant="outlined"
          size="small"
          value={filterNom}
          onChange={(e) => setFilterNom(e.target.value)}
          sx={{ minWidth: 250 }}
          placeholder="Nom du client..."
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
        rows={clients}
        columns={columns}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
        loading={loading}
        pageSize={10}
        showActions={true}
      />

      {/* Modal de création/édition */}
      <ModalForm
        open={modalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        initialValues={
          editingClient
            ? {
                nom_client: editingClient.nom_client,
                est_actif: editingClient.est_actif,
              }
            : {
                nom_client: '',
                est_actif: true,
              }
        }
        validationSchema={clientValidationSchema}
        fields={clientFields}
        title={editingClient ? 'Modifier le client' : 'Créer un nouveau client'}
        submitLabel={editingClient ? 'Modifier' : 'Créer'}
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
            Êtes-vous sûr de vouloir désactiver le client{' '}
            <strong>{clientToDelete?.nom_client}</strong> ?
            <br />
            <br />
            Cette action effectuera une suppression logique (soft delete). Le
            client sera marqué comme inactif mais ne sera pas supprimé
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

export default ClientsList;

