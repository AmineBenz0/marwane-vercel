import React from 'react';
import { Chip } from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as HourglassEmptyIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';

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
    label: 'En retard',
    color: 'error',
    icon: ErrorIcon,
  },
};

function PaymentStatusBadge({
  statut,
  showIcon = false,
  size = 'small',
  variant,
}) {
  const config = PAYMENT_STATUS_CONFIG[statut] || PAYMENT_STATUS_CONFIG.impaye;
  const IconComponent = config.icon;
  const needsAttention = statut === 'en_retard' || statut === 'impaye';

  return (
    <Chip
      label={config.label}
      color={config.color}
      size={size}
      variant={variant || (needsAttention ? 'filled' : 'outlined')}
      icon={showIcon ? <IconComponent /> : undefined}
      sx={{
        fontWeight: needsAttention ? 700 : 500,
        height: size === 'small' ? 24 : undefined,
      }}
    />
  );
}

export default PaymentStatusBadge;
