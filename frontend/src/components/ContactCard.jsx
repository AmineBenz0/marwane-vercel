import { Link as RouterLink } from 'react-router-dom';
import { Box, Card, Divider, Typography } from '@mui/material';
import { ChevronRight as ChevronRightIcon } from '@mui/icons-material';
import { formatShortDate } from '../utils/dateFormatting';
import { formatMontantComplet } from '../utils/formatNumber';

export default function ContactCard({ to, name, createdAt, balance, type }) {
  // Decimal amounts arrive as strings. Missing/invalid values are never zero.
  const hasBalance = (typeof balance === 'number' || typeof balance === 'string')
    && String(balance).trim() !== '' && Number.isFinite(Number(balance));
  const amount = hasBalance ? Number(balance) : null;
  const isAdvance = hasBalance && amount < 0;
  const label = type === 'client'
    ? (isAdvance ? 'Avance reçue' : 'Reste à encaisser')
    : (isAdvance ? 'Avance versée' : 'Reste à payer');

  return (
    <Card
      component={RouterLink}
      to={to}
      variant="outlined"
      aria-label={`Voir le profil de ${name}`}
      sx={{
        display: 'block',
        minWidth: 0,
        p: 1.75,
        borderRadius: 3,
        color: 'text.primary',
        textDecoration: 'none',
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
        '&:hover': {
          borderColor: 'primary.light',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)',
        },
        '&:focus-visible': {
          outline: '3px solid',
          outlineColor: 'primary.main',
          outlineOffset: '-3px',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
        <Typography
          component="h2"
          variant="subtitle1"
          title={name}
          sx={{
            flex: 1,
            minWidth: 0,
            fontWeight: 800,
            lineHeight: 1.35,
            minHeight: '2.7em',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
            overflowWrap: 'anywhere',
          }}
        >
          {name}
        </Typography>
        <ChevronRightIcon aria-hidden="true" sx={{ fontSize: 20, color: 'text.secondary', flexShrink: 0, mt: 0.25 }} />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        Créé le {formatShortDate(createdAt)}
      </Typography>
      <Divider sx={{ my: 1.25 }} />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography
        component="p"
        sx={{ mt: 0.25, fontSize: '1.125rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}
      >
        {hasBalance ? formatMontantComplet(Math.abs(amount)) : 'Indisponible'}
      </Typography>
    </Card>
  );
}
