/**
 * StatCardWithGauge
 *
 * Carte KPI compacte affichant un score avec une jauge circulaire + label.
 * Conçue pour s'intégrer dans la grille des StatCard existantes.
 */
import React from 'react';
import { Card, CardContent, Box, Typography, Chip, useTheme, useMediaQuery, CircularProgress } from '@mui/material';

const CircularGauge = ({ value, size = 110, strokeWidth = 10, color }) => {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e0e0e0"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          textAlign: 'center',
        }}
      >
        <Typography variant="h4" component="div" sx={{ fontWeight: 800, color }}>
          {Math.round(normalized)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          / 100
        </Typography>
      </Box>
    </Box>
  );
};

function StatCardWithGauge({ title = 'Score', score = 0, label = '', color = 'primary', loading = false }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const colorValue = theme.palette[color]?.main || theme.palette.primary.main;

  return (
    <Card sx={{ height: '100%', borderRadius: 2, boxShadow: 2 }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: { xs: 1, sm: 1.25 } }}>
          <Typography variant="subtitle2" color="text.secondary">
            {title}
          </Typography>
          {label ? (
            <Chip
              label={label}
              color={color}
              size="small"
              sx={{ height: 22, borderRadius: 1.5, fontWeight: 600 }}
            />
          ) : null}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loading ? (
            <Box sx={{ py: 4 }}>
              <CircularProgress size={isMobile ? 36 : 40} />
            </Box>
          ) : (
            <CircularGauge value={score} size={isMobile ? 96 : 110} strokeWidth={10} color={colorValue} />
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

export default StatCardWithGauge;


