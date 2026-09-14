/**
 * Composant pour afficher les filtres actifs sous forme de chips discrets.
 */

import React from 'react';
import { Box, Chip, Button } from '@mui/material';

function FilterChips({
  filters = {},
  filterDefinitions = [],
  onRemoveFilter,
  onClearAll,
}) {
  const definitionsMap = React.useMemo(() => {
    const map = new Map();
    filterDefinitions.forEach((def) => {
      map.set(def.id, def);
    });
    return map;
  }, [filterDefinitions]);

  const activeFilters = React.useMemo(() => {
    return Object.entries(filters)
      .filter(([, value]) => {
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
      .filter((filter) => filter.definition);
  }, [filters, definitionsMap]);

  const formatFilterValue = (filter) => {
    const { definition, value } = filter;

    if (definition.formatChipValue) {
      return definition.formatChipValue(value);
    }

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
        gap: 0.75,
        flexWrap: 'wrap',
        pt: 1,
      }}
    >
      {activeFilters.map((filter) => (
        <Chip
          key={filter.id}
          label={`${filter.definition.label}: ${formatFilterValue(filter)}`}
          onDelete={() => onRemoveFilter(filter.id)}
          size="small"
          variant="outlined"
          sx={{
            maxWidth: '100%',
            bgcolor: 'background.paper',
            color: 'text.secondary',
            borderColor: 'divider',
            '& .MuiChip-deleteIcon': {
              color: 'text.disabled',
              '&:hover': { color: 'text.secondary' },
            },
          }}
        />
      ))}

      <Button
        size="small"
        onClick={onClearAll}
        color="inherit"
        sx={{ minWidth: 'auto', px: 1, color: 'text.secondary' }}
      >
        Effacer
      </Button>
    </Box>
  );
}

export default FilterChips;
