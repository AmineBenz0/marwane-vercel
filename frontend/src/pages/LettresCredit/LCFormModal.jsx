import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  TextField,
  MenuItem,
  CircularProgress,
  Divider,
  IconButton,
  Box,
  Typography,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useForm } from 'react-hook-form';
import lettreCreditService from '../../services/lettreCreditService';
import { get } from '../../services/api';
import useNotification from '../../hooks/useNotification';
import { format } from 'date-fns';

function LCFormModal({ open, onClose, onSuccess }) {
  const notification = useNotification();
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    defaultValues: {
      numero_reference: '',
      numero_serie: '',
      banque_emettrice: '',
      montant: '',
      date_emission: format(new Date(), 'yyyy-MM-dd'),
      date_disponibilite: format(new Date(), 'yyyy-MM-dd'),
      id_client: '',
      notes: '',
    }
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      reset({
        numero_reference: '',
        numero_serie: '',
        banque_emettrice: '',
        montant: '',
        date_emission: format(new Date(), 'yyyy-MM-dd'),
        date_disponibilite: format(new Date(), 'yyyy-MM-dd'),
        id_client: '',
        notes: '',
      });
      
      const fetchClients = async () => {
        setLoadingClients(true);
        try {
          const cData = await get('/clients', { params: { limit: 1000, est_actif: true } });
          setClients(cData || []);
        } catch (err) {
          console.error(err);
          notification.error('Erreur lors du chargement des clients');
        } finally {
          setLoadingClients(false);
        }
      };
      fetchClients();
    }
  }, [open, reset]);

  const onSubmit = async (data) => {
    try {
      const payload = {
        numero_reference: data.numero_reference,
        numero_serie: data.numero_serie || null,
        banque_emettrice: data.banque_emettrice || null,
        montant: parseFloat(data.montant),
        date_emission: data.date_emission,
        date_disponibilite: data.date_disponibilite,
        id_client: Number(data.id_client),
        notes: data.notes || null,
      };

      await lettreCreditService.create(payload);
      notification.success('Lettre de Crédit créée avec succès');
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      notification.error(err?.message || 'Erreur lors de l\'enregistrement');
    }
  };

  if (!open) return null;

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        component: 'form',
        onSubmit: handleSubmit(onSubmit),
        sx: {
          borderRadius: 4,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }
      }}
    >
      <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography component="span" variant="h6" sx={{ fontWeight: 900 }}>
          Nouvelle Lettre de Crédit
        </Typography>
        <IconButton onClick={onClose} disabled={isSubmitting} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ backgroundColor: '#f7f3ea', p: 3 }}>
        {loadingClients ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Grid container spacing={2.5}>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('numero_reference', { required: 'La référence est requise' })}
                label="Référence LC"
                fullWidth
                required
                error={!!errors.numero_reference}
                helperText={errors.numero_reference?.message}
                disabled={isSubmitting}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('numero_serie')}
                label="Numéro de série"
                fullWidth
                error={!!errors.numero_serie}
                helperText={errors.numero_serie?.message}
                disabled={isSubmitting}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('banque_emettrice')}
                label="Banque Émettrice (optionnel)"
                fullWidth
                error={!!errors.banque_emettrice}
                helperText={errors.banque_emettrice?.message}
                disabled={isSubmitting}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('montant', { required: 'Le montant est requis', valueAsNumber: true })}
                label="Montant (MAD)"
                type="number"
                fullWidth
                required
                error={!!errors.montant}
                inputProps={{ step: '0.01', min: '0.01' }}
                disabled={isSubmitting}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('date_emission', { required: 'Requis' })}
                label="Date d'émission"
                type="date"
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                disabled={isSubmitting}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                {...register('date_disponibilite', { required: 'Requis' })}
                label="Date de disponibilité"
                type="date"
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                helperText="Date à partir de laquelle la LC peut être utilisée"
                disabled={isSubmitting}
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 1 }}>Client détenteur de la LC</Divider>
            </Grid>

            <Grid item xs={12}>
              <TextField
                {...register('id_client', { required: 'Le client est requis' })}
                select
                label="Sélectionner le Client"
                fullWidth
                required
                error={!!errors.id_client}
                helperText={errors.id_client?.message}
                disabled={isSubmitting}
              >
                <MenuItem value=""><em>-- Choisir --</em></MenuItem>
                {clients.map(c => (
                  <MenuItem key={c.id_client} value={c.id_client}>
                    {c.nom_client}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12}>
              <TextField
                {...register('notes')}
                label="Notes"
                fullWidth
                multiline
                rows={3}
                disabled={isSubmitting}
              />
            </Grid>
          </Grid>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isSubmitting} color="inherit">
          Annuler
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={isSubmitting}
          startIcon={isSubmitting ? <CircularProgress size={16} /> : null}
        >
          Créer la Lettre de Crédit
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default LCFormModal;
