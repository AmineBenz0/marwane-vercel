import PropTypes from 'prop-types';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';

/**
 * Asks before a window with unsaved input is closed, so Échap, × or « Annuler »
 * never throws away a half-filled sale or payment by accident.
 */
export default function DiscardChangesDialog({ open, title = 'Abandonner la saisie ?', onKeep, onDiscard }) {
  return (
    <Dialog open={open} onClose={onKeep} maxWidth="xs" fullWidth aria-labelledby="discard-changes-title">
      <DialogTitle id="discard-changes-title">{title}</DialogTitle>
      <DialogContent>
        <Typography>Les informations saisies seront perdues.</Typography>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onDiscard} color="error">Abandonner</Button>
        <Button onClick={onKeep} variant="contained" autoFocus>Continuer la saisie</Button>
      </DialogActions>
    </Dialog>
  );
}

DiscardChangesDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string,
  onKeep: PropTypes.func.isRequired,
  onDiscard: PropTypes.func.isRequired,
};
