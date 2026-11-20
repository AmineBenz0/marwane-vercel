import { Box, DialogTitle, IconButton, Typography } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

/**
 * Dialog title with a close (✕) button on the right, so every creation dialog
 * can be closed the same way (in addition to "Annuler" and the Escape key).
 */
export default function DialogTitleWithClose({ children, subtitle, onClose, disabled = false, id }) {
  return (
    <DialogTitle id={id} sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, pr: 2 }}>
      <Box sx={{ minWidth: 0 }}>
        <Box component="span" sx={{ display: 'block' }}>{children}</Box>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 400 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {onClose && (
        <IconButton aria-label="Fermer" onClick={onClose} disabled={disabled} size="small" sx={{ mt: -0.5 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      )}
    </DialogTitle>
  );
}
