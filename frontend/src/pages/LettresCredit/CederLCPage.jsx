import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Stack,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Save as SaveIcon } from '@mui/icons-material';
import { useForm } from 'react-hook-form';
import lettreCreditService from '../../services/lettreCreditService';
import CessionLCForm from '../../components/CessionLCForm/CessionLCForm';
import useNotification from '../../hooks/useNotification';
import { format } from 'date-fns';

function CederLCPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notification = useNotification();
  
  const [lc, setLc] = useState(null);
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
    reset,
  } = useForm({
    defaultValues: {
      date_cession: format(new Date(), 'yyyy-MM-dd'),
      type_cessionnaire: 'fournisseur',
    }
  });

  useEffect(() => {
    const fetchLc = async () => {
      try {
        const data = await lettreCreditService.getById(id);
        if (data.statut !== 'active') {
          notification.error('Cette LC ne peut pas être cédée car elle n\'est pas active');
          navigate(`/lettres-credit/${id}`);
          return;
        }
        setLc(data);
      } catch (err) {
        console.error(err);
        notification.error('Impossible de charger la LC');
      } finally {
        setLoading(false);
      }
    };
    fetchLc();
  }, [id]);

  const onSubmit = async (data) => {
    try {
      const payload = {
        id_lc: parseInt(id),
        type_cedant: lc.type_detenteur,
        id_cedant_client: lc.id_client,
        id_cedant_fournisseur: lc.id_fournisseur,
        type_cessionnaire: data.type_cessionnaire,
        id_cessionnaire_client: data.type_cessionnaire === 'client' ? data.id_cessionnaire_client : null,
        id_cessionnaire_fournisseur: data.type_cessionnaire === 'fournisseur' ? data.id_cessionnaire_fournisseur : null,
        date_cession: data.date_cession,
        motif: data.motif,
      };

      await lettreCreditService.ceder(payload);
      notification.success('Transfert effectué avec succès');
      navigate(`/lettres-credit/${id}`);
    } catch (err) {
      console.error(err);
      notification.error(err?.message || 'Erreur lors du transfert');
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/lettres-credit/${id}`)}>
          Annuler
        </Button>
        <Typography variant="h4" component="h1">
          Céder la Lettre de Crédit
        </Typography>
      </Stack>

      <Paper sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CessionLCForm 
            register={register} 
            errors={errors} 
            watch={watch} 
            setValue={setValue} 
            lc={lc} 
          />
          
          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button onClick={() => navigate(`/lettres-credit/${id}`)}>
              Annuler
            </Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
              disabled={isSubmitting}
            >
              Confirmer le transfert
            </Button>
          </Box>
        </form>
      </Paper>
    </Box>
  );
}

export default CederLCPage;
