/**
 * Formulaire d'ajout de paiement pour une transaction.
 * 
 * Permet de créer un paiement avec :
 * - Montant et date
 * - Type de paiement (cash, chèque, virement, carte, etc.)
 * - Informations spécifiques selon le type (chèque, virement)
 * - Validation du montant (ne doit pas dépasser le montant restant)
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  MenuItem,
  Typography,
  Alert,
  Grid,
  Collapse,
} from '@mui/material';
import { formatMontant } from '../../utils/formatNumber';

/**
 * Types de paiement disponibles.
 */
const TYPES_PAIEMENT = [
  { value: 'cash', label: '💵 Espèces' },
  { value: 'cheque', label: '💳 Chèque' },
  { value: 'virement', label: '🏦 Virement' },
  { value: 'carte', label: '💳 Carte bancaire' },
  { value: 'traite', label: '📝 Traite' },
  { value: 'compensation', label: '↔️ Compensation' },
  { value: 'lc', label: '📜 Lettre de Crédit' },
  { value: 'autre', label: '📄 Autre' },
];

/**
 * Composant PaiementForm.
 * 
 * @param {Object} props
 * @param {Object} props.defaultValues - Valeurs par défaut du formulaire
 * @param {Object} props.transaction - Transaction associée (pour connaître le montant restant)
 * @param {Function} props.register - Fonction register de react-hook-form
 * @param {Object} props.errors - Erreurs de validation de react-hook-form
 * @param {Function} props.watch - Fonction watch de react-hook-form
 * @param {Function} props.setValue - Fonction setValue de react-hook-form
 */
function PaiementForm({ defaultValues, transaction, register, errors, watch, setValue }) {
  const typePaiement = watch('type_paiement');
  const montant = watch('montant');
  const selectedLcId = watch('id_lc');
  const [initialMontantSet, setInitialMontantSet] = useState(false);
  const [availableLcs, setAvailableLcs] = useState([]);
  const [loadingLcs, setLoadingLcs] = useState(false);
  
  // Calculer le montant restant côté frontend (si transaction fournie)
  const montantRestant = transaction?.montant_restant || 0;
  const montantRestantApres = montantRestant - (parseFloat(montant) || 0);

  // Mettre le montant par défaut au montant restant (une seule fois)
  useEffect(() => {
    if (!initialMontantSet && defaultValues?.montant === undefined && montantRestant > 0) {
      setValue('montant', montantRestant);
      setInitialMontantSet(true);
    }
  }, []);

  // Charger les LC disponibles quand le type est LC
  useEffect(() => {
    if (typePaiement === 'lc') {
      const fetchLcs = async () => {
        setLoadingLcs(true);
        try {
          const { get } = await import('../../services/api');
          const params = {};
          if (transaction?.id_client) params.id_client = transaction.id_client;
          if (transaction?.id_fournisseur) params.id_fournisseur = transaction.id_fournisseur;
          
          const data = await get('/lettres-credit/disponibles', { params });
          setAvailableLcs(data || []);
        } catch (err) {
          console.error('Erreur chargement LC:', err);
        } finally {
          setLoadingLcs(false);
        }
      };
      fetchLcs();
    }
  }, [typePaiement, transaction]);

  // Si une LC est sélectionnée, mettre à jour le montant
  useEffect(() => {
    if (typePaiement === 'lc' && selectedLcId) {
      const selectedLc = availableLcs.find(l => l.id_lc === selectedLcId);
      if (selectedLc) {
        setValue('montant', parseFloat(selectedLc.montant));
      }
    }
  }, [selectedLcId, availableLcs, typePaiement, setValue]);

  return (
    <Box>
      {/* Alerte montant restant */}
      {transaction && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>Montant restant à payer : </strong>
            {formatMontant(montantRestant)}
          </Typography>
          {montant > 0 && (
            <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
              Après ce paiement : {formatMontant(Math.max(0, montantRestantApres))}
            </Typography>
          )}
        </Alert>
      )}

      <Grid container spacing={2}>
        {/* Date du paiement */}
        <Grid item xs={12} sm={6}>
          <TextField
            {...register('date_paiement')}
            label="Date du paiement"
            type="date"
            fullWidth
            required
            error={!!errors.date_paiement}
            helperText={errors.date_paiement?.message}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>

        {/* Montant */}
        <Grid item xs={12} sm={6}>
          <TextField
            {...register('montant', { 
              valueAsNumber: true,
              validate: (value) => {
                if (!value || value <= 0) return 'Le montant doit être supérieur à 0';
                if (transaction && value > transaction.montant_restant) {
                  return `Le montant ne peut pas dépasser ${formatMontant(transaction.montant_restant)}`;
                }
                return true;
              }
            })}
            label="Montant (MAD)"
            type="number"
            fullWidth
            required
            error={!!errors.montant}
            helperText={errors.montant?.message || 'Montant en dirhams'}
            inputProps={{ 
              step: '0.01',
              min: '0.01',
            }}
          />
        </Grid>

        {/* Type de paiement */}
        <Grid item xs={12}>
          <TextField
            {...register('type_paiement')}
            select
            label="Type de paiement"
            fullWidth
            required
            error={!!errors.type_paiement}
            helperText={errors.type_paiement?.message}
          >
            {TYPES_PAIEMENT.map((type) => (
              <MenuItem key={type.value} value={type.value}>
                {type.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        {/* Champs spécifiques pour les chèques */}
        <Collapse in={typePaiement === 'cheque'} sx={{ width: '100%' }}>
          <Grid container spacing={2} sx={{ mt: 0.5, px: 2 }}>
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                📋 Informations du chèque
              </Typography>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                {...register('numero_cheque')}
                label="Numéro du chèque"
                fullWidth
                error={!!errors.numero_cheque}
                helperText={errors.numero_cheque?.message}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                {...register('banque')}
                label="Banque"
                fullWidth
                error={!!errors.banque}
                helperText={errors.banque?.message}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                {...register('date_encaissement_prevue')}
                label="Date d'encaissement prévue"
                type="date"
                fullWidth
                error={!!errors.date_encaissement_prevue}
                helperText={errors.date_encaissement_prevue?.message}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                {...register('statut_cheque')}
                select
                label="Statut du chèque"
                fullWidth
                defaultValue="a_encaisser"
                error={!!errors.statut_cheque}
                helperText={errors.statut_cheque?.message}
              >
                <MenuItem value="emis">Émis</MenuItem>
                <MenuItem value="a_encaisser">À encaisser</MenuItem>
                <MenuItem value="encaisse">Encaissé</MenuItem>
                <MenuItem value="rejete">Rejeté</MenuItem>
                <MenuItem value="annule">Annulé</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </Collapse>

        {/* Champs spécifiques pour les virements */}
        <Collapse in={typePaiement === 'virement'} sx={{ width: '100%' }}>
          <Grid container spacing={2} sx={{ mt: 0.5, px: 2 }}>
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                🏦 Informations du virement
              </Typography>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                {...register('reference_virement')}
                label="Référence du virement"
                fullWidth
                error={!!errors.reference_virement}
                helperText={errors.reference_virement?.message || 'Ex: VIR-2025-001234'}
              />
            </Grid>
          </Grid>
        </Collapse>

        {/* Champs spécifiques pour les Lettres de Crédit (LC) */}
        <Collapse in={typePaiement === 'lc'} sx={{ width: '100%' }}>
          <Grid container spacing={2} sx={{ mt: 0.5, px: 2 }}>
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                📜 Sélection de la Lettre de Crédit
              </Typography>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                {...register('id_lc', {
                  required: typePaiement === 'lc' ? 'Veuillez sélectionner une LC' : false
                })}
                select
                label="Choisir une Lettre de Crédit"
                fullWidth
                error={!!errors.id_lc}
                helperText={errors.id_lc?.message || (availableLcs.length === 0 && !loadingLcs ? 'Aucune LC disponible pour ce partenaire' : '')}
                disabled={loadingLcs}
              >
                {availableLcs.map((l) => (
                  <MenuItem key={l.id_lc} value={l.id_lc}>
                    {l.numero_reference} - {l.banque_emettrice} ({formatMontant(l.montant)})
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            
            {selectedLcId && (
              <Grid item xs={12}>
                <Alert severity="warning">
                  Une Lettre de Crédit doit être utilisée en totalité pour le paiement.
                </Alert>
              </Grid>
            )}
          </Grid>
        </Collapse>

        {/* Notes */}
        <Grid item xs={12}>
          <TextField
            {...register('notes')}
            label="Notes (optionnel)"
            fullWidth
            multiline
            rows={3}
            error={!!errors.notes}
            helperText={errors.notes?.message || 'Ajoutez des notes ou commentaires'}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

export default PaiementForm;

