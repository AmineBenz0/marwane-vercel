/**
 * DataGrid — Tableau de données redesigné.
 *
 * Design: en-têtes discrets en uppercase, lignes lisibles,
 * filtres compacts en haut, actions claires, pagination propre.
 * Adapté mobile avec colonnes prioritaires et cartes condensées.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  Chip,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  Restore as RestoreIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';

// ─── Component ───────────────────────────────────────────────────────────────
function DataGrid({
  rows = [],
  columns = [],
  onEdit,
  onDelete,
  onView,
  onReactivate,
  loading = false,
  pageSize: initialPageSize = 10,
  showActions = true,
  onDisplayedRowsChange,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(initialPageSize);
  const [orderBy, setOrderBy] = useState(null);
  const [order, setOrder] = useState('asc');
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);

  const handleSort = (columnId) => {
    const isAsc = orderBy === columnId && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(columnId);
  };

  const handleFilterChange = (columnId, value) => {
    setFilters((prev) => ({ ...prev, [columnId]: value }));
    setPage(0);
  };

  const clearFilter = (columnId) => {
    setFilters((prev) => { const n = { ...prev }; delete n[columnId]; return n; });
    setPage(0);
  };

  const clearAllFilters = () => { setFilters({}); setPage(0); };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const filteredRows = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    return rows.filter((row) =>
      Object.keys(filters).every((columnId) => {
        const filterValue = filters[columnId];
        if (!filterValue || filterValue.trim() === '') return true;
        const cellValue = row[columnId];
        if (cellValue === null || cellValue === undefined) return false;
        return String(cellValue).toLowerCase().includes(filterValue.toLowerCase());
      })
    );
  }, [rows, filters]);

  const sortedRows = useMemo(() => {
    if (!orderBy) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const aVal = a[orderBy], bVal = b[orderBy];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      let cmp = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') cmp = aVal - bVal;
      else if (aVal instanceof Date && bVal instanceof Date) cmp = aVal.getTime() - bVal.getTime();
      else cmp = String(aVal).localeCompare(String(bVal));
      return order === 'asc' ? cmp : -cmp;
    });
  }, [filteredRows, orderBy, order]);

  const paginatedRows = useMemo(() => {
    return sortedRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [sortedRows, page, rowsPerPage]);

  useEffect(() => {
    if (typeof onDisplayedRowsChange === 'function') onDisplayedRowsChange(paginatedRows);
  }, [paginatedRows, onDisplayedRowsChange]);

  const visibleColumns = useMemo(() => {
    if (!isMobile) return columns;
    const priority = columns.filter((c) => c.mobilePriority);
    return priority.length > 0 ? priority : columns.slice(0, 3);
  }, [columns, isMobile]);

  const filterableColumns = columns.filter((c) => c.filterable !== false);
  const hasActions = showActions && (onEdit || onDelete || onView || onReactivate);

  if (!columns || columns.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Aucune colonne définie.</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      {/* ── Filter bar ────────────────────────────────────────────────── */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
        }}
      >
        {/* Filter toggle button */}
        <Tooltip title="Filtres" arrow>
          <IconButton
            size="small"
            onClick={() => setShowFilters(!showFilters)}
            sx={{
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: activeFilterCount > 0 ? 'primary.main' : 'divider',
              color: activeFilterCount > 0 ? 'primary.main' : 'text.secondary',
              backgroundColor: activeFilterCount > 0 ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
              '&:hover': {
                backgroundColor: activeFilterCount > 0
                  ? alpha(theme.palette.primary.main, 0.1)
                  : 'grey.100',
              },
            }}
          >
            <FilterIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        {/* Active filter chips */}
        {Object.entries(filters).map(([columnId, value]) => {
          if (!value) return null;
          const col = columns.find((c) => c.id === columnId);
          return (
            <Chip
              key={columnId}
              label={`${col?.label || columnId}: ${value}`}
              size="small"
              onDelete={() => clearFilter(columnId)}
              sx={{
                fontSize: '0.75rem',
                height: 26,
                backgroundColor: alpha(theme.palette.primary.main, 0.08),
                color: 'primary.dark',
                border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                '& .MuiChip-deleteIcon': { fontSize: 14, color: 'primary.main' },
              }}
            />
          );
        })}

        {activeFilterCount > 1 && (
          <Typography
            variant="caption"
            onClick={clearAllFilters}
            sx={{
              color: 'text.secondary',
              cursor: 'pointer',
              textDecoration: 'underline',
              '&:hover': { color: 'error.main' },
            }}
          >
            Tout effacer
          </Typography>
        )}

        {/* Row count */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ ml: 'auto', flexShrink: 0 }}
        >
          {filteredRows.length !== rows.length
            ? `${filteredRows.length} / ${rows.length} résultats`
            : `${rows.length} résultat${rows.length !== 1 ? 's' : ''}`
          }
        </Typography>
      </Box>

      {/* ── Filter inputs (collapsible) ───────────────────────────────── */}
      {showFilters && filterableColumns.length > 0 && (
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'grey.50',
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(190px, 1fr))',
            gap: 1.5,
          }}
        >
          {filterableColumns.map((column) => (
            <TextField
              key={column.id}
              size="small"
              placeholder={`Rechercher ${column.label || column.id}...`}
              value={filters[column.id] || ''}
              onChange={(e) => handleFilterChange(column.id, e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: filters[column.id] ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => clearFilter(column.id)}
                      edge="end"
                      sx={{ p: 0.25 }}
                    >
                      <ClearIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
                sx: { fontSize: '0.8125rem' },
              }}
              sx={{
                '& .MuiOutlinedInput-root': { borderRadius: 1.5 },
              }}
            />
          ))}
        </Box>
      )}

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size={isMobile ? 'small' : 'medium'} sx={{ minWidth: isMobile ? 'unset' : 500 }}>
          <TableHead>
            <TableRow>
              {visibleColumns.map((column) => (
                <TableCell
                  key={column.id}
                  align={column.align || 'left'}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  {column.sortable !== false ? (
                    <TableSortLabel
                      active={orderBy === column.id}
                      direction={orderBy === column.id ? order : 'asc'}
                      onClick={() => handleSort(column.id)}
                      sx={{
                        '&.Mui-active': { color: 'primary.main' },
                        '& .MuiTableSortLabel-icon': { fontSize: 14 },
                      }}
                    >
                      {column.label || column.id}
                    </TableSortLabel>
                  ) : (
                    column.label || column.id
                  )}
                </TableCell>
              ))}
              {hasActions && (
                <TableCell align="center" sx={{ width: isMobile ? 80 : 120 }}>
                  Actions
                </TableCell>
              )}
            </TableRow>
          </TableHead>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={visibleColumns.length + (hasActions ? 1 : 0)}
                  sx={{ py: 6, textAlign: 'center', border: 'none' }}
                >
                  <CircularProgress size={32} sx={{ color: 'primary.main' }} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                    Chargement…
                  </Typography>
                </TableCell>
              </TableRow>
            ) : paginatedRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleColumns.length + (hasActions ? 1 : 0)}
                  sx={{ py: 6, textAlign: 'center', border: 'none' }}
                >
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 3,
                      backgroundColor: 'grey.100',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mx: 'auto',
                      mb: 1.5,
                    }}
                  >
                    <SearchIcon sx={{ fontSize: 22, color: 'text.disabled' }} />
                  </Box>
                  <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    {activeFilterCount > 0 ? 'Aucun résultat pour ces filtres.' : 'Aucune donnée disponible.'}
                  </Typography>
                  {activeFilterCount > 0 && (
                    <Typography
                      variant="caption"
                      color="primary.main"
                      sx={{ cursor: 'pointer', mt: 0.5, display: 'block' }}
                      onClick={clearAllFilters}
                    >
                      Effacer les filtres
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map((row, rowIndex) => (
                <TableRow
                  key={row.id || rowIndex}
                  hover
                  sx={{
                    cursor: onView ? 'pointer' : 'default',
                    '&:hover': { backgroundColor: 'grey.50' },
                    // Subtle visual for inactive rows
                    ...(row.est_actif === false && {
                      opacity: 0.6,
                      backgroundColor: 'grey.50',
                    }),
                  }}
                  onClick={onView ? () => onView(row) : undefined}
                >
                  {visibleColumns.map((column) => {
                    const cellValue = row[column.id];
                    let displayValue = column.format ? column.format(cellValue, row)
                      : (cellValue === null || cellValue === undefined ? '—' : cellValue);

                    return (
                      <TableCell
                        key={column.id}
                        align={column.align || 'left'}
                        sx={{
                          maxWidth: column.maxWidth || 220,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: isMobile ? '0.8rem' : '0.875rem',
                          color: 'text.primary',
                        }}
                      >
                        {displayValue}
                      </TableCell>
                    );
                  })}

                  {hasActions && (
                    <TableCell
                      align="center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        {onView && (
                          <Tooltip title="Voir détails" arrow>
                            <IconButton
                              size="small"
                              onClick={() => onView(row)}
                              sx={{
                                color: 'info.main',
                                '&:hover': { backgroundColor: alpha(theme.palette.info.main, 0.08) },
                              }}
                            >
                              <VisibilityIcon sx={{ fontSize: 17 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {onEdit && (
                          <Tooltip title="Modifier" arrow>
                            <IconButton
                              size="small"
                              onClick={() => onEdit(row)}
                              sx={{
                                color: 'primary.main',
                                '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.08) },
                              }}
                            >
                              <EditIcon sx={{ fontSize: 17 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {row.est_actif === false && onReactivate ? (
                          <Tooltip title="Réactiver" arrow>
                            <IconButton
                              size="small"
                              onClick={() => onReactivate(row)}
                              sx={{
                                color: 'success.main',
                                '&:hover': { backgroundColor: alpha(theme.palette.success.main, 0.08) },
                              }}
                            >
                              <RestoreIcon sx={{ fontSize: 17 }} />
                            </IconButton>
                          </Tooltip>
                        ) : onDelete ? (
                          <Tooltip title="Supprimer" arrow>
                            <IconButton
                              size="small"
                              onClick={() => onDelete(row)}
                              sx={{
                                color: 'error.main',
                                '&:hover': { backgroundColor: alpha(theme.palette.error.main, 0.08) },
                              }}
                            >
                              <DeleteIcon sx={{ fontSize: 17 }} />
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

      {/* ── Pagination ────────────────────────────────────────────────── */}
      <TablePagination
        component="div"
        count={sortedRows.length}
        page={page}
        onPageChange={(_, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={isMobile ? [5, 10, 25] : [5, 10, 25, 50, 100]}
        labelRowsPerPage={isMobile ? 'Lignes:' : 'Lignes par page:'}
        labelDisplayedRows={({ from, to, count }) =>
          isMobile
            ? `${from}–${to} / ${count}`
            : `${from}–${to} sur ${count !== -1 ? count : `> ${to}`}`
        }
      />
    </Paper>
  );
}

export default DataGrid;
