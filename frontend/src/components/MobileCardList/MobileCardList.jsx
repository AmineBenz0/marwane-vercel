/**
 * Composant MobileCardList - Affichage en cartes pour mobile.
 * 
 * Alternative au tableau DataGrid pour les petits écrans.
 * Affiche les données sous forme de cartes empilées verticalement avec pagination.
 * 
 * @param {Array} items - Les données à afficher
 * @param {Function} renderCard - Fonction pour rendre une carte (reçoit l'item et les actions)
 * @param {Function} onView - Callback pour voir les détails
 * @param {Function} onEdit - Callback pour éditer
 * @param {Function} onDelete - Callback pour supprimer
 * @param {Function} onReactivate - Callback pour réactiver
 * @param {boolean} loading - Indique si les données sont en cours de chargement
 * @param {string} emptyMessage - Message à afficher si aucune donnée
 * @param {number} pageSize - Nombre d'éléments par page (défaut: 10)
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Typography,
  CircularProgress,
  Tooltip,
  Stack,
  Pagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Restore as RestoreIcon,
} from '@mui/icons-material';

function MobileCardList({
  items = [],
  renderCard,
  onView,
  onEdit,
  onDelete,
  onReactivate,
  loading = false,
  emptyMessage = 'Aucune donnée disponible',
  pageSize: initialPageSize = 10,
}) {
  // État pour la pagination
  const [page, setPage] = useState(1); // Pagination commence à 1 pour MUI
  const [rowsPerPage, setRowsPerPage] = useState(initialPageSize);

  // Calculer les items paginés
  const paginatedItems = useMemo(() => {
    const startIndex = (page - 1) * rowsPerPage;
    return items.slice(startIndex, startIndex + rowsPerPage);
  }, [items, page, rowsPerPage]);

  // Calculer le nombre total de pages
  const totalPages = Math.ceil(items.length / rowsPerPage);

  // Réinitialiser à la page 1 si les items changent
  React.useEffect(() => {
    setPage(1);
  }, [items.length]);

  // Gérer le changement de page
  const handlePageChange = (event, value) => {
    setPage(value);
    // Scroll vers le haut lors du changement de page
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Gérer le changement du nombre d'éléments par page
  const handleRowsPerPageChange = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(1);
  };

  // Affichage du chargement
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '200px',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // Affichage si aucune donnée
  if (items.length === 0) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 4,
          px: 2,
        }}
      >
        <Typography color="text.secondary">
          {emptyMessage}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Contrôles de pagination en haut */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        mb: 2,
        flexWrap: 'wrap',
        gap: 1,
      }}>
        <Typography variant="body2" color="text.secondary">
          {items.length} résultat{items.length > 1 ? 's' : ''}
        </Typography>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Par page</InputLabel>
          <Select
            value={rowsPerPage}
            label="Par page"
            onChange={handleRowsPerPageChange}
          >
            <MenuItem value={5}>5</MenuItem>
            <MenuItem value={10}>10</MenuItem>
            <MenuItem value={25}>25</MenuItem>
            <MenuItem value={50}>50</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Liste des cartes */}
      <Stack spacing={2}>
        {paginatedItems.map((item, index) => (
        <Card 
          key={item.id || index}
          variant="outlined"
          sx={{
            '&:hover': {
              boxShadow: 2,
            },
          }}
        >
          <CardContent sx={{ pb: 1 }}>
            {renderCard(item)}
          </CardContent>
          
          {/* Actions */}
          {(onView || onEdit || onDelete || onReactivate) && (
            <CardActions sx={{ justifyContent: 'flex-end', pt: 0, px: 2, pb: 1.5 }}>
              {onView && (
                <Tooltip title="Voir détails">
                  <IconButton
                    size="small"
                    color="info"
                    onClick={() => onView(item)}
                  >
                    <VisibilityIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {onEdit && (
                <Tooltip title="Éditer">
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={() => onEdit(item)}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {/* Afficher "Réactiver" si la ligne est inactive, sinon "Supprimer" */}
              {item.est_actif === false && onReactivate ? (
                <Tooltip title="Réactiver">
                  <IconButton
                    size="small"
                    color="success"
                    onClick={() => onReactivate(item)}
                  >
                    <RestoreIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : onDelete ? (
                <Tooltip title="Supprimer">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => onDelete(item)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null}
            </CardActions>
          )}
        </Card>
        ))}
      </Stack>

      {/* Pagination en bas */}
      {totalPages > 1 && (
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          mt: 3,
        }}>
          <Pagination 
            count={totalPages}
            page={page}
            onChange={handlePageChange}
            color="primary"
            size="medium"
            showFirstButton
            showLastButton
          />
          <Typography variant="caption" color="text.secondary">
            Page {page} sur {totalPages} • {items.length} résultat{items.length > 1 ? 's' : ''} au total
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default MobileCardList;

