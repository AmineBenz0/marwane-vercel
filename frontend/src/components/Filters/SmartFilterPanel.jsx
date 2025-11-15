/**
 * Composant SmartFilterPanel - Panneau de filtres intelligent et réutilisable.
 * 
 * Fonctionnalités :
 * - Affichage des filtres inline (les plus utilisés)
 * - Bouton "Filtres avancés" pour les autres filtres
 * - Tracking automatique de l'utilisation des filtres
 * - Support de différents types de filtres (text, select, date, number, etc.)
 * - Affichage des filtres actifs en chips
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Collapse,
  Paper,
  Divider,
  IconButton,
  Tooltip,
  InputAdornment,
} from '@mui/material';
import {
  FilterList as FilterListIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Search as SearchIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import FilterChips from './FilterChips';
import useFilterTracking from '../../hooks/useFilterTracking';

/**
 * Composant SmartFilterPanel.
 * 
 * @param {Object} props
 * @param {string} props.pageKey - Identifiant unique de la page pour le tracking
 * @param {Array} props.filterDefinitions - Définitions des filtres disponibles
 * @param {Object} props.filters - Valeurs actuelles des filtres
 * @param {Function} props.onFilterChange - Callback appelé lors du changement d'un filtre
 * @param {Function} props.onClearAll - Callback pour réinitialiser tous les filtres
 * @param {number} props.maxInlineFilters - Nombre maximum de filtres inline (défaut: 3)
 * @param {number} props.resultCount - Nombre de résultats filtrés
 * @param {number} props.totalCount - Nombre total de résultats
 * @param {boolean} props.showResetButton - Afficher un bouton pour reset le tracking
 */
function SmartFilterPanel({
  pageKey,
  filterDefinitions = [],
  filters = {},
  onFilterChange,
  onClearAll,
  maxInlineFilters = 3,
  resultCount,
  totalCount,
  showResetButton = false,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Hook de tracking des filtres
  const {
    trackFilterUsage,
    getInlineFilters,
    resetTracking,
  } = useFilterTracking(pageKey, filterDefinitions, maxInlineFilters);

  // Déterminer quels filtres afficher en inline
  const inlineFilterIds = useMemo(() => {
    return getInlineFilters();
  }, [getInlineFilters]);

  // Séparer les filtres en inline et avancés
  const { inlineFilters, advancedFilters } = useMemo(() => {
    const inline = [];
    const advanced = [];

    filterDefinitions.forEach((filter) => {
      if (inlineFilterIds.includes(filter.id)) {
        inline.push(filter);
      } else {
        advanced.push(filter);
      }
    });

    return { inlineFilters: inline, advancedFilters: advanced };
  }, [filterDefinitions, inlineFilterIds]);

  /**
   * Gère le changement de valeur d'un filtre.
   */
  const handleFilterChange = useCallback((filterId, value) => {
    // Tracker l'utilisation du filtre
    trackFilterUsage(filterId);
    
    // Appeler le callback parent
    onFilterChange(filterId, value);
  }, [trackFilterUsage, onFilterChange]);

  /**
   * Supprime un filtre individuel.
   */
  const handleRemoveFilter = useCallback((filterId) => {
    const filterDef = filterDefinitions.find((f) => f.id === filterId);
    if (filterDef) {
      handleFilterChange(filterId, filterDef.defaultValue || '');
    }
  }, [filterDefinitions, handleFilterChange]);

  /**
   * Rend un champ de filtre selon son type.
   */
  const renderFilterField = useCallback((filter, isInline = false) => {
    const value = filters[filter.id] || filter.defaultValue || '';
    const commonProps = {
      size: 'small',
      fullWidth: !isInline,
      sx: isInline ? { minWidth: 200, maxWidth: 300 } : {},
    };

    switch (filter.type) {
      case 'text':
      case 'search':
        return (
          <TextField
            key={filter.id}
            label={filter.label}
            placeholder={filter.placeholder}
            value={value}
            onChange={(e) => handleFilterChange(filter.id, e.target.value)}
            InputProps={
              filter.type === 'search'
                ? {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }
                : undefined
            }
            {...commonProps}
          />
        );

      case 'select':
        return (
          <FormControl key={filter.id} {...commonProps}>
            <InputLabel>{filter.label}</InputLabel>
            <Select
              value={value}
              label={filter.label}
              onChange={(e) => handleFilterChange(filter.id, e.target.value)}
            >
              <MenuItem value="">Tous</MenuItem>
              {filter.options?.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );

      case 'date':
        return (
          <TextField
            key={filter.id}
            label={filter.label}
            type="date"
            value={value}
            onChange={(e) => handleFilterChange(filter.id, e.target.value)}
            InputLabelProps={{ shrink: true }}
            {...commonProps}
          />
        );

      case 'number':
        return (
          <TextField
            key={filter.id}
            label={filter.label}
            type="number"
            value={value}
            onChange={(e) => handleFilterChange(filter.id, e.target.value)}
            inputProps={{
              min: filter.min,
              max: filter.max,
              step: filter.step || 1,
            }}
            {...commonProps}
          />
        );

      case 'custom':
        // Permet de passer un composant personnalisé
        if (filter.renderComponent) {
          return (
            <Box key={filter.id} {...commonProps}>
              {filter.renderComponent({
                value,
                onChange: (newValue) => handleFilterChange(filter.id, newValue),
                filter,
              })}
            </Box>
          );
        }
        return null;

      default:
        return null;
    }
  }, [filters, handleFilterChange]);

  /**
   * Vérifie si au moins un filtre est actif.
   */
  const hasActiveFilters = useMemo(() => {
    return Object.values(filters).some((value) => {
      if (typeof value === 'string') return value.trim() !== '';
      if (typeof value === 'number') return true;
      if (typeof value === 'boolean') return value === true;
      if (Array.isArray(value)) return value.length > 0;
      return false;
    });
  }, [filters]);

  return (
    <Box sx={{ mb: 3 }}>
      {/* Filtres inline */}
      <Paper sx={{ p: 2 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            mb: 2,
          }}
        >
          <FilterListIcon color="action" />
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              flexWrap: 'wrap',
              flex: 1,
              alignItems: 'center',
            }}
          >
            {inlineFilters.map((filter) => renderFilterField(filter, true))}
          </Box>

          {/* Bouton Filtres avancés */}
          {advancedFilters.length > 0 && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              endIcon={advancedOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{ flexShrink: 0 }}
            >
              Filtres avancés ({advancedFilters.length})
            </Button>
          )}

          {/* Bouton de reset du tracking (debug) */}
          {showResetButton && (
            <Tooltip title="Réinitialiser le tracking des filtres">
              <IconButton
                size="small"
                onClick={resetTracking}
                color="warning"
              >
                <HistoryIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Panneau des filtres avancés */}
        <Collapse in={advancedOpen}>
          <Divider sx={{ my: 2 }} />
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: 2,
            }}
          >
            {advancedFilters.map((filter) => renderFilterField(filter, false))}
          </Box>
        </Collapse>
      </Paper>

      {/* Chips des filtres actifs */}
      {hasActiveFilters && (
        <Box sx={{ mt: 2 }}>
          <FilterChips
            filters={filters}
            filterDefinitions={filterDefinitions}
            onRemoveFilter={handleRemoveFilter}
            onClearAll={onClearAll}
            resultCount={resultCount}
            totalCount={totalCount}
          />
        </Box>
      )}
    </Box>
  );
}

export default SmartFilterPanel;

