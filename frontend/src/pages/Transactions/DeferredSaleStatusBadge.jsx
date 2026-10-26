import { Chip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { deferredSaleStatus } from './deferredSaleStatus';

export default function DeferredSaleStatusBadge({ sale }) {
  const state = deferredSaleStatus(sale);
  if (!state) return null;
  return <Chip size="small" variant="outlined" label={state.label} sx={theme => {
    const tone = theme.palette[state.color];
    const color = tone?.main || theme.palette.text.secondary;
    return {
      color: theme.palette.text.primary,
      bgcolor: alpha(color, 0.08),
      borderColor: alpha(color, 0.22),
      fontWeight: 700,
    };
  }} />;
}
