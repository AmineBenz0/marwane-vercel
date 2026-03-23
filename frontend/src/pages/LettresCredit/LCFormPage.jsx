import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  TextField,
  MenuItem,
  Stack,
  CircularProgress,
  Divider,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Save as SaveIcon } from '@mui/icons-material';
import { useForm } from 'react-hook-form';
import lettreCreditService from '../../services/lettreCreditService';
import { get } from '../../services/api';
import useNotification from '../../hooks/useNotification';
import { format } from 'date-fns';

function LCFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notification = useNotification();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [clients, setClients] = useState([]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
    reset,
  } = useForm({
    defaultValues: {
      date_emission: format(new Date(), 'yyyy-MM-dd'),
      date_disponibilite: format(new Date(), 'yyyy-MM-dd'),
    }
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const cData = await get('/clients', { params: { limit: 1000, est_actif: true } });
        setClients(cData || []);

        if (isEdit) {
          const lcData = await lettreCreditService.getById(id);
          reset({
            ...lcData,
            date_emission: format(new Date(lcData.date_emission), 'yyyy-MM-dd'),
            date_disponibilite: format(new Date(lcData.date_disponibilite), 'yyyy-MM-dd'),
          });
        }
      } catch (err) {
        console.error(err);
        notification.error('Erreur lors du chargement des données');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, isEdit, reset]);

  const onSubmit = async (data) => {
    try {
      const payload = {
        numero_reference: data.numero_reference,
        numero_serie: data.numero_serie || null,
        banque_emettrice: data.banque_emettrice || null,
        montant: parseFloat(data.montant),
        date_emission: data.date_emission,
        date_disponibilite: data.date_disponibilite,
        id_client: data.id_client,
        notes: data.notes || null,
      };

      if (isEdit) {
        await lettreCreditService.update(id, payload);
        notification.success('Lettre de Crédit mise à jour');
      } else {
        await lettreCreditService.create(payload);
        notification.success('Lettre de Crédit créée avec succès');
      }
      navigate('/lettres-credit');
    } catch (err) {
      console.error(err);
      notification.error(err?.message || 'Erreur lors de l\'enregistrement');
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/lettres-credit')}>
          Retour
        </Button>
        <Typography variant="h4" component="h1">
          {isEdit ? 'Modifier la LC' : 'Nouvelle Lettre de Crédit'}
        </Typography>
      </Stack>

      <Paper sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('numero_reference', { required: 'La référence est requise' })}
                label="Référence LC"
                fullWidth
                required
                error={!!errors.numero_reference}
                helperText={errors.numero_reference?.message}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('numero_serie')}
                label="Numéro de série"
                fullWidth
                error={!!errors.numero_serie}
                helperText={errors.numero_serie?.message}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('banque_emettrice')}
                label="Banque Émettrice (optionnel)"
                fullWidth
                error={!!errors.banque_emettrice}
                helperText={errors.banque_emettrice?.message}
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
                inputProps={{ step: '0.01' }}
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
              />
            </Grid>

            <Grid item xs={12}><Divider sx={{ my: 1 }}>Client détenteur de la LC</Divider></Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                {...register('id_client', { required: 'Le client est requis' })}
                select
                label="Sélectionner le Client"
                fullWidth
                required
                error={!!errors.id_client}
                helperText={errors.id_client?.message}
              >
                <MenuItem value=""><em>-- Choisir --</em></MenuItem>
                {clients.map(c => <MenuItem key={c.id_client} value={c.id_client}>{c.nom_client}</MenuItem>)}
              </TextField>
            </Grid>

            <Grid item xs={12}>
              <TextField
                {...register('notes')}
                label="Notes"
                fullWidth
                multiline
                rows={3}
              />
            </Grid>

            <Grid item xs={12} sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
              <Button onClick={() => navigate('/lettres-credit')}>Annuler</Button>
              <Button
                type="submit"
                variant="contained"
                startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                disabled={isSubmitting}
              >
                {isEdit ? 'Mettre à jour' : 'Créer la Lettre de Crédit'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Box>
  );
}

export default LCFormPage;
