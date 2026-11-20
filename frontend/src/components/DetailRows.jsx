import { Box, Stack, Typography } from '@mui/material';

/**
 * Simple label / value rows for the inside of a details panel (no table borders).
 * rows: [{ key, label, value, hint }] — the hint shows in teal under the value
 * (e.g. "− 737 pour cette vente"), so a long line never pushes the label onto two lines.
 */
export default function DetailRows({ rows, ariaLabel }) {
  return <Stack component="ul" aria-label={ariaLabel} spacing={0.75} sx={{ m: 0, p: 0, listStyle: 'none' }}>
    {rows.map((row) => <Stack component="li" key={row.key ?? row.label} direction="row" justifyContent="space-between" alignItems="baseline" spacing={2}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{row.label}</Typography>
      <Box sx={{ flexShrink: 0, textAlign: 'right' }}>
        <Typography variant="body2" fontWeight={700} sx={{ whiteSpace: 'nowrap' }}>{row.value}</Typography>
        {row.hint && <Typography variant="caption" display="block" sx={{ color: 'primary.dark', fontWeight: 700, whiteSpace: 'nowrap' }}>{row.hint}</Typography>}
      </Box>
    </Stack>)}
  </Stack>;
}
