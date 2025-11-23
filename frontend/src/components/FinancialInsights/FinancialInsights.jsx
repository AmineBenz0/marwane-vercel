/**
 * Composant FinancialInsights
 * 
 * Affiche des insights financiers avancés pour un client ou fournisseur dans un accordéon élégant.
 * Les données affichées incluent :
 * - Taux de paiement
 * - Montant en attente/impayé
 * - Délai moyen de paiement
 * - Fréquence d'achat/vente
 * - Dernière activité
 * - Transactions en retard
 */

import React, { useState } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Grid,
  Box,
  Chip,
  LinearProgress,
  Tooltip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  CalendarToday as CalendarTodayIcon,
  Speed as SpeedIcon,
  AttachMoney as AttachMoneyIcon,
} from '@mui/icons-material';
import { formatMontant } from '../../utils/formatNumber';

/**
 * Formate un nombre de jours en texte lisible.
 */
const formatJours = (jours) => {
  if (jours === null || jours === undefined) return '-';
  const j = Math.round(jours);
  if (j === 0) return "Aujourd'hui";
  if (j === 1) return '1 jour';
  if (j < 30) return `${j} jours`;
  const mois = Math.round(j / 30);
  return `${mois} mois`;
};

/**
 * Composant pour un insight individuel.
 */
const InsightCard = ({ icon, label, value, subValue, color = 'primary', alert = false }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Box
      sx={{
        p: { xs: 1.5, sm: 2 },
        bgcolor: alert ? 'error.50' : `${color}.50`,
        borderRadius: 2,
        border: `1px solid ${alert ? theme.palette.error.main : theme.palette[color]?.main}`,
        textAlign: 'center',
        transition: 'all 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 2,
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
        {React.cloneElement(icon, {
          sx: { 
            fontSize: { xs: 28, sm: 32 }, 
            color: alert ? 'error.main' : `${color}.main` 
          }
        })}
      </Box>
      <Typography 
        variant="caption" 
        color="text.secondary" 
        sx={{ 
          display: 'block',
          fontSize: { xs: '0.7rem', sm: '0.75rem' },
          mb: 0.5
        }}
      >
        {label}
      </Typography>
      <Typography 
        variant={isMobile ? 'h6' : 'h5'} 
        fontWeight="bold" 
        color={alert ? 'error.main' : `${color}.main`}
        sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}
      >
        {value}
      </Typography>
      {subValue && (
        <Typography 
          variant="caption" 
          color="text.secondary"
          sx={{ fontSize: { xs: '0.65rem', sm: '0.7rem' } }}
        >
          {subValue}
        </Typography>
      )}
    </Box>
  );
};

/**
 * Composant FinancialInsights
 */
function FinancialInsights({ 
  insights, 
  loading = false,
  type = 'client', // 'client' ou 'fournisseur'
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [expanded, setExpanded] = useState(false);

  if (!insights) return null;

  const {
    taux_paiement = 0,
    montant_impaye = 0,
    delai_moyen_paiement = null,
    frequence_moyenne = null,
    jours_depuis_derniere_transaction = null,
    nombre_transactions_en_retard = 0,
    montant_en_retard = 0,
    tendance = null, // 'hausse', 'baisse', 'stable'
  } = insights;

  // Déterminer si le taux de paiement est bon/moyen/mauvais
  const getTauxColor = () => {
    if (taux_paiement >= 90) return 'success';
    if (taux_paiement >= 70) return 'warning';
    return 'error';
  };

  // Déterminer l'icône de tendance
  const getTendanceIcon = () => {
    if (tendance === 'hausse') return <TrendingUpIcon fontSize="small" />;
    if (tendance === 'baisse') return <TrendingDownIcon fontSize="small" />;
    return null;
  };

  const getTendanceLabel = () => {
    if (tendance === 'hausse') return 'En hausse';
    if (tendance === 'baisse') return 'En baisse';
    return 'Stable';
  };

  const getTendanceColor = () => {
    if (tendance === 'hausse') return 'success';
    if (tendance === 'baisse') return 'error';
    return 'default';
  };

  return (
    <Accordion 
      expanded={expanded}
      onChange={() => setExpanded(!expanded)}
      sx={{
        mb: { xs: 2, sm: 2.5, md: 3 },
        borderRadius: 2,
        '&:before': { display: 'none' },
        boxShadow: 2,
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          bgcolor: 'primary.50',
          borderRadius: expanded ? '8px 8px 0 0' : 2,
          '&:hover': {
            bgcolor: 'primary.100',
          },
          px: { xs: 2, sm: 3 },
          py: { xs: 1, sm: 1.5 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
          <SpeedIcon sx={{ color: 'primary.main', fontSize: { xs: 28, sm: 32 } }} />
          <Box sx={{ flex: 1 }}>
            <Typography 
              variant="h6" 
              sx={{ 
                fontSize: { xs: '1rem', sm: '1.125rem', md: '1.25rem' },
                fontWeight: 600 
              }}
            >
              💡 Insights Financiers
            </Typography>
            <Typography 
              variant="caption" 
              color="text.secondary"
              sx={{ display: { xs: 'none', sm: 'block' } }}
            >
              Analyse détaillée de la santé financière et du comportement
            </Typography>
          </Box>
          
          {/* Chips résumés visibles même quand fermé */}
          {!expanded && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                size="small"
                label={`${taux_paiement.toFixed(0)}% payé`}
                color={getTauxColor()}
                icon={<CheckCircleIcon />}
              />
              {nombre_transactions_en_retard > 0 && (
                <Chip
                  size="small"
                  label={`${nombre_transactions_en_retard} en retard`}
                  color="error"
                  icon={<WarningIcon />}
                />
              )}
            </Box>
          )}
        </Box>
      </AccordionSummary>

      <AccordionDetails sx={{ p: { xs: 2, sm: 3 }, bgcolor: 'grey.50' }}>
        {/* Section 1 : Santé Financière */}
        <Box sx={{ mb: 3 }}>
          <Typography 
            variant="subtitle1" 
            fontWeight="bold" 
            gutterBottom
            sx={{ 
              fontSize: { xs: '0.95rem', sm: '1rem' },
              mb: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            <AttachMoneyIcon color="primary" fontSize="small" />
            Santé Financière
          </Typography>
          
          <Grid container spacing={{ xs: 1.5, sm: 2 }}>
            {/* Taux de paiement */}
            <Grid item xs={12} sm={6} md={4}>
              <InsightCard
                icon={<CheckCircleIcon />}
                label="Taux de paiement"
                value={`${taux_paiement.toFixed(1)}%`}
                color={getTauxColor()}
              />
              <Box sx={{ mt: 1, px: 1 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={Math.min(taux_paiement, 100)}
                  sx={{ 
                    height: 8, 
                    borderRadius: 4,
                    bgcolor: 'grey.200',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: theme.palette[getTauxColor()].main,
                      borderRadius: 4,
                    }
                  }}
                />
              </Box>
            </Grid>

            {/* Montant impayé */}
            <Grid item xs={12} sm={6} md={4}>
              <InsightCard
                icon={<WarningIcon />}
                label={type === 'client' ? 'Créances impayées' : 'Factures impayées'}
                value={formatMontant(montant_impaye)}
                alert={montant_impaye > 0}
                color={montant_impaye > 0 ? 'error' : 'success'}
              />
            </Grid>

            {/* Délai moyen de paiement */}
            <Grid item xs={12} sm={6} md={4}>
              <InsightCard
                icon={<ScheduleIcon />}
                label="Délai moyen de paiement"
                value={formatJours(delai_moyen_paiement)}
                subValue={delai_moyen_paiement > 30 ? '⚠️ Élevé' : '✅ Normal'}
                color={delai_moyen_paiement > 30 ? 'warning' : 'success'}
              />
            </Grid>
          </Grid>
        </Box>

        {/* Section 2 : Comportement */}
        <Box sx={{ mb: 3 }}>
          <Typography 
            variant="subtitle1" 
            fontWeight="bold" 
            gutterBottom
            sx={{ 
              fontSize: { xs: '0.95rem', sm: '1rem' },
              mb: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            <CalendarTodayIcon color="primary" fontSize="small" />
            Comportement d'Achat
          </Typography>
          
          <Grid container spacing={{ xs: 1.5, sm: 2 }}>
            {/* Fréquence */}
            <Grid item xs={12} sm={6} md={4}>
              <InsightCard
                icon={<SpeedIcon />}
                label="Fréquence moyenne"
                value={formatJours(frequence_moyenne)}
                subValue="entre transactions"
                color="info"
              />
            </Grid>

            {/* Dernière activité */}
            <Grid item xs={12} sm={6} md={4}>
              <InsightCard
                icon={<CalendarTodayIcon />}
                label="Dernière transaction"
                value={
                  jours_depuis_derniere_transaction === 0 
                    ? "Aujourd'hui" 
                    : `Il y a ${formatJours(jours_depuis_derniere_transaction)}`
                }
                alert={jours_depuis_derniere_transaction > 90}
                color={jours_depuis_derniere_transaction > 90 ? 'warning' : 'info'}
              />
            </Grid>

            {/* Tendance */}
            {tendance && (
              <Grid item xs={12} sm={6} md={4}>
                <Box
                  sx={{
                    p: { xs: 1.5, sm: 2 },
                    bgcolor: `${getTendanceColor()}.50`,
                    borderRadius: 2,
                    border: `1px solid ${theme.palette[getTendanceColor()]?.main}`,
                    textAlign: 'center',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  {getTendanceIcon()}
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                    Tendance
                  </Typography>
                  <Typography variant="h6" fontWeight="bold" color={`${getTendanceColor()}.main`}>
                    {getTendanceLabel()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    vs mois précédent
                  </Typography>
                </Box>
              </Grid>
            )}
          </Grid>
        </Box>

        {/* Section 3 : Alertes (si retards) */}
        {nombre_transactions_en_retard > 0 && (
          <Box>
            <Typography 
              variant="subtitle1" 
              fontWeight="bold" 
              gutterBottom
              sx={{ 
                fontSize: { xs: '0.95rem', sm: '1rem' },
                mb: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                color: 'error.main'
              }}
            >
              <WarningIcon fontSize="small" />
              ⚠️ Alertes
            </Typography>
            
            <Box
              sx={{
                p: 2,
                bgcolor: 'error.50',
                borderRadius: 2,
                border: `2px solid ${theme.palette.error.main}`,
              }}
            >
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="error.dark" fontWeight="medium">
                    <WarningIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                    {nombre_transactions_en_retard} transaction(s) en retard
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="error.dark" fontWeight="medium">
                    <AttachMoneyIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                    Montant total : {formatMontant(montant_en_retard)}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export default FinancialInsights;

