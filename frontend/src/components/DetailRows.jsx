import { Stack, Typography } from '@mui/material';

/**
 * Simple label / value rows for the inside of a details panel (no table borders).
 * rows: [{ key, label, value, hint }]
 */
export default function DetailRows({ rows, ariaLabel }) {
  return <Stack component="ul" aria-label={ariaLabel} spacing={0.75} sx={{ m: 0, p: 0, listStyle: 'none' }}>
    {rows.map((row) => <Stack component="li" key={row.key ?? row.label} direction="row" justifyContent="space-between" alignItems="baseline" spacing={2}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{row.label}</Typography>
      <Typography variant="body2" fontWeight={700} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
        {row.value}{row.hint && <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75, fontWeight: 400 }}>{row.hint}</Typography>}
      </Typography>
    </Stack>)}
  </Stack>;
}
