import { Typography } from '@mui/material';

/**
 * Table cell text that never widens its table: at most `lines` lines, the rest
 * cut with "…", the full text on hover. Use inside fixed-layout tables.
 */
export default function CellText({ children, title, lines = 1, sx = {}, ...props }) {
  const text = title ?? (typeof children === 'string' ? children : undefined);
  const clamp = lines > 1
    ? { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }
    : { whiteSpace: 'nowrap', textOverflow: 'ellipsis' };
  return (
    <Typography title={text} sx={{ overflow: 'hidden', minWidth: 0, ...clamp, ...sx }} {...props}>
      {children}
    </Typography>
  );
}
