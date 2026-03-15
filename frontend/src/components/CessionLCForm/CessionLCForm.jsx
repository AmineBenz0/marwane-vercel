import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  MenuItem,
  Typography,
  Grid,
  Divider,
  Alert,
  CircularProgress,
} from '@mui/material';
import { get } from '../../services/api';

/**
 * Formulaire de cession d'une Lettre de Crédit.
 */
function CessionLCForm({ register, errors, watch, setValue, lc }) {
  const [clients, setClients] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [loading, setLoading] = useState(false);

  const typeCessionnaire = watch('type_cessionnaire');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [clientsData, fournisseursData] = await Promise.all([
          get('/clients', { params: { limit: 1000, est_actif: true } }),
          get('/fournisseurs', { params: { limit: 1000, est_actif: true } }),
        ]);
        setClients(clientsData || []);
        setFournisseurs(fournisseursData || []);
      } catch (err) {
        console.error('Erreur chargement tiers:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <Box>
      {lc && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Vous transférez la LC <strong>{lc.numero_reference}</strong> d'un montant de <strong>{lc.montant} MAD</strong>.
          <br />
          Le détenteur actuel est : <strong>{lc.detenteur_nom}</strong>.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Typography variant="subtitle2" gutterBottom>Nouveau Détenteur (Cessionnaire)</Typography>
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            {...register('type_cessionnaire', { required: 'Ce champ est requis' })}
            select
            label="Type de destinataire"
            fullWidth
            error={!!errors.type_cessionnaire}
            helperText={errors.type_cessionnaire?.message}
          >
            <MenuItem value="client">Client</MenuItem>
            <MenuItem value="fournisseur">Fournisseur</MenuItem>
          </TextField>
        </Grid>

        <Grid item xs={12} sm={6}>
          {typeCessionnaire === 'client' ? (
            <TextField
              {...register('id_cessionnaire_client', { 
                required: typeCessionnaire === 'client' ? 'Veuillez choisir un client' : false 
              })}
              select
              label="Sélectionner le Client"
              fullWidth
              error={!!errors.id_cessionnaire_client}
              helperText={errors.id_cessionnaire_client?.message}
              disabled={loading}
            >
              <MenuItem value=""><em>-- Choisir --</em></MenuItem>
              {clients.map((c) => (
                <MenuItem key={c.id_client} value={c.id_client}>{c.nom_client}</MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              {...register('id_cessionnaire_fournisseur', { 
                required: typeCessionnaire === 'fournisseur' ? 'Veuillez choisir un fournisseur' : false 
              })}
              select
              label="Sélectionner le Fournisseur"
              fullWidth
              error={!!errors.id_cessionnaire_fournisseur}
              helperText={errors.id_cessionnaire_fournisseur?.message}
              disabled={loading}
            >
              <MenuItem value=""><em>-- Choisir --</em></MenuItem>
              {fournisseurs.map((f) => (
                <MenuItem key={f.id_fournisseur} value={f.id_fournisseur}>{f.nom_fournisseur}</MenuItem>
              ))}
            </TextField>
          )}
        </Grid>

        <Grid item xs={12}>
          <Divider sx={{ my: 1 }} />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            {...register('date_cession', { required: 'Ce champ est requis' })}
            label="Date de transfert"
            type="date"
            fullWidth
            InputLabelProps={{ shrink: true }}
            error={!!errors.date_cession}
            helperText={errors.date_cession?.message}
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            {...register('motif')}
            label="Motif du transfert (Optionnel)"
            fullWidth
            multiline
            rows={2}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

export default CessionLCForm;
