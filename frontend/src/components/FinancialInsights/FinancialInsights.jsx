import React, { useState } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Grid,
  Box,
  LinearProgress,
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

const formatJours = (jours) => {
  if (jours === null || jours === undefined) return '-';
  const rounded = Math.round(jours);
  if (rounded === 0) return "Aujourd'hui";
  if (rounded === 1) return '1 jour';
  if (rounded < 30) return `${rounded} jours`;
  return `${Math.round(rounded / 30)} mois`;
};

const InsightCard = ({ icon, label, value, subValue, color = 'primary', alert = false }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Box
      sx={{
        p: { xs: 1.5, sm: 2 },
        bgcolor: alert ? 'error.50' : 'background.paper',
        borderRadius: 2,
        border: '1px solid',
        borderColor: alert ? 'error.light' : 'divider',
        textAlign: 'center',
        height: '100%',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
        {React.cloneElement(icon, {
          sx: {
            fontSize: { xs: 24, sm: 28 },
            color: alert ? 'error.main' : `${color}.main`,
          },
        })}
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', fontSize: { xs: '0.7rem', sm: '0.75rem' }, mb: 0.5 }}
      >
        {label}
      </Typography>
      <Typography
        variant={isMobile ? 'h6' : 'h5'}
        fontWeight={800}
        color={alert ? 'error.main' : `${color}.main`}
        sx={{ fontSize: { xs: '1.05rem', sm: '1.2rem' } }}
      >
        {value}
      </Typography>
      {subValue && (
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.7rem' } }}>
          {subValue}
        </Typography>
      )}
    </Box>
  );
};

function FinancialInsights({
  insights,
  loading = false,
  type = 'client',
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
    tendance = null,
  } = insights;

  const getTauxColor = () => {
    if (taux_paiement >= 90) return 'success';
    if (taux_paiement >= 70) return 'warning';
    return 'error';
  };

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
    return 'info';
  };

  return (
    <Accordion
      expanded={expanded}
      onChange={() => setExpanded(!expanded)}
      sx={{
        mb: { xs: 2, sm: 2.5, md: 3 },
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: 'none',
        '&:before': { display: 'none' },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          borderRadius: expanded ? '8px 8px 0 0' : 2,
          px: { xs: 2, sm: 3 },
          py: { xs: 1, sm: 1.5 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
          <SpeedIcon sx={{ color: 'primary.main', fontSize: { xs: 24, sm: 28 } }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="h6"
              sx={{ fontSize: { xs: '1rem', sm: '1.125rem' }, fontWeight: 700 }}
            >
              Santé financière
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
              Paiement, retards et rythme d'activité
            </Typography>
          </Box>

          {!expanded && (
            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
              <Typography variant="body2" fontWeight={800} color={`${getTauxColor()}.main`}>
                {taux_paiement.toFixed(0)}% payé
              </Typography>
              {nombre_transactions_en_retard > 0 && (
                <Typography variant="caption" color="error.main" fontWeight={700}>
                  {nombre_transactions_en_retard} en retard
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </AccordionSummary>

      <AccordionDetails sx={{ p: { xs: 2, sm: 3 }, bgcolor: 'grey.50' }}>
        <Box sx={{ mb: 3 }}>
          <Typography
            variant="subtitle1"
            fontWeight={800}
            gutterBottom
            sx={{ fontSize: { xs: '0.95rem', sm: '1rem' }, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <AttachMoneyIcon color="primary" fontSize="small" />
            Paiements
          </Typography>

          <Grid container spacing={{ xs: 1.5, sm: 2 }}>
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
                    height: 7,
                    borderRadius: 4,
                    bgcolor: 'grey.200',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: theme.palette[getTauxColor()].main,
                      borderRadius: 4,
                    },
                  }}
                />
              </Box>
            </Grid>

            <Grid item xs={12} sm={6} md={4}>
              <InsightCard
                icon={<WarningIcon />}
                label={type === 'client' ? 'Créances impayées' : 'Factures impayées'}
                value={formatMontant(montant_impaye)}
                alert={montant_impaye > 0}
                color={montant_impaye > 0 ? 'error' : 'success'}
              />
            </Grid>

            <Grid item xs={12} sm={6} md={4}>
              <InsightCard
                icon={<ScheduleIcon />}
                label="Délai moyen"
                value={formatJours(delai_moyen_paiement)}
                subValue={delai_moyen_paiement > 30 ? 'Élevé' : 'Normal'}
                color={delai_moyen_paiement > 30 ? 'warning' : 'success'}
              />
            </Grid>
          </Grid>
        </Box>

        <Box sx={{ mb: nombre_transactions_en_retard > 0 ? 3 : 0 }}>
          <Typography
            variant="subtitle1"
            fontWeight={800}
            gutterBottom
            sx={{ fontSize: { xs: '0.95rem', sm: '1rem' }, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <CalendarTodayIcon color="primary" fontSize="small" />
            Activité
          </Typography>

          <Grid container spacing={{ xs: 1.5, sm: 2 }}>
            <Grid item xs={12} sm={6} md={4}>
              <InsightCard
                icon={<SpeedIcon />}
                label="Rythme moyen"
                value={formatJours(frequence_moyenne)}
                subValue="entre transactions"
                color="info"
              />
            </Grid>

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

            {tendance && (
              <Grid item xs={12} sm={6} md={4}>
                <InsightCard
                  icon={getTendanceIcon() || <SpeedIcon />}
                  label="Tendance"
                  value={getTendanceLabel()}
                  subValue="vs mois précédent"
                  color={getTendanceColor()}
                />
              </Grid>
            )}
          </Grid>
        </Box>

        {nombre_transactions_en_retard > 0 && (
          <Box
            sx={{
              p: 2,
              bgcolor: 'error.50',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'error.light',
            }}
          >
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="error.dark" fontWeight={700}>
                  {nombre_transactions_en_retard} transaction(s) en retard
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="error.dark" fontWeight={700}>
                  Montant total : {formatMontant(montant_en_retard)}
                </Typography>
              </Grid>
            </Grid>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export default FinancialInsights;
