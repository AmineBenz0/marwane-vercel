import { Box, Stack, Typography } from '@mui/material';

/**
 * Card version of the client/supplier balance tables, for screens too narrow
 * for the table. One card per transaction: product, date, amount, paid, remaining.
 */
function BalanceCardList({ rows, emptyText, paidLabel, remainingLabel = 'Reste' }) {
  if (rows.length === 0) {
    return <Typography color="text.secondary" align="center" sx={{ py: 3 }}>{emptyText}</Typography>;
  }

  return (
    <Stack spacing={1}>
      {rows.map((row) => (
        <Box key={row.key} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                fontWeight={800}
                title={row.title}
                sx={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}
              >
                {row.title}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {[row.date, row.detail].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            <Typography fontWeight={900} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{row.amount}</Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mt: 1 }} spacing={1}>
            <Typography variant="body2" color="text.secondary">
              {paidLabel} <Box component="span" sx={{ color: 'success.main', fontWeight: 800 }}>{row.paid}</Box>
              {row.payment && row.payment !== '-' ? ` · ${row.payment}` : ''}
            </Typography>
            <Typography variant="body2" fontWeight={900} sx={{ whiteSpace: 'nowrap', color: row.hasRemaining ? 'warning.main' : 'success.main' }}>
              {remainingLabel} {row.remaining}
            </Typography>
          </Stack>
          {row.due && row.due !== '-' && (
            <Typography variant="caption" color="text.secondary">Échéance {row.due}</Typography>
          )}
        </Box>
      ))}
    </Stack>
  );
}

export default BalanceCardList;
