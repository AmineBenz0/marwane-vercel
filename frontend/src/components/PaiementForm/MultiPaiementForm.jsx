import DateField from '../../utils/DateField';
import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  MenuItem,
  Typography,
  IconButton,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Collapse,
  Grid,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { formatMontant } from '../../utils/formatNumber';
import { format } from 'date-fns';
import PropTypes from 'prop-types';

const TYPES_PAIEMENT = [
  { value: 'cash', label: '💵 Espèces' },
  { value: 'cheque', label: '💳 Chèque' },
  { value: 'virement', label: '🏦 Virement' },
  { value: 'carte', label: '💳 Carte' },
  { value: 'compensation', label: '↔️ Compensation' },
  { value: 'lc', label: '📜 LC' },
  { value: 'autre', label: '📄 Autre' },
];

/**
 * MultiPaiementForm - Formulaire pour saisir plusieurs paiements d'un coup.
 */
function MultiPaiementForm({ transaction, fields, append, remove, register, errors, watch, setValue, availableLcs, loadingLcs }) {
  const watchedFields = watch('paiements');
  const [expandedRows, setExpandedRows] = useState({});

  const toggleExpand = (index) => {
    setExpandedRows(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const totalSaisi = watchedFields?.reduce((sum, item) => sum + (parseFloat(item.montant) || 0), 0) || 0;
  const montantRestant = transaction?.montant_restant || 0;
  const difference = montantRestant - totalSaisi;

  // Si c'est vide au début, ajouter une ligne
  useEffect(() => {
    if (fields.length === 0) {
      append({
        date_paiement: format(new Date(), 'yyyy-MM-dd'),
        montant: montantRestant > 0 ? montantRestant : 0,
        type_paiement: 'cash',
        statut_cheque: 'a_encaisser'
      });
    }
  }, [fields.length, append, montantRestant]);

  // Gérer le changement de LC
  const handleLcChange = (index, lcId) => {
    const selectedId = lcId === '' ? null : Number(lcId);
    setValue(`paiements.${index}.id_lc`, selectedId, { shouldDirty: true, shouldValidate: true });
    const selectedLc = availableLcs.find(l => Number(l.id_lc) === selectedId);
    if (selectedLc) {
      setValue(`paiements.${index}.montant`, Number(selectedLc.montant), { shouldDirty: true, shouldValidate: true });
    }
  };

  return (
    <Box>
      <Alert severity={difference < 0 ? "warning" : "info"} sx={{ mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Total à régler</Typography>
            <Typography variant="h6">{formatMontant(montantRestant)}</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Total saisi</Typography>
            <Typography variant="h6" color="primary">{formatMontant(totalSaisi)}</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Reste</Typography>
            <Typography variant="h6" color={difference < 0 ? "warning.main" : "text.primary"}>
              {formatMontant(difference)}
            </Typography>
          </Grid>
        </Grid>
      </Alert>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell width="50"></TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Montant (MAD)</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {fields.map((item, index) => {
              const type = watch(`paiements.${index}.type_paiement`);
              // Register even while details are collapsed so a missing LC blocks submission.
              const lcRegistration = register(`paiements.${index}.id_lc`, {
                validate: (value) => type !== 'lc' || (
                  Number(value) > 0 && availableLcs.some(l => Number(l.id_lc) === Number(value))
                ) || 'Veuillez sélectionner une LC disponible',
              });
              return (
                <React.Fragment key={item.id}>
                  <TableRow sx={{ '& > *': { borderBottom: 'unset !important' } }}>
                    <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => toggleExpand(index)}
                          aria-label={`${expandedRows[index] ? 'Réduire' : 'Développer'} le paiement ${index + 1}`}
                        >
                        {expandedRows[index] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <DateField
                        {...register(`paiements.${index}.date_paiement`, {
                          required: 'La date du paiement est requise',
                          validate: (value) => !transaction?.date_transaction || value >= transaction.date_transaction || 'La date du paiement ne peut pas être antérieure à la transaction',
                        })}

                        size="small"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        error={!!errors?.paiements?.[index]?.date_paiement}
                        helperText={errors?.paiements?.[index]?.date_paiement?.message}
                        inputProps={{ 'aria-label': `Date du paiement ${index + 1}` }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        {...register(`paiements.${index}.type_paiement`)}
                        value={type || 'cash'}
                        select
                        size="small"
                        fullWidth
                        error={!!errors?.paiements?.[index]?.type_paiement || !!errors?.paiements?.[index]?.id_lc}
                        helperText={errors?.paiements?.[index]?.id_lc?.message}
                      >
                        {TYPES_PAIEMENT.map(t => (
                          <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell>
                      <TextField
                        {...register(`paiements.${index}.montant`, {
                          valueAsNumber: true,
                          required: 'Le montant est requis',
                          validate: (value) => Number.isFinite(value) && value > 0 || 'Le montant doit être supérieur à 0',
                        })}
                        type="number"
                        size="small"
                        fullWidth
                        inputProps={{ step: '0.01', min: '0.01', 'aria-label': `Montant du paiement ${index + 1}` }}
                        error={!!errors?.paiements?.[index]?.montant}
                        helperText={errors?.paiements?.[index]?.montant?.message}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton 
                        color="error" 
                        size="small" 
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                        aria-label={`Supprimer le paiement ${index + 1}`}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                  
                  {/* Ligne de détails expansible */}
                  <TableRow>
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                      <Collapse in={expandedRows[index]} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, mb: 1 }}>
                          <Grid container spacing={2}>
                            {/* Détails Chèque */}
                            {type === 'cheque' && (
                              <>
                                <Grid item xs={12} sm={4}>
                                  <TextField
                                    {...register(`paiements.${index}.numero_cheque`)}
                                    label="N° Chèque"
                                    size="small"
                                    fullWidth
                                  />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                  <TextField
                                    {...register(`paiements.${index}.banque`)}
                                    label="Banque"
                                    size="small"
                                    fullWidth
                                  />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                  <DateField
                                    {...register(`paiements.${index}.date_encaissement_prevue`)}
                                    label="Échéance"

                                    size="small"
                                    fullWidth
                                    InputLabelProps={{ shrink: true }}
                                  />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                  <TextField
                                    {...register(`paiements.${index}.statut_cheque`)}
                                    select
                                    label="Statut"
                                    size="small"
                                    fullWidth
                                    defaultValue="a_encaisser"
                                  >
                                    <MenuItem value="emis">Émis</MenuItem>
                                    <MenuItem value="a_encaisser">À encaisser</MenuItem>
                                    <MenuItem value="encaisse">Encaissé</MenuItem>
                                  </TextField>
                                </Grid>
                              </>
                            )}

                            {/* Détails Virement */}
                            {type === 'virement' && (
                              <Grid item xs={12} sm={6}>
                                <TextField
                                  {...register(`paiements.${index}.reference_virement`)}
                                  label="Référence Virement"
                                  size="small"
                                  fullWidth
                                />
                              </Grid>
                            )}

                            {/* Détails LC */}
                            {type === 'lc' && (
                              <Grid item xs={12} sm={6}>
                                <TextField
                                  {...lcRegistration}
                                  value={watch(`paiements.${index}.id_lc`) || ''}
                                  select
                                  label="Lettre de Crédit"
                                  size="small"
                                  fullWidth
                                  onChange={(e) => handleLcChange(index, e.target.value)}
                                  error={!!errors?.paiements?.[index]?.id_lc}
                                  helperText={errors?.paiements?.[index]?.id_lc?.message || (availableLcs.length === 0 && !loadingLcs ? 'Aucune LC disponible pour ce partenaire' : '')}
                                  disabled={loadingLcs}
                                >
                                  {availableLcs.map((l) => (
                                    <MenuItem key={l.id_lc} value={l.id_lc}>
                                      {l.numero_reference} ({formatMontant(l.montant)})
                                    </MenuItem>
                                  ))}
                                </TextField>
                              </Grid>
                            )}

                            {/* Notes */}
                            <Grid item xs={12}>
                              <TextField
                                {...register(`paiements.${index}.notes`)}
                                label="Notes"
                                size="small"
                                fullWidth
                                multiline
                                rows={1}
                              />
                            </Grid>
                          </Grid>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
        <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'center' }}>
          <Button 
            startIcon={<AddIcon />} 
            variant="outlined" 
            size="small"
            onClick={() => append({
              date_paiement: format(new Date(), 'yyyy-MM-dd'),
              montant: difference > 0 ? difference : 0,
              type_paiement: 'cash',
              statut_cheque: 'a_encaisser'
            })}
          >
            Ajouter une ligne de paiement
          </Button>
        </Box>
      </TableContainer>
    </Box>
  );
}

const paymentFieldPropType = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
});

const paymentErrorPropType = PropTypes.shape({
  date_paiement: PropTypes.object,
  type_paiement: PropTypes.object,
  montant: PropTypes.object,
  id_lc: PropTypes.object,
});

MultiPaiementForm.propTypes = {
  transaction: PropTypes.shape({
    montant_restant: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }),
  fields: PropTypes.arrayOf(paymentFieldPropType).isRequired,
  append: PropTypes.func.isRequired,
  remove: PropTypes.func.isRequired,
  register: PropTypes.func.isRequired,
  errors: PropTypes.shape({
    paiements: PropTypes.arrayOf(paymentErrorPropType),
  }).isRequired,
  watch: PropTypes.func.isRequired,
  setValue: PropTypes.func.isRequired,
  availableLcs: PropTypes.arrayOf(PropTypes.shape({
    id_lc: PropTypes.number,
    numero_reference: PropTypes.string,
    montant: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  })).isRequired,
  loadingLcs: PropTypes.bool.isRequired,
};

export default MultiPaiementForm;
