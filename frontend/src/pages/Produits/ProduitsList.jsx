/**
 * Page Liste Produits.
 * 
 * Affiche la liste des produits avec :
 * - DataGrid pour l'affichage tabulaire
 * - Filtres : recherche par nom, est_actif
 * - Actions : créer, éditer, supprimer (soft delete)
 * - Pagination
 */

import React, { useState, useEffect, useMemo } from 'react';
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
  useTheme,
  useMediaQuery,
  Divider,
} from '@mui/material';
import { Add as AddIcon, FileDownload as FileDownloadIcon } from '@mui/icons-material';
import DataGrid from '../../components/DataGrid/DataGrid';
import MobileCardList from '../../components/MobileCardList/MobileCardList';
import ProduitForm from './ProduitForm';
import SmartFilterPanel from '../../components/Filters/SmartFilterPanel';
import { get, post, put, patch, del } from '../../services/api';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import { format } from 'date-fns';
import useNotification from '../../hooks/useNotification';

/**
 * Composant ProduitsList.
 */
function ProduitsList() {
  // Hook pour les notifications
  const notification = useNotification();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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
      placeholder: 'Nom du produit...',
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
   * Charge la liste des produits depuis l'API.
   */
  const fetchProduits = async () => {
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
  }, [filters]);

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
   * Gère la réactivation d'un produit.
   */
  const handleReactivate = async (produit) => {
    try {
      // Appeler l'API pour réactiver (PATCH)
      await patch(`/produits/${produit.id_produit}/reactivate`, {});
      
      // Rafraîchir la liste
      await fetchProduits();
      
      // Notification de succès
      notification.success('Produit réactivé avec succès');
    } catch (err) {
      console.error('Erreur lors de la réactivation:', err);
      setError(err?.message || 'Une erreur est survenue lors de la réactivation');
    }
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
      mobilePriority: false,
    },
    {
      id: 'nom_produit',
      label: 'Nom du produit',
      sortable: true,
      filterable: false, // Désactivé car nous avons un filtre dédié au-dessus
      mobilePriority: true,
    },
    {
      id: 'est_actif',
      label: 'Statut',
      sortable: true,
      filterable: false,
      mobilePriority: true,
      format: (value) => (
        <Chip
          label={value ? 'Actif' : 'Inactif'}
          color={value ? 'success' : 'default'}
          size="small"
        />
      ),
    },
    {
      id: 'types_utilisation',
      label: 'Utilisation',
      sortable: false,
      filterable: false,
      mobilePriority: true,
      // Colonne virtuelle basée sur pour_clients / pour_fournisseurs
      // Le DataGrid appelle format(cellValue, row), donc on utilise le second paramètre.
      format: (_value, row) => {
        if (!row) return null;

        const chips = [];
        if (row.pour_clients) {
          chips.push(
            <Chip
              key="client"
              label="Client"
              color="primary"
              size="small"
              sx={{ mr: 0.5 }}
            />
          );
        }
        if (row.pour_fournisseurs) {
          chips.push(
            <Chip
              key="fournisseur"
              label="Fournisseur"
              color="secondary"
              size="small"
            />
          );
        }

        // Cas de compatibilité : si aucun flag n'est défini, on n'affiche rien
        return chips.length > 0 ? <Box sx={{ display: 'flex' }}>{chips}</Box> : null;
      },
    },
  ];

  return (
    <Box sx={{ maxWidth: '100%', overflowX: 'hidden' }}>
      {/* En-tête */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: { xs: 2, sm: 0 },
          mb: { xs: 2, sm: 2.5, md: 3 },
        }}
      >
        <Typography 
          variant="h4" 
          component="h1"
          sx={{ fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' } }}
        >
          Liste des Produits
        </Typography>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', sm: 'row' },
          gap: { xs: 1.5, sm: 2 } 
        }}>
          <Button
            variant="outlined"
            startIcon={!isMobile && <FileDownloadIcon />}
            onClick={handleExportExcel}
            disabled={loading || produits.length === 0}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            {isMobile ? 'Exporter' : 'Exporter (Excel)'}
          </Button>
          <Button
            variant="contained"
            startIcon={!isMobile && <AddIcon />}
            onClick={handleCreate}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            {isMobile ? 'Créer' : 'Créer un produit'}
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
        pageKey="produits"
        filterDefinitions={filterDefinitions}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearAll={handleClearAllFilters}
        maxInlineFilters={2}
        resultCount={produits.length}
        totalCount={produits.length}
      />

      {/* Affichage conditionnel : Cartes sur mobile, Tableau sur desktop */}
      {isMobile ? (
        <MobileCardList
          items={produits}
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
          onReactivate={handleReactivate}
          emptyMessage="Aucun produit trouvé"
          renderCard={(produit) => (
            <Box>
              {/* En-tête */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                    Produit #{produit.id_produit}
                  </Typography>
                  <Typography variant="subtitle1" fontWeight="medium" sx={{ mt: 0.5 }}>
                    {produit.nom_produit}
                  </Typography>
                </Box>
                <Chip
                  label={produit.est_actif ? 'Actif' : 'Inactif'}
                  color={produit.est_actif ? 'success' : 'default'}
                  size="small"
                />
              </Box>

              <Divider sx={{ my: 1.5 }} />

              {/* Utilisation */}
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Utilisation
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                  {produit.pour_clients && (
                    <Chip
                      label="Client"
                      color="primary"
                      size="small"
                    />
                  )}
                  {produit.pour_fournisseurs && (
                    <Chip
                      label="Fournisseur"
                      color="secondary"
                      size="small"
                    />
                  )}
                  {!produit.pour_clients && !produit.pour_fournisseurs && (
                    <Typography variant="body2" color="text.secondary">
                      Non spécifié
                    </Typography>
                  )}
                </Box>
              </Box>
            </Box>
          )}
        />
      ) : (
        <DataGrid
          rows={produits}
          columns={columns}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
          onReactivate={handleReactivate}
          loading={loading}
          pageSize={10}
          showActions={true}
        />
      )}

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

