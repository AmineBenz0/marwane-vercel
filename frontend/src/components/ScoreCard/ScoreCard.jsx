/**
 * Composant ScoreCard
 * 
 * Affiche le score de fiabilité d'un client ou la performance d'un fournisseur
 * avec une jauge circulaire élégante et des détails sur les composantes du score.
 */

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Chip,
  Grid,
  LinearProgress,
  Tooltip,
  Collapse,
  IconButton,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  Autorenew as AutorenewIcon,
  CalendarToday as CalendarTodayIcon,
  Info as InfoIcon,
} from '@mui/icons-material';

/**
 * Composant pour afficher un score circulaire (gauge)
 */
const CircularScore = ({ score, size = 180, strokeWidth = 12, color }) => {
  const normalizedScore = Math.min(Math.max(score, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalizedScore / 100) * circumference;

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'inline-flex',
        width: size,
        height: size,
      }}
    >
      <svg width={size} height={size}>
        {/* Cercle de fond */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e0e0e0"
          strokeWidth={strokeWidth}
        />
        {/* Cercle de progression */}
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
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
            transition: 'stroke-dashoffset 1s ease-in-out',
          }}
        />
      </svg>
      {/* Score au centre */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography
          variant="h2"
          component="div"
          sx={{ fontWeight: 'bold', color }}
        >
          {normalizedScore.toFixed(0)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          / 100
        </Typography>
      </Box>
    </Box>
  );
};

/**
 * Composant pour afficher une sous-métrique du score
 */
const ScoreMetric = ({ label, value, max, icon, color }) => {
  const percentage = (value / max) * 100;

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        {icon && React.cloneElement(icon, { 
          sx: { fontSize: 18, mr: 1, color: `${color}.main` } 
        })}
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {label}
        </Typography>
        <Typography variant="body2" fontWeight="bold" color={`${color}.main`}>
          {value.toFixed(1)} / {max}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={percentage}
        sx={{
          height: 8,
          borderRadius: 4,
          bgcolor: 'grey.200',
          '& .MuiLinearProgress-bar': {
            bgcolor: `${color}.main`,
            borderRadius: 4,
          },
        }}
      />
    </Box>
  );
};

/**
 * Composant ScoreCard principal
 */
function ScoreCard({ score, loading = false, type = 'client' }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [expanded, setExpanded] = useState(false);

  if (!score) return null;

  const {
    score_total = 0,
    score_paiement = 0,
    score_delais = 0,
    score_regularite = 0,
    score_anciennete = 0,
    categorie = 'moyen',
    label = 'Moyen',
    couleur = 'warning',
    taux_paiement = 0,
    taux_respect_delais = 0,
    frequence_jours = null,
    anciennete_mois = null,
    recommandation = '',
  } = score;

  // Couleur du score basée sur la catégorie
  const scoreColor = theme.palette[couleur]?.main || theme.palette.warning.main;

  return (
    <Card
      sx={{
        mb: { xs: 2, sm: 2.5, md: 3 },
        borderRadius: 2,
        boxShadow: 3,
        border: `2px solid ${scoreColor}`,
        overflow: 'visible',
      }}
    >
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Grid container spacing={3} alignItems="center">
          {/* Section gauche : Jauge circulaire */}
          <Grid item xs={12} md={4}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CircularScore
                score={score_total}
                size={isMobile ? 150 : 180}
                strokeWidth={isMobile ? 10 : 12}
                color={scoreColor}
              />
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Chip
                  label={label}
                  color={couleur}
                  size={isMobile ? 'medium' : 'large'}
                  sx={{
                    fontWeight: 'bold',
                    fontSize: isMobile ? '0.9rem' : '1rem',
                    px: 2,
                  }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 1 }}
                >
                  Score {type === 'client' ? 'Client' : 'Fournisseur'}
                </Typography>
              </Box>
            </Box>
          </Grid>

          {/* Section droite : Détails et métriques */}
          <Grid item xs={12} md={8}>
            <Box>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                📊 Composition du Score
                <Tooltip title="Cliquez pour voir les détails">
                  <IconButton
                    size="small"
                    onClick={() => setExpanded(!expanded)}
                    sx={{
                      transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.3s',
                    }}
                  >
                    <ExpandMoreIcon />
                  </IconButton>
                </Tooltip>
              </Typography>

              {/* Métriques résumées */}
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h6" color={couleur}>
                      {taux_paiement.toFixed(0)}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Taux paiement
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h6" color={couleur}>
                      {taux_respect_delais.toFixed(0)}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Respect délais
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h6" color={couleur}>
                      {frequence_jours ? `${Math.round(frequence_jours)}j` : '-'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Fréquence
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h6" color={couleur}>
                      {anciennete_mois || 0}m
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Ancienneté
                    </Typography>
                  </Box>
                </Grid>
              </Grid>

              {/* Détails expandables */}
              <Collapse in={expanded}>
                <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                    Détail des critères
                  </Typography>

                  <ScoreMetric
                    label="Taux de paiement"
                    value={score_paiement}
                    max={40}
                    icon={<CheckCircleIcon />}
                    color={couleur}
                  />

                  <ScoreMetric
                    label="Respect des délais"
                    value={score_delais}
                    max={30}
                    icon={<ScheduleIcon />}
                    color={couleur}
                  />

                  <ScoreMetric
                    label="Régularité"
                    value={score_regularite}
                    max={20}
                    icon={<AutorenewIcon />}
                    color={couleur}
                  />

                  <ScoreMetric
                    label="Ancienneté"
                    value={score_anciennete}
                    max={10}
                    icon={<CalendarTodayIcon />}
                    color={couleur}
                  />
                </Box>
              </Collapse>

              {/* Recommandation */}
              {recommandation && (
                <Box
                  sx={{
                    mt: 2,
                    p: 2,
                    bgcolor: `${couleur}.50`,
                    borderRadius: 2,
                    border: `1px solid ${scoreColor}`,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <InfoIcon sx={{ fontSize: 20, color: `${couleur}.main`, mt: 0.2 }} />
                    <Box>
                      <Typography variant="caption" fontWeight="bold" color={`${couleur}.main`}>
                        Recommandation
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {recommandation}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              )}
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

export default ScoreCard;

