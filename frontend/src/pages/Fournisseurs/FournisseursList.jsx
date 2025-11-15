/**
 * Page Liste Fournisseurs.
 * 
 * Affiche la liste des fournisseurs avec :
 * - DataGrid pour l'affichage tabulaire
 * - Filtres : recherche par nom, est_actif
 * - Actions : créer, éditer, supprimer (soft delete)
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
  Chip,
  Link,
} from '@mui/material';
import { Add as AddIcon, FileDownload as FileDownloadIcon } from '@mui/icons-material';
import DataGrid from '../../components/DataGrid/DataGrid';
import ModalForm from '../../components/ModalForm/ModalForm';
import SmartFilterPanel from '../../components/Filters/SmartFilterPanel';
import { get, post, put, patch, del } from '../../services/api';
import * as yup from 'yup';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import { format } from 'date-fns';
import useNotification from '../../hooks/useNotification';

/**
 * Composant FournisseursList.
 */
function FournisseursList() {
  // Hook pour les notifications
  const notification = useNotification();
  const navigate = useNavigate();

  // État pour les fournisseurs
  const [fournisseurs, setFournisseurs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // État pour la modal de création/édition
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFournisseur, setEditingFournisseur] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  // État pour la confirmation de suppression
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fournisseurToDelete, setFournisseurToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // État pour les filtres (objet unique)
  const [filters, setFilters] = useState({
    nom: '',
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
      nom: '',
      estActif: '',
    });
  };

  /**
   * Définitions des filtres pour SmartFilterPanel.
   */
  const filterDefinitions = useMemo(() => [
    {
      id: 'nom',
      label: 'Rechercher par nom',
      type: 'search',
      placeholder: 'Nom du fournisseur...',
      alwaysInline: true, // Toujours visible
    },
    {
      id: 'estActif',
      label: 'Statut',
      type: 'select',
      alwaysInline: true, // Toujours visible
      options: [
        { value: 'true', label: 'Actifs' },
        { value: 'false', label: 'Inactifs' },
      ],
      formatChipValue: (value) => (value === 'true' ? 'Actifs' : 'Inactifs'),
    },
  ], []);

  /**
   * Charge la liste des fournisseurs depuis l'API.
   */
  const fetchFournisseurs = async () => {
    setLoading(true);
    setError(null);

    try {
      // Construire les paramètres de requête
      const params = {};
      if (filters.nom.trim()) {
        params.recherche = filters.nom.trim();
      }
      if (filters.estActif !== '') {
        params.est_actif = filters.estActif === 'true';
      }

      // Récupérer tous les fournisseurs (on peut augmenter la limite si nécessaire)
      const data = await get('/fournisseurs', {
        params: {
          ...params,
          limit: 1000, // Limite élevée pour récupérer tous les fournisseurs
        },
      });

      setFournisseurs(data || []);
    } catch (err) {
      console.error('Erreur lors du chargement des fournisseurs:', err);
      setError(
        err?.message || 'Une erreur est survenue lors du chargement des fournisseurs'
      );
    } finally {
      setLoading(false);
    }
  };

  // Charger les fournisseurs au montage et lorsque les filtres changent
  useEffect(() => {
    fetchFournisseurs();
  }, [filters]);

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
   * Gère l'ouverture de la modal pour créer un nouveau fournisseur.
   */
  const handleCreate = () => {
    setEditingFournisseur(null);
    setFormError(null);
    setModalOpen(true);
  };

  /**
   * Gère l'ouverture de la modal pour éditer un fournisseur existant.
   */
  const handleEdit = (fournisseur) => {
    setEditingFournisseur(fournisseur);
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
      if (editingFournisseur) {
        // Mode édition : PUT
        await put(`/fournisseurs/${editingFournisseur.id_fournisseur}`, data);
      } else {
        // Mode création : POST
        await post('/fournisseurs', data);
      }

      // Fermer la modal et rafraîchir la liste
      setModalOpen(false);
      setEditingFournisseur(null);
      await fetchFournisseurs();
    } catch (err) {
      console.error('Erreur lors de la soumission:', err);
      setFormError(
        err?.message || 'Une erreur est survenue lors de l\'enregistrement'
      );
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
      setEditingFournisseur(null);
      setFormError(null);
    }
  };

  /**
   * Gère le clic sur le bouton de suppression.
   */
  const handleDeleteClick = (fournisseur) => {
    setFournisseurToDelete(fournisseur);
    setDeleteDialogOpen(true);
  };

  /**
   * Gère la confirmation de suppression.
   */
  const handleDeleteConfirm = async () => {
    if (!fournisseurToDelete) return;

    setDeleteLoading(true);

    try {
      // Appeler l'API pour supprimer (soft delete)
      await del(`/fournisseurs/${fournisseurToDelete.id_fournisseur}`);

      // Fermer le dialogue et rafraîchir la liste
      setDeleteDialogOpen(false);
      setFournisseurToDelete(null);
      await fetchFournisseurs();
    } catch (err) {
      console.error('Erreur lors de la suppression:', err);
      setError(
        err?.message || 'Une erreur est survenue lors de la suppression'
      );
      setDeleteDialogOpen(false);
      setFournisseurToDelete(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  /**
   * Gère l'annulation de la suppression.
   */
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setFournisseurToDelete(null);
  };

  /**
   * Gère la réactivation d'un fournisseur.
   */
  const handleReactivate = async (fournisseur) => {
    try {
      // Appeler l'API pour réactiver (PATCH)
      await patch(`/fournisseurs/${fournisseur.id_fournisseur}/reactivate`, {});
      
      // Rafraîchir la liste
      await fetchFournisseurs();
      
      // Notification de succès
      notification.success('Fournisseur réactivé avec succès');
    } catch (err) {
      console.error('Erreur lors de la réactivation:', err);
      setError(err?.message || 'Une erreur est survenue lors de la réactivation');
    }
  };

  /**
   * Gère la navigation vers le profil d'un fournisseur.
   */
  const handleViewProfile = (fournisseur) => {
    navigate(`/fournisseurs/${fournisseur.id_fournisseur}/profile`);
  };

  /**
   * Gère l'export Excel des fournisseurs filtrés.
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
        fournisseurs,
        columns,
        `fournisseurs_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}`,
        'Fournisseurs',
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
      id: 'id_fournisseur',
      label: 'ID',
      sortable: true,
      filterable: false,
      align: 'right',
    },
    {
      id: 'nom_fournisseur',
      label: 'Nom du fournisseur',
      sortable: true,
      filterable: false, // Désactivé car nous avons un filtre dédié au-dessus
      format: (value, row) => (
        <Link
          component="button"
          variant="body2"
          onClick={() => handleViewProfile(row)}
          sx={{
            cursor: 'pointer',
            textDecoration: 'none',
            '&:hover': {
              textDecoration: 'underline',
            },
          }}
        >
          {value}
        </Link>
      ),
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
          Liste des Fournisseurs
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={handleExportExcel}
            disabled={loading || fournisseurs.length === 0}
          >
            Exporter
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreate}
          >
            Créer un fournisseur
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
        pageKey="fournisseurs"
        filterDefinitions={filterDefinitions}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearAll={handleClearAllFilters}
        maxInlineFilters={2}
        resultCount={fournisseurs.length}
        totalCount={fournisseurs.length}
      />

      {/* DataGrid */}
      <DataGrid
        rows={fournisseurs}
        columns={columns}
        onView={handleViewProfile}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
        onReactivate={handleReactivate}
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
          editingFournisseur
            ? {
                nom_fournisseur: editingFournisseur.nom_fournisseur,
                est_actif: editingFournisseur.est_actif,
              }
            : {
                nom_fournisseur: '',
                est_actif: true,
              }
        }
        validationSchema={fournisseurValidationSchema}
        fields={fournisseurFields}
        title={editingFournisseur ? 'Modifier le fournisseur' : 'Créer un nouveau fournisseur'}
        submitLabel={editingFournisseur ? 'Modifier' : 'Créer'}
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
            Êtes-vous sûr de vouloir désactiver le fournisseur{' '}
            <strong>{fournisseurToDelete?.nom_fournisseur}</strong> ?
            <br />
            <br />
            Cette action effectuera une suppression logique (soft delete). Le
            fournisseur sera marqué comme inactif mais ne sera pas supprimé
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

export default FournisseursList;

