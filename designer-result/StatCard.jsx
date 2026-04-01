/**
 * StatCard — Carte de statistique redesignée.
 *
 * Design: fond blanc, icône colorée, valeur grande et lisible,
 * indicateur de tendance clair, hover avec élévation subtile.
 */

import React from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Tooltip,
  alpha,
  useTheme,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Remove as NeutralIcon,
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

// ─── Color map ──────────────────────────────────────────────────────────────
const COLOR_MAP = {
  primary:   { bg: '#F0FDFA', icon: '#0D9488', text: '#0F766E', accent: '#14B8A6' },
  secondary: { bg: '#FFFBEB', icon: '#D97706', text: '#92400E', accent: '#F59E0B' },
  success:   { bg: '#F0FFF4', icon: '#16A34A', text: '#14532D', accent: '#22C55E' },
  error:     { bg: '#FFF5F5', icon: '#DC2626', text: '#7F1D1D', accent: '#EF4444' },
  info:      { bg: '#EBF8FF', icon: '#2563EB', text: '#1E3A5F', accent: '#3B82F6' },
  warning:   { bg: '#FFFBEB', icon: '#D97706', text: '#78350F', accent: '#F59E0B' },
};

// ─── Formatters ──────────────────────────────────────────────────────────────
const formatValue = (value, format, currency = 'MAD', useCompact = true) => {
  if (value === null || value === undefined) return '—';
  switch (format) {
    case 'currency':   return formatMontant(value, { currency, useCompactNotation: useCompact });
    case 'percentage': return formatPercentage(value);
    default:           return formatSimpleNumber(value, { useCompactNotation: useCompact });
  }
};

const getFullValue = (value, format, currency = 'MAD') => {
  if (value === null || value === undefined) return '—';
  switch (format) {
    case 'currency':   return formatMontantComplet(value, currency);
    case 'percentage': return formatPercentage(value, 2);
    default:           return formatNumberComplet(value);
  }
};

// ─── Component ───────────────────────────────────────────────────────────────
function StatCard({
  title,
  value,
  icon,
  variation = null,
  color = 'primary',
  valueFormat = 'number',
  currency = 'MAD',
  useCompactNotation = true,
  subtitle = null,
}) {
  const theme = useTheme();
  const colors = COLOR_MAP[color] || COLOR_MAP.primary;

  const formattedValue = formatValue(value, valueFormat, currency, useCompactNotation);
  const fullValue      = getFullValue(value, valueFormat, currency);
  const showTooltip    = needsCompactNotation(value) && useCompactNotation;

  const variationColors = {
    increase: { text: '#16A34A', bg: '#F0FFF4', border: '#C6F6D5' },
    decrease: { text: '#DC2626', bg: '#FFF5F5', border: '#FED7D7' },
    neutral:  { text: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
  };
  const varColor = variation ? (variationColors[variation.type] || variationColors.neutral) : null;

  const VariationIcon = {
    increase: TrendingUpIcon,
    decrease: TrendingDownIcon,
    neutral:  NeutralIcon,
  }[variation?.type] || NeutralIcon;

  return (
    <Card
      sx={{
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
        '&:hover': {
          boxShadow: '0 8px 30px rgba(15,23,42,0.10)',
          transform: 'translateY(-2px)',
        },
        // Subtle top accent line
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${colors.accent}, ${alpha(colors.accent, 0.4)})`,
          borderRadius: '12px 12px 0 0',
        },
      }}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        {/* Header: title + icon */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Typography
            variant="overline"
            sx={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.07em',
              color: 'text.secondary',
              lineHeight: 1.4,
              textTransform: 'uppercase',
              flex: 1,
              pr: 1,
            }}
          >
            {title}
          </Typography>

          {icon && (
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: 2.5,
                backgroundColor: colors.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: colors.icon,
                '& .MuiSvgIcon-root': { fontSize: 22 },
              }}
            >
              {icon}
            </Box>
          )}
        </Box>

        {/* Main value */}
        <Tooltip
          title={showTooltip ? fullValue : ''}
          arrow
          placement="top"
        >
          <Typography
            component="div"
            sx={{
              fontWeight: 700,
              fontSize: { xs: '1.5rem', sm: '1.75rem', lg: '1.875rem' },
              lineHeight: 1.1,
              color: 'text.primary',
              letterSpacing: '-0.02em',
              cursor: showTooltip ? 'help' : 'default',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              mb: subtitle ? 0.25 : 0,
            }}
          >
            {formattedValue}
          </Typography>
        </Tooltip>

        {/* Subtitle */}
        {subtitle && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {subtitle}
          </Typography>
        )}

        {/* Variation badge */}
        {variation && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.4,
                px: 0.875,
                py: 0.25,
                borderRadius: 1,
                backgroundColor: varColor.bg,
                border: `1px solid ${varColor.border}`,
              }}
            >
              <VariationIcon sx={{ fontSize: 13, color: varColor.text }} />
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: varColor.text,
                  lineHeight: 1,
                }}
              >
                {variation.value > 0 ? '+' : ''}
                {variation.valueFormat === 'percentage'
                  ? formatPercentage(variation.value)
                  : formatSimpleNumber(variation.value, { useCompactNotation: false })}
              </Typography>
            </Box>
            {variation.label && (
              <Typography variant="caption" color="text.secondary">
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
