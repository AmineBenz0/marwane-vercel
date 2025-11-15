/**
 * Composant pour afficher les filtres actifs sous forme de Chips.
 * 
 * Fonctionnalités :
 * - Affiche chaque filtre actif comme un Chip
 * - Permet de supprimer un filtre individuel
 * - Bouton pour tout réinitialiser
 * - Affiche le nombre de résultats filtrés
 */

import React from 'react';
import { Box, Chip, Typography, Button } from '@mui/material';
import { Clear as ClearIcon } from '@mui/icons-material';

/**
 * Composant FilterChips.
 * 
 * @param {Object} props
 * @param {Object} props.filters - Objet contenant les filtres actifs { filterId: value }
 * @param {Array} props.filterDefinitions - Définitions des filtres avec labels
 * @param {Function} props.onRemoveFilter - Callback appelé pour supprimer un filtre
 * @param {Function} props.onClearAll - Callback appelé pour tout réinitialiser
 * @param {number} props.resultCount - Nombre de résultats après filtrage
 * @param {number} props.totalCount - Nombre total de résultats
 */
function FilterChips({
  filters = {},
  filterDefinitions = [],
  onRemoveFilter,
  onClearAll,
  resultCount,
  totalCount,
}) {
  // Créer un map pour accéder rapidement aux définitions
  const definitionsMap = React.useMemo(() => {
    const map = new Map();
    filterDefinitions.forEach((def) => {
      map.set(def.id, def);
    });
    return map;
  }, [filterDefinitions]);

  // Obtenir les filtres actifs (avec valeur non vide)
  const activeFilters = React.useMemo(() => {
    return Object.entries(filters)
      .filter(([, value]) => {
        // Considérer comme actif si :
        // - string non vide
        // - nombre (y compris 0)
        // - boolean true
        // - array non vide
        if (typeof value === 'string') return value.trim() !== '';
        if (typeof value === 'number') return true;
        if (typeof value === 'boolean') return value === true;
        if (Array.isArray(value)) return value.length > 0;
        return false;
      })
      .map(([filterId, value]) => ({
        id: filterId,
        value,
        definition: definitionsMap.get(filterId),
      }))
      .filter((f) => f.definition); // Ignorer les filtres sans définition
  }, [filters, definitionsMap]);

  // Formater la valeur d'un filtre pour l'affichage
  const formatFilterValue = (filter) => {
    const { definition, value } = filter;

    // Utiliser le formatter personnalisé si disponible
    if (definition.formatChipValue) {
      return definition.formatChipValue(value);
    }

    // Formattage par défaut selon le type
    if (definition.type === 'select' && definition.options) {
      const option = definition.options.find((opt) => opt.value === value);
      return option ? option.label : value;
    }

    if (definition.type === 'date') {
      try {
        return new Date(value).toLocaleDateString('fr-FR');
      } catch {
        return value;
      }
    }

    if (definition.type === 'number') {
      return new Intl.NumberFormat('fr-FR').format(value);
    }

    // Par défaut, retourner la valeur telle quelle
    return String(value);
  };

  if (activeFilters.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        flexWrap: 'wrap',
        p: 2,
        bgcolor: 'action.hover',
        borderRadius: 1,
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
        Filtres actifs :
      </Typography>
      
      {activeFilters.map((filter) => (
        <Chip
          key={filter.id}
          label={`${filter.definition.label}: ${formatFilterValue(filter)}`}
          onDelete={() => onRemoveFilter(filter.id)}
          size="small"
          color="primary"
          variant="outlined"
        />
      ))}

      <Button
        size="small"
        startIcon={<ClearIcon />}
        onClick={onClearAll}
        sx={{ ml: 1 }}
      >
        Tout effacer
      </Button>

      {resultCount !== undefined && totalCount !== undefined && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ ml: 'auto', fontWeight: 500 }}
        >
          {resultCount} sur {totalCount} résultat{totalCount > 1 ? 's' : ''}
        </Typography>
      )}
    </Box>
  );
}

export default FilterChips;

