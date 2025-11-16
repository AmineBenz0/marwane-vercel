/**
 * Composant DataGrid réutilisable.
 * 
 * Affiche des données tabulaires avec les fonctionnalités suivantes :
 * - Affichage de données tabulaires
 * - Pagination
 * - Tri par colonnes
 * - Filtres
 * - Actions (éditer, supprimer)
 * 
 * @param {Array} rows - Les données à afficher (tableau d'objets)
 * @param {Array} columns - Configuration des colonnes
 * @param {Function} onEdit - Callback appelé lors du clic sur "Éditer" (reçoit la ligne)
 * @param {Function} onDelete - Callback appelé lors du clic sur "Supprimer" (reçoit la ligne)
 * @param {Function} onView - Callback appelé lors du clic sur "Voir détails" (reçoit la ligne)
 * @param {boolean} loading - Indique si les données sont en cours de chargement
 * @param {number} pageSize - Nombre d'éléments par page (défaut: 10)
 * @param {boolean} showActions - Afficher ou non la colonne d'actions (défaut: true)
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Paper,
  TextField,
  InputAdornment,
  IconButton,
  Box,
  CircularProgress,
  Typography,
  Tooltip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  Restore as RestoreIcon,
} from '@mui/icons-material';

/**
 * Composant DataGrid.
 */
function DataGrid({
  rows = [],
  columns = [],
  onEdit,
  onDelete,
  onView,
  onReactivate, // Nouvelle prop pour réactiver une ligne
  loading = false,
  pageSize: initialPageSize = 10,
  showActions = true,
  onDisplayedRowsChange,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // État pour la pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(initialPageSize);

  // État pour le tri
  const [orderBy, setOrderBy] = useState(null);
  const [order, setOrder] = useState('asc');

  // État pour les filtres
  const [filters, setFilters] = useState({});

  /**
   * Gère le changement de tri.
   */
  const handleSort = (columnId) => {
    const isAsc = orderBy === columnId && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(columnId);
  };

  /**
   * Gère le changement de filtre pour une colonne.
   */
  const handleFilterChange = (columnId, value) => {
    setFilters((prev) => ({
      ...prev,
      [columnId]: value,
    }));
    // Réinitialiser à la première page lors d'un changement de filtre
    setPage(0);
  };

  /**
   * Applique les filtres aux données.
   */
  const filteredRows = useMemo(() => {
    if (!rows || rows.length === 0) return [];

    return rows.filter((row) => {
      return Object.keys(filters).every((columnId) => {
        const filterValue = filters[columnId];
        if (!filterValue || filterValue.trim() === '') return true;

        const cellValue = row[columnId];
        if (cellValue === null || cellValue === undefined) return false;

        // Conversion en string pour la recherche (insensible à la casse)
        const searchValue = String(cellValue).toLowerCase();
        const filterLower = String(filterValue).toLowerCase();

        return searchValue.includes(filterLower);
      });
    });
  }, [rows, filters]);

  /**
   * Trie les données filtrées.
   */
  const sortedRows = useMemo(() => {
    if (!orderBy) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      const aValue = a[orderBy];
      const bValue = b[orderBy];

      // Gestion des valeurs null/undefined
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      // Comparaison selon le type
      let comparison = 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else if (aValue instanceof Date && bValue instanceof Date) {
        comparison = aValue.getTime() - bValue.getTime();
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return order === 'asc' ? comparison : -comparison;
    });
  }, [filteredRows, orderBy, order]);

  /**
   * Calcule les données paginées.
   */
  const paginatedRows = useMemo(() => {
    const startIndex = page * rowsPerPage;
    return sortedRows.slice(startIndex, startIndex + rowsPerPage);
  }, [sortedRows, page, rowsPerPage]);

  /**
   * Informe le parent des lignes actuellement affichées (après filtres/tri/pagination).
   */
  useEffect(() => {
    if (typeof onDisplayedRowsChange === 'function') {
      onDisplayedRowsChange(paginatedRows);
    }
  }, [paginatedRows, onDisplayedRowsChange]);

  /**
   * Gère le changement de page.
   */
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  /**
   * Gère le changement du nombre d'éléments par page.
   */
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  /**
   * Gère le clic sur le bouton d'édition.
   */
  const handleEdit = (row) => {
    if (onEdit) {
      onEdit(row);
    }
  };

  /**
   * Gère le clic sur le bouton de suppression.
   */
  const handleDelete = (row) => {
    if (onDelete) {
      onDelete(row);
    }
  };

  /**
   * Gère le clic sur le bouton de visualisation.
   */
  const handleView = (row) => {
    if (onView) {
      onView(row);
    }
  };

  /**
   * Gère le clic sur le bouton de réactivation.
   */
  const handleReactivate = (row) => {
    if (onReactivate) {
      onReactivate(row);
    }
  };

  // Si aucune colonne n'est définie, ne rien afficher
  if (!columns || columns.length === 0) {
    return (
      <Paper>
        <Box p={3} textAlign="center">
          <Typography color="textSecondary">
            Aucune colonne définie pour le tableau.
          </Typography>
        </Box>
      </Paper>
    );
  }

  // Filtrer les colonnes à afficher sur mobile (garder les plus importantes)
  const visibleColumns = useMemo(() => {
    if (!isMobile) return columns;
    // Sur mobile, afficher uniquement les colonnes marquées comme prioritaires
    // ou les 3 premières colonnes si aucune n'est marquée
    const priorityColumns = columns.filter((col) => col.mobilePriority);
    if (priorityColumns.length > 0) {
      return priorityColumns;
    }
    // Par défaut, prendre les 3 premières colonnes
    return columns.slice(0, 3);
  }, [columns, isMobile]);

  return (
    <Paper>
      {/* Zone de filtres */}
      <Box p={isMobile ? 1.5 : 2} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: isMobile 
              ? '1fr' 
              : 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: isMobile ? 1.5 : 2,
          }}
        >
          {columns
            .filter((col) => col.filterable !== false)
            .map((column) => (
              <TextField
                key={column.id}
                size="small"
                label={`Filtrer ${column.label || column.id}`}
                value={filters[column.id] || ''}
                onChange={(e) => handleFilterChange(column.id, e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                variant="outlined"
                fullWidth
              />
            ))}
        </Box>
      </Box>

      {/* Tableau */}
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table stickyHeader size={isMobile ? 'small' : 'medium'}>
          <TableHead>
            <TableRow>
              {visibleColumns.map((column) => (
                <TableCell
                  key={column.id}
                  align={column.align || 'left'}
                  sx={{ 
                    fontWeight: 'bold',
                    fontSize: isMobile ? '0.75rem' : '0.875rem',
                    padding: isMobile ? '8px 4px' : '16px',
                  }}
                >
                  {column.sortable !== false ? (
                    <TableSortLabel
                      active={orderBy === column.id}
                      direction={orderBy === column.id ? order : 'asc'}
                      onClick={() => handleSort(column.id)}
                    >
                      {column.label || column.id}
                    </TableSortLabel>
                  ) : (
                    column.label || column.id
                  )}
                </TableCell>
              ))}
              {showActions && (onEdit || onDelete || onView || onReactivate) && (
                <TableCell 
                  align="center" 
                  sx={{ 
                    fontWeight: 'bold', 
                    minWidth: isMobile ? 80 : 150,
                    fontSize: isMobile ? '0.75rem' : '0.875rem',
                    padding: isMobile ? '8px 4px' : '16px',
                  }}
                >
                  Actions
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
              {loading ? (
              <TableRow>
                <TableCell
                  colSpan={visibleColumns.length + (showActions && (onEdit || onDelete || onView || onReactivate) ? 1 : 0)}
                  align="center"
                  sx={{ py: 4 }}
                >
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : paginatedRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleColumns.length + (showActions && (onEdit || onDelete || onView || onReactivate) ? 1 : 0)}
                  align="center"
                  sx={{ py: 4 }}
                >
                  <Typography color="textSecondary">
                    Aucune donnée disponible.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map((row, rowIndex) => (
                <TableRow key={row.id || rowIndex} hover>
                  {visibleColumns.map((column) => {
                    const cellValue = row[column.id];
                    let displayValue = cellValue;

                    // Appliquer le formatter si défini
                    if (column.format && typeof column.format === 'function') {
                      displayValue = column.format(cellValue, row);
                    } else if (cellValue === null || cellValue === undefined) {
                      displayValue = '-';
                    }

                    return (
                      <TableCell 
                        key={column.id} 
                        align={column.align || 'left'}
                        sx={{
                          maxWidth: column.maxWidth || 'auto',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: isMobile ? '0.75rem' : '0.875rem',
                          padding: isMobile ? '8px 4px' : '16px',
                        }}
                      >
                        {displayValue}
                      </TableCell>
                    );
                  })}
                  {showActions && (onEdit || onDelete || onView) && (
                    <TableCell 
                      align="center"
                      sx={{ padding: isMobile ? '8px 4px' : '16px' }}
                    >
                      <Box sx={{ display: 'flex', gap: isMobile ? 0.5 : 1, justifyContent: 'center' }}>
                        {onView && (
                          <Tooltip title={isMobile ? "" : "Voir détails"}>
                            <IconButton
                              size="small"
                              color="info"
                              onClick={() => handleView(row)}
                              sx={{ padding: isMobile ? '4px' : '8px' }}
                            >
                              <VisibilityIcon fontSize={isMobile ? 'small' : 'small'} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {onEdit && (
                          <Tooltip title={isMobile ? "" : "Éditer"}>
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleEdit(row)}
                              sx={{ padding: isMobile ? '4px' : '8px' }}
                            >
                              <EditIcon fontSize={isMobile ? 'small' : 'small'} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {/* Afficher "Réactiver" si la ligne est inactive, sinon "Supprimer" */}
                        {row.est_actif === false && onReactivate ? (
                          <Tooltip title={isMobile ? "" : "Réactiver"}>
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => handleReactivate(row)}
                              sx={{ padding: isMobile ? '4px' : '8px' }}
                            >
                              <RestoreIcon fontSize={isMobile ? 'small' : 'small'} />
                            </IconButton>
                          </Tooltip>
                        ) : onDelete ? (
                          <Tooltip title={isMobile ? "" : "Supprimer"}>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDelete(row)}
                              sx={{ padding: isMobile ? '4px' : '8px' }}
                            >
                              <DeleteIcon fontSize={isMobile ? 'small' : 'small'} />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                      </Box>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <TablePagination
        component="div"
        count={sortedRows.length}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={isMobile ? [5, 10, 25] : [5, 10, 25, 50, 100]}
        labelRowsPerPage={isMobile ? "Lignes:" : "Lignes par page:"}
        labelDisplayedRows={({ from, to, count }) =>
          isMobile 
            ? `${from}-${to}/${count}`
            : `${from}-${to} sur ${count !== -1 ? count : `plus de ${to}`}`
        }
        sx={{
          '.MuiTablePagination-toolbar': {
            paddingLeft: isMobile ? 1 : 2,
            paddingRight: isMobile ? 1 : 2,
          },
          '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
            fontSize: isMobile ? '0.75rem' : '0.875rem',
          },
        }}
      />
    </Paper>
  );
}

export default DataGrid;

