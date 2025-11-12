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
 * @param {string} currency - Code de la devise pour le format 'currency' (défaut: 'MAD')
 */

import React from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Avatar,
  useTheme,
  Tooltip,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Remove as RemoveIcon,
} from '@mui/icons-material';
import { 
  formatMontant, 
  formatSimpleNumber, 
  formatPercentage,
  formatMontantComplet,
  formatNumberComplet,
  needsCompactNotation,
  getRecommendedFontSize,
} from '../../utils/formatNumber';

/**
 * Formate une valeur selon le type spécifié.
 */
const formatValue = (value, format, currency = 'MAD', useCompact = true) => {
  if (value === null || value === undefined) return '-';

  switch (format) {
    case 'currency':
      return formatMontant(value, { 
        currency, 
        useCompactNotation: useCompact,
      });
    case 'percentage':
      return formatPercentage(value);
    case 'number':
    default:
      return formatSimpleNumber(value, {
        useCompactNotation: useCompact,
      });
  }
};

/**
 * Obtient la valeur complète pour le tooltip.
 */
const getFullValue = (value, format, currency = 'MAD') => {
  if (value === null || value === undefined) return '-';

  switch (format) {
    case 'currency':
      return formatMontantComplet(value, currency);
    case 'percentage':
      return formatPercentage(value, 2);
    case 'number':
    default:
      return formatNumberComplet(value);
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
  currency = 'MAD',
  useCompactNotation = true,
}) {
  const theme = useTheme();
  
  // Formater la valeur avec notation compacte si nécessaire
  const formattedValue = formatValue(value, valueFormat, currency, useCompactNotation);
  const fullValue = getFullValue(value, valueFormat, currency);
  const showTooltip = needsCompactNotation(value) && useCompactNotation;
  const fontSize = getRecommendedFontSize(formattedValue);

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
        <Tooltip 
          title={showTooltip ? fullValue : ''} 
          arrow
          placement="top"
        >
          <Typography
            variant={fontSize}
            component="div"
            sx={{
              fontWeight: 700,
              mb: variation ? 1 : 0,
              color: theme.palette.text.primary,
              cursor: showTooltip ? 'help' : 'default',
              wordBreak: 'break-word',
            }}
          >
            {formattedValue}
          </Typography>
        </Tooltip>

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
                {variation.valueFormat === 'percentage' 
                  ? formatPercentage(variation.value) 
                  : formatSimpleNumber(variation.value, { useCompactNotation: false })}
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

