/**
 * Composant Badge pour afficher le type de paiement.
 * 
 * Affiche un badge avec icône selon le type :
 * - 'cash' → 💵 Espèces
 * - 'cheque' → 💳 Chèque
 * - 'virement' → 🏦 Virement
 * - 'carte' → 💳 Carte
 * - 'traite' → 📝 Traite
 * - 'compensation' → ↔️ Compensation
 * - 'autre' → 📄 Autre
 */

import React from 'react';
import { Chip } from '@mui/material';
import {
  Money as MoneyIcon,
  CreditCard as CreditCardIcon,
  AccountBalance as AccountBalanceIcon,
  Receipt as ReceiptIcon,
  SwapHoriz as SwapHorizIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';

/**
 * Configuration des types de paiement.
 */
const PAYMENT_TYPE_CONFIG = {
  cash: {
    label: 'Espèces',
    icon: MoneyIcon,
    color: 'success',
  },
  cheque: {
    label: 'Chèque',
    icon: CreditCardIcon,
    color: 'info',
  },
  virement: {
    label: 'Virement',
    icon: AccountBalanceIcon,
    color: 'primary',
  },
  carte: {
    label: 'Carte',
    icon: CreditCardIcon,
    color: 'secondary',
  },
  traite: {
    label: 'Traite',
    icon: ReceiptIcon,
    color: 'warning',
  },
  compensation: {
    label: 'Compensation',
    icon: SwapHorizIcon,
    color: 'default',
  },
  autre: {
    label: 'Autre',
    icon: DescriptionIcon,
    color: 'default',
  },
};

/**
 * Composant PaymentTypeBadge.
 * 
 * @param {Object} props
 * @param {string} props.type - Type de paiement (cash, cheque, virement, etc.)
 * @param {boolean} [props.showIcon=true] - Afficher l'icône
 * @param {string} [props.size='small'] - Taille du badge (small, medium)
 * @param {string} [props.variant='filled'] - Variante du badge (filled, outlined)
 */
function PaymentTypeBadge({ type, showIcon = true, size = 'small', variant = 'filled' }) {
  const config = PAYMENT_TYPE_CONFIG[type] || PAYMENT_TYPE_CONFIG.autre;
  const IconComponent = config.icon;

  return (
    <Chip
      label={config.label}
      color={config.color}
      size={size}
      variant={variant}
      icon={showIcon ? <IconComponent /> : undefined}
    />
  );
}

export default PaymentTypeBadge;

