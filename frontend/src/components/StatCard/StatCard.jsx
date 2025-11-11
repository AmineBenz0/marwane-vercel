/**
 * Composant StatCard réutilisable.
 * 
 * Affiche une carte de statistique avec les fonctionnalités suivantes :
 * - Titre de la statistique
 * - Valeur principale
 * - Icône personnalisable
 * - Variation (optionnel) avec indicateur de tendance
 * - Design moderne avec Material-UI
 * 
 * @param {string} title - Titre de la statistique
 * @param {string|number} value - Valeur principale à afficher
 * @param {React.ReactNode} icon - Icône à afficher (composant Material-UI Icon)
 * @param {object} variation - Objet contenant la variation (optionnel)
 *   - {number} value - Valeur de la variation (en pourcentage ou nombre)
 *   - {string} type - Type de variation : 'increase', 'decrease', ou 'neutral'
 *   - {string} label - Label optionnel pour la variation (ex: "vs mois dernier")
 * @param {string} color - Couleur du thème pour la carte (défaut: 'primary')
 * @param {string} valueFormat - Format de la valeur : 'number', 'currency', 'percentage' (défaut: 'number')
 * @param {string} currency - Code de la devise pour le format 'currency' (défaut: 'EUR')
 */

import React from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Avatar,
  useTheme,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Remove as RemoveIcon,
} from '@mui/icons-material';

/**
 * Formate une valeur selon le type spécifié.
 */
const formatValue = (value, format, currency = 'EUR') => {
  if (value === null || value === undefined) return '-';

  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: currency,
      }).format(value);
    case 'percentage':
      return `${value}%`;
    case 'number':
    default:
      return new Intl.NumberFormat('fr-FR').format(value);
  }
};

/**
 * Composant StatCard.
 */
function StatCard({
  title,
  value,
  icon,
  variation = null,
  color = 'primary',
  valueFormat = 'number',
  currency = 'EUR',
}) {
  const theme = useTheme();

  // Couleurs selon le type de variation
  const getVariationColor = (type) => {
    switch (type) {
      case 'increase':
        return theme.palette.success.main;
      case 'decrease':
        return theme.palette.error.main;
      case 'neutral':
      default:
        return theme.palette.text.secondary;
    }
  };

  // Icône selon le type de variation
  const getVariationIcon = (type) => {
    switch (type) {
      case 'increase':
        return <TrendingUpIcon fontSize="small" />;
      case 'decrease':
        return <TrendingDownIcon fontSize="small" />;
      case 'neutral':
      default:
        return <RemoveIcon fontSize="small" />;
    }
  };

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: theme.shadows[8],
        },
      }}
    >
      <CardContent sx={{ flexGrow: 1, p: 3 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            mb: 2,
          }}
        >
          {/* Titre */}
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {title}
          </Typography>

          {/* Icône */}
          {icon && (
            <Avatar
              sx={{
                bgcolor: `${theme.palette[color].main}15`,
                color: theme.palette[color].main,
                width: 48,
                height: 48,
              }}
            >
              {icon}
            </Avatar>
          )}
        </Box>

        {/* Valeur principale */}
        <Typography
          variant="h4"
          component="div"
          sx={{
            fontWeight: 700,
            mb: variation ? 1 : 0,
            color: theme.palette.text.primary,
          }}
        >
          {formatValue(value, valueFormat, currency)}
        </Typography>

        {/* Variation (optionnel) */}
        {variation && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              mt: 1,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                color: getVariationColor(variation.type),
              }}
            >
              {getVariationIcon(variation.type)}
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  ml: 0.5,
                }}
              >
                {variation.value > 0 ? '+' : ''}
                {formatValue(variation.value, 'number')}
                {variation.valueFormat === 'percentage' ? '%' : ''}
              </Typography>
            </Box>
            {variation.label && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ ml: 0.5 }}
              >
                {variation.label}
              </Typography>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

export default StatCard;

