import DateField from '../../utils/DateField';
import React, { useState, useEffect, useId, useRef } from 'react';
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
  Checkbox,
  FormControlLabel,
  useMediaQuery,
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
import { get } from '../../services/api';
import { DECIMAL_INPUT_PROPS } from '../../utils/decimalInput';

// Exact amounts: a compact "100 M MAD" would hide the figure being confirmed.
const money = (value) => formatMontant(value, { useCompactNotation: false, minimumFractionDigits: 2 });

const TYPES_PAIEMENT = [
  { value: 'cash', label: 'Espèces' },
  { value: 'cheque', label: 'Chèque' },
  { value: 'virement', label: 'Virement' },
  { value: 'lc', label: 'Lettre de crédit' },
];

/**
 * MultiPaiementForm - Formulaire pour saisir plusieurs paiements d'un coup.
 */
function MultiPaiementForm({ transaction, fields, append, remove, register, errors, watch, setValue, availableLcs, loadingLcs, supplierSource = null }) {
  const watchedFields = watch('paiements');
  // Phones get one stacked card per payment instead of a five-column table.
  const isPhone = useMediaQuery('(max-width: 599.95px)');
  const detailsId = useId();
  const [expandedRows, setExpandedRows] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [accountError, setAccountError] = useState('');

  useEffect(() => {
    (watchedFields || []).forEach((payment, index) => {
      if (payment.type_paiement !== 'lc') return;
      const lc = availableLcs.find(row => Number(row.id_lc) === Number(payment.id_lc));
      const amount = lc ? Number(lc.montant) : '';
      const differs = lc ? Number(payment.montant) !== amount
        : payment.montant !== '' && !Number.isNaN(payment.montant);
      if (differs) setValue(`paiements.${index}.montant`, amount);
    });
  }, [watchedFields, availableLcs, setValue]);

  useEffect(() => {
    if (supplierSource !== 'banque') return;
    let active = true;
    setAccountError('');
    get('/comptes-bancaires').then((data) => {
      if (active) setAccounts(data || []);
    }).catch(() => {
      if (active) setAccountError('Impossible de charger les comptes bancaires. Réessayez avant de régler ce fournisseur.');
    });
    return () => { active = false; };
  }, [supplierSource]);

  useEffect(() => {
    if (!supplierSource) return;
    (watchedFields || []).forEach((payment, index) => {
      if (payment.source_reglement !== supplierSource) {
        setValue(`paiements.${index}.source_reglement`, supplierSource);
      }
      if (supplierSource === 'banque' && !payment.id_compte && accounts.length === 1) {
        setValue(`paiements.${index}.id_compte`, accounts[0].id_compte);
      }
      if (supplierSource === 'caisse' && payment.id_compte) {
        setValue(`paiements.${index}.id_compte`, null);
      }
    });
  }, [watchedFields, supplierSource, accounts, setValue]);

  const toggleExpand = (index) => {
    setExpandedRows(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const totalSaisi = watchedFields?.reduce((sum, item) => sum + (parseFloat(item.montant) || 0), 0) || 0;
  // Owed: uncashed cheques already handed over are not owed any more.
  const montantRestant = Number(transaction?.montant_du ?? transaction?.montant_restant ?? 0);
  const difference = montantRestant - totalSaisi;
  // Half a centime of tolerance so rounding never shows as an overpayment.
  const overpaid = difference < -0.005;
  const settled = Math.abs(difference) <= 0.005;
  // A row is unfilled while it has no amount, no LC chosen, or no bank account for a bank payment.
  const unfilled = (watchedFields || []).some((payment) => !(Number(payment?.montant) > 0)
    || (payment?.type_paiement === 'lc' && !payment?.id_lc)
    || (supplierSource === 'banque' && !payment?.id_compte));
  const nothingLeft = difference <= 0.005;
  // An overpayment needs an explicit tick; one larger than the whole transaction is a typo
  // (an extra zero), and an advance belongs in « Avances et crédits ».
  const overpaidBy = Math.max(0, -difference);
  const overpayLimit = Math.max(Number(transaction?.montant_total) || 0, montantRestant);
  const overpayBlocked = overpaid && overpaidBy > overpayLimit + 0.005;
  const creditText = transaction?.id_fournisseur && !transaction?.id_client
    ? `vous aurez un crédit de ${money(overpaidBy)} chez le fournisseur`
    : `le client aura un crédit de ${money(overpaidBy)}`;
  const overpayRegistration = register('confirmer_trop_paye', {
    validate: (checked) => {
      if (!overpaid) return true;
      if (overpayBlocked) return 'Montant trop élevé : vérifiez le montant saisi.';
      return checked === true || 'Cochez la case pour confirmer ce trop-payé.';
    },
  });
  const overpayError = errors?.confirmer_trop_paye?.message;
  // A confirmation is for one amount: changing the amounts asks again.
  const overpaidCents = Math.round(overpaidBy * 100);
  useEffect(() => {
    setValue('confirmer_trop_paye', false);
  }, [overpaidCents, setValue]);
  const addBlockedReason = unfilled ? 'Complétez d’abord le paiement en cours.'
    : nothingLeft ? 'Le montant dû est déjà couvert.' : '';

  // Si c'est vide au début, ajouter une ligne (une seule fois : en développement,
  // React StrictMode exécute les effets deux fois et ajoutait deux lignes).
  const initialRowAdded = useRef(false);
  useEffect(() => {
    // Once a row exists, allow adding one again if the user later removes them all.
    if (fields.length > 0) {
      initialRowAdded.current = false;
      return;
    }
    if (!initialRowAdded.current) {
      initialRowAdded.current = true;
      append({
        date_paiement: format(new Date(), 'yyyy-MM-dd'),
        montant: montantRestant > 0 ? montantRestant : 0,
        type_paiement: supplierSource === 'banque' ? 'virement' : 'cash',
        statut_cheque: 'a_encaisser'
      });
    }
  }, [fields.length, append, montantRestant, supplierSource]);

  // Gérer le changement de LC
  const handleLcChange = (index, lcId) => {
    const selectedId = lcId === '' ? null : Number(lcId);
    setValue(`paiements.${index}.id_lc`, selectedId, { shouldDirty: true, shouldValidate: true });
    const selectedLc = availableLcs.find(l => Number(l.id_lc) === selectedId);
    setValue(`paiements.${index}.montant`, selectedLc ? Number(selectedLc.montant) : '', { shouldDirty: true, shouldValidate: true });
  };

  return (
    <Box>
      {supplierSource && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Source débitée : {supplierSource === 'banque' ? 'compte bancaire' : 'caisse'}.
          Le type de paiement peut être choisi indépendamment.
        </Alert>
      )}
      {accountError && <Alert severity="error" sx={{ mb: 2 }}>{accountError}</Alert>}
      <Alert icon={false} severity={overpaid ? 'warning' : 'info'} sx={{ mb: 3, '& .MuiAlert-message': { width: '100%' } }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Montant dû</Typography>
            <Typography variant="h6">{money(montantRestant)}</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Ce paiement</Typography>
            <Typography variant="h6" color="primary">{money(totalSaisi)}</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            {/* Never show a negative "reste": an overpayment is named as such. */}
            <Typography variant="caption" color="text.secondary">{overpaid ? 'Trop payé' : 'Reste après ce paiement'}</Typography>
            <Typography variant="h6" color={overpaid ? 'warning.dark' : settled ? 'success.main' : 'text.primary'}>
              {money(Math.abs(difference))}
            </Typography>
          </Grid>
        </Grid>
        {overpaid && overpayBlocked && (
          <Typography variant="body2" color="error.main" fontWeight={600} sx={{ mt: 1 }} role="alert">
            Ce paiement dépasse le montant dû de {money(overpaidBy)}, plus que le montant de la transaction.
            Vérifiez le montant (un zéro en trop ?). Pour une avance, utilisez « Avances et crédits ».
          </Typography>
        )}
        {overpaid && !overpayBlocked && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2">Ce paiement dépasse le montant dû de {money(overpaidBy)}.</Typography>
            <FormControlLabel
              sx={{ mt: 0.5, alignItems: 'flex-start', '& .MuiCheckbox-root': { pt: 0.25 } }}
              control={<Checkbox size="small" {...overpayRegistration} checked={Boolean(watch('confirmer_trop_paye'))}
                onChange={(event) => setValue('confirmer_trop_paye', event.target.checked, { shouldValidate: true })} />}
              label={`Je confirme ce trop-payé : ${creditText}.`}
            />
            {overpayError && <Typography variant="caption" color="error.main" display="block" role="alert">{overpayError}</Typography>}
          </Box>
        )}
      </Alert>

      <TableContainer component={Paper} variant="outlined" sx={{
        '@media (max-width: 599.95px)': {
          '& thead': { display: 'none' },
          '& table, & tbody': { display: 'block' },
          '& tr.payment-row': {
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gridTemplateAreas: '"amount remove" "date date" "mode mode" "more more"',
            gap: 1.5,
            p: 1.5,
            borderTop: '1px solid',
            borderColor: 'divider',
          },
          '& tr.payment-row:first-of-type': { borderTop: 0 },
          '& tr.payment-row > td': { display: 'block', p: 0, border: 0, minWidth: 0 },
          '& tr.payment-row > td:nth-of-type(1)': { gridArea: 'more' },
          '& tr.payment-row > td:nth-of-type(2)': { gridArea: 'date' },
          '& tr.payment-row > td:nth-of-type(3)': { gridArea: 'mode' },
          '& tr.payment-row > td:nth-of-type(4)': { gridArea: 'amount' },
          '& tr.payment-row > td:nth-of-type(5)': { gridArea: 'remove', alignSelf: 'center' },
          '& tr.payment-details, & tr.payment-details > td': { display: 'block' },
          '& tr.payment-details > td': { px: 1.5 },
        },
      }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell width="50"></TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Mode de paiement</TableCell>
              <TableCell>Montant (MAD)</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {fields.map((item, index) => {
              const type = watch(`paiements.${index}.type_paiement`);
              const typeRegistration = register(`paiements.${index}.type_paiement`);
              // Register even while details are collapsed so a missing LC blocks submission.
              const lcRegistration = register(`paiements.${index}.id_lc`, {
                validate: (value) => type !== 'lc' || (
                  Number(value) > 0 && availableLcs.some(l => Number(l.id_lc) === Number(value))
                ) || 'Veuillez sélectionner une LC disponible',
              });
              return (
                <React.Fragment key={item.id}>
                  <TableRow className="payment-row" sx={{ '& > *': { borderBottom: 'unset !important' } }}>
                    <TableCell>
                      {isPhone ? (
                        <Button
                          size="small"
                          onClick={() => toggleExpand(index)}
                          aria-expanded={Boolean(expandedRows[index])}
                          aria-controls={`${detailsId}-${item.id}`}
                          startIcon={expandedRows[index] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          sx={{ textTransform: 'none', px: 0.5 }}
                        >
                          {expandedRows[index] ? 'Masquer les détails' : 'Détails (chèque, virement, notes)'}
                        </Button>
                      ) : (
                        <IconButton
                          size="small"
                          onClick={() => toggleExpand(index)}
                          aria-expanded={Boolean(expandedRows[index])}
                          aria-controls={`${detailsId}-${item.id}`}
                          aria-label={`${expandedRows[index] ? 'Réduire' : 'Développer'} le paiement ${index + 1}`}
                        >
                        {expandedRows[index] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                      )}
                    </TableCell>
                    <TableCell>
                      <DateField
                        {...register(`paiements.${index}.date_paiement`, {
                          required: 'La date du paiement est requise',
                          validate: (value) => !transaction?.date_transaction || value >= transaction.date_transaction || 'La date du paiement ne peut pas être antérieure à la transaction',
                        })}

                        label={isPhone ? 'Date du paiement' : undefined}
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
                        {...typeRegistration}
                        onChange={event => {
                          typeRegistration.onChange(event);
                          setValue(`paiements.${index}.id_lc`, null);
                          if (event.target.value === 'lc') setValue(`paiements.${index}.montant`, '');
                        }}
                        value={type || 'cash'}
                        select
                        label={isPhone ? 'Mode de paiement' : undefined}
                        size="small"
                        fullWidth
                        error={!!errors?.paiements?.[index]?.type_paiement}
                      >
                        {TYPES_PAIEMENT.map(t => (
                          <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                        ))}
                      </TextField>
                      {supplierSource === 'banque' && (
                        <TextField
                          {...register(`paiements.${index}.id_compte`, {
                            validate: (value) => Number(value) > 0 || 'Sélectionnez le compte bancaire à débiter',
                          })}
                          select
                          label="Compte bancaire à débiter"
                          value={watch(`paiements.${index}.id_compte`) || ''}
                          onChange={(event) => setValue(`paiements.${index}.id_compte`, Number(event.target.value), { shouldDirty: true, shouldValidate: true })}
                          size="small"
                          fullWidth
                          required
                          sx={{ mt: 1 }}
                          error={!!errors?.paiements?.[index]?.id_compte}
                          helperText={errors?.paiements?.[index]?.id_compte?.message || (accounts.length ? '' : 'Aucun compte bancaire configuré')}
                        >
                          {accounts.map((account) => (
                            <MenuItem key={account.id_compte} value={account.id_compte}>
                              {account.nom_banque} · {account.numero_compte}
                            </MenuItem>
                          ))}
                        </TextField>
                      )}
                    </TableCell>
                    <TableCell>
                      {type === 'lc' ? <>
                      <input type="hidden" {...register(`paiements.${index}.montant`, { valueAsNumber: true, validate: value => Number.isFinite(value) && value > 0 || 'Le montant doit être supérieur à 0' })} />
                      <TextField
                        {...lcRegistration}
                        select
                        label={isPhone ? 'Lettre de crédit' : undefined}
                        value={watch(`paiements.${index}.id_lc`) || ''}
                        onChange={(event) => handleLcChange(index, event.target.value)}
                        size="small"
                        fullWidth
                        SelectProps={{ displayEmpty: true, inputProps: { 'aria-label': `Lettre de crédit du paiement ${index + 1}` }, renderValue: value => {
                          const selected = availableLcs.find(lc => Number(lc.id_lc) === Number(value));
                          return selected ? `${selected.numero_reference} (${money(selected.montant)})` : 'Sélectionnez une LC';
                        } }}
                        disabled={loadingLcs}
                        error={!!errors?.paiements?.[index]?.id_lc}
                        helperText={errors?.paiements?.[index]?.id_lc?.message || ''}
                      >
                        {availableLcs.map(lc => <MenuItem key={lc.id_lc} value={lc.id_lc}>{lc.numero_reference} ({money(lc.montant)})</MenuItem>)}
                      </TextField>
                      </> : <TextField
                        {...register(`paiements.${index}.montant`, {
                          valueAsNumber: true,
                          required: 'Le montant est requis',
                          validate: (value) => Number.isFinite(value) && value > 0 || 'Le montant doit être supérieur à 0',
                        })}
                        type="text"
                        label={isPhone ? 'Montant (MAD)' : undefined}
                        size="small"
                        fullWidth
                        inputProps={{ ...DECIMAL_INPUT_PROPS, step: '0.01', min: '0.01', 'aria-label': `Montant du paiement ${index + 1}` }}
                        error={!!errors?.paiements?.[index]?.montant}
                        helperText={errors?.paiements?.[index]?.montant?.message}
                      />}
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
                  <TableRow className="payment-details">
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                      <Collapse in={expandedRows[index]} timeout="auto" unmountOnExit>
                        <Box id={`${detailsId}-${item.id}`} role="region" aria-label={`Détails du paiement ${index + 1}`} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1.5, mb: 1.5 }}>
                          <Typography variant="body2" fontWeight={700} sx={{ mb: 2 }}>Détails du paiement</Typography>
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
        <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          <Button
            startIcon={<AddIcon />}
            variant="outlined"
            size="small"
            disabled={Boolean(addBlockedReason)}
            aria-describedby={addBlockedReason ? `${detailsId}-add-hint` : undefined}
            onClick={() => append({
              date_paiement: format(new Date(), 'yyyy-MM-dd'),
              montant: Math.round(difference * 100) / 100,
              type_paiement: supplierSource === 'banque' ? 'virement' : 'cash',
              statut_cheque: 'a_encaisser'
            })}
          >
            Ajouter un autre paiement
          </Button>
          {addBlockedReason && (
            <Typography id={`${detailsId}-add-hint`} variant="caption" color="text.secondary">
              {addBlockedReason}
            </Typography>
          )}
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
  id_compte: PropTypes.object,
});

MultiPaiementForm.propTypes = {
  supplierSource: PropTypes.oneOf(['caisse', 'banque']),
  transaction: PropTypes.shape({
    montant_restant: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    montant_du: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
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

