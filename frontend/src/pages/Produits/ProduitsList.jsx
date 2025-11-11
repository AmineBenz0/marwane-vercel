/**
 * Page Liste Produits.
 * 
 * Affiche la liste des produits avec :
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
import ProduitForm from './ProduitForm';
import { get, post, put, del } from '../../services/api';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import { format } from 'date-fns';

/**
 * Composant ProduitsList.
 */
function ProduitsList() {
  // État pour les produits
  const [produits, setProduits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // État pour la modal de création/édition
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduit, setEditingProduit] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  // État pour la confirmation de suppression
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [produitToDelete, setProduitToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // État pour les filtres
  const [filterNom, setFilterNom] = useState('');
  const [filterEstActif, setFilterEstActif] = useState('');

  /**
   * Charge la liste des produits depuis l'API.
   */
  const fetchProduits = async () => {
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

      // Récupérer tous les produits (on peut augmenter la limite si nécessaire)
      const data = await get('/produits', {
        params: {
          ...params,
          limit: 1000, // Limite élevée pour récupérer tous les produits
        },
      });

      setProduits(data || []);
    } catch (err) {
      console.error('Erreur lors du chargement des produits:', err);
      setError(
        err?.message || 'Une erreur est survenue lors du chargement des produits'
      );
    } finally {
      setLoading(false);
    }
  };

  // Charger les produits au montage et lorsque les filtres changent
  useEffect(() => {
    fetchProduits();
  }, [filterNom, filterEstActif]);

  /**
   * Gère l'ouverture de la modal pour créer un nouveau produit.
   */
  const handleCreate = () => {
    setEditingProduit(null);
    setFormError(null);
    setModalOpen(true);
  };

  /**
   * Gère l'ouverture de la modal pour éditer un produit existant.
   */
  const handleEdit = (produit) => {
    setEditingProduit(produit);
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
      if (editingProduit) {
        // Mode édition : PUT
        await put(`/produits/${editingProduit.id_produit}`, data);
      } else {
        // Mode création : POST
        await post('/produits', data);
      }

      // Fermer la modal et rafraîchir la liste
      setModalOpen(false);
      setEditingProduit(null);
      await fetchProduits();
    } catch (err) {
      console.error('Erreur lors de la soumission:', err);
      // Gérer les erreurs d'unicité du backend
      if (err?.status === 400 && err?.message?.includes('existe déjà')) {
        setFormError(err.message);
      } else {
        setFormError(
          err?.message || 'Une erreur est survenue lors de l\'enregistrement'
        );
      }
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
      setEditingProduit(null);
      setFormError(null);
    }
  };

  /**
   * Gère le clic sur le bouton de suppression.
   */
  const handleDeleteClick = (produit) => {
    setProduitToDelete(produit);
    setDeleteDialogOpen(true);
  };

  /**
   * Gère la confirmation de suppression.
   */
  const handleDeleteConfirm = async () => {
    if (!produitToDelete) return;

    setDeleteLoading(true);

    try {
      // Appeler l'API pour supprimer (soft delete)
      await del(`/produits/${produitToDelete.id_produit}`);

      // Fermer le dialogue et rafraîchir la liste
      setDeleteDialogOpen(false);
      setProduitToDelete(null);
      await fetchProduits();
    } catch (err) {
      console.error('Erreur lors de la suppression:', err);
      setError(
        err?.message || 'Une erreur est survenue lors de la suppression'
      );
      setDeleteDialogOpen(false);
      setProduitToDelete(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  /**
   * Gère l'annulation de la suppression.
   */
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setProduitToDelete(null);
  };

  /**
   * Gère l'export Excel des produits filtrés.
   */
  const handleExportExcel = () => {
    try {
      const customFormatters = {
        est_actif: (value) => (value ? 'Actif' : 'Inactif'),
      };

      exportToExcelAdvanced(
        produits,
        columns,
        `produits_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}`,
        'Produits',
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
      id: 'id_produit',
      label: 'ID',
      sortable: true,
      filterable: false,
      align: 'right',
    },
    {
      id: 'nom_produit',
      label: 'Nom du produit',
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
          Liste des Produits
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={handleExportExcel}
            disabled={loading || produits.length === 0}
          >
            Exporter
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreate}
          >
            Créer un produit
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
          placeholder="Nom du produit..."
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
        rows={produits}
        columns={columns}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
        loading={loading}
        pageSize={10}
        showActions={true}
      />

      {/* Modal de création/édition */}
      <ProduitForm
        open={modalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        initialValues={editingProduit}
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
            Êtes-vous sûr de vouloir désactiver le produit{' '}
            <strong>{produitToDelete?.nom_produit}</strong> ?
            <br />
            <br />
            Cette action effectuera une suppression logique (soft delete). Le
            produit sera marqué comme inactif mais ne sera pas supprimé
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

export default ProduitsList;

