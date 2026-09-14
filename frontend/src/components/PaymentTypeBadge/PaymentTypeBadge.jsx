import { Chip } from '@mui/material';
import {
  Money as MoneyIcon,
  CreditCard as CreditCardIcon,
  AccountBalance as AccountBalanceIcon,
  Receipt as ReceiptIcon,
  SwapHoriz as SwapHorizIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';

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
  lc: {
    label: 'LC',
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

function PaymentTypeBadge({
  type,
  showIcon = true,
  size = 'small',
  variant = 'filled',
}) {
  const config = PAYMENT_TYPE_CONFIG[type] || PAYMENT_TYPE_CONFIG.autre;
  const IconComponent = config.icon;

  return (
    <Chip
      label={config.label}
      color={config.color}
      size={size}
      variant={variant}
      icon={showIcon ? <IconComponent /> : undefined}
      sx={{
        fontWeight: 500,
        height: size === 'small' ? 24 : undefined,
      }}
    />
  );
}

export default PaymentTypeBadge;
