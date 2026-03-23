/**
 * Composant Badge pour afficher le statut de paiement d'une transaction.
 * 
 * Affiche un badge coloré selon le statut :
 * - 'surpaye' → Bleu "Surpayé"
 * - 'paye' → Vert "Payé"
 * - 'partiel' → Orange "Partiel"
 * - 'impaye' → Gris "Impayé"
 * - 'en_retard' → Rouge "EN RETARD"
 */

import React from 'react';
import { Chip } from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as HourglassEmptyIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';

/**
 * Configuration des statuts de paiement.
 */
const PAYMENT_STATUS_CONFIG = {
  surpaye: {
    label: 'Surpayé',
    color: 'info',
    icon: TrendingUpIcon,
  },
  paye: {
    label: 'Payé',
    color: 'success',
    icon: CheckCircleIcon,
  },
  partiel: {
    label: 'Partiel',
    color: 'warning',
    icon: HourglassEmptyIcon,
  },
  impaye: {
    label: 'Impayé',
    color: 'default',
    icon: WarningIcon,
  },
  en_retard: {
    label: 'EN RETARD',
    color: 'error',
    icon: ErrorIcon,
  },
};

/**
 * Composant PaymentStatusBadge.
 * 
 * @param {Object} props
 * @param {string} props.statut - Statut du paiement (paye, partiel, impaye, en_retard)
 * @param {boolean} [props.showIcon=true] - Afficher l'icône
 * @param {string} [props.size='small'] - Taille du badge (small, medium)
 */
function PaymentStatusBadge({ statut, showIcon = true, size = 'small' }) {
  const config = PAYMENT_STATUS_CONFIG[statut] || PAYMENT_STATUS_CONFIG.impaye;
  const IconComponent = config.icon;

  return (
    <Chip
      label={config.label}
      color={config.color}
      size={size}
      icon={showIcon ? <IconComponent /> : undefined}
      sx={{
        fontWeight: statut === 'en_retard' ? 'bold' : 'medium',
      }}
    />
  );
}

export default PaymentStatusBadge;

