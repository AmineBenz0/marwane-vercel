/**
 * Composant TransactionForm.
 * 
 * Formulaire complexe pour créer et éditer des transactions avec :
 * - Date transaction
 * - Sélection Client OU Fournisseur (radio buttons)
 * - Liste de lignes dynamique (produit + quantité + prix unitaire)
 * - Calcul automatique du montant total
 * - Validation complète
 * 
 * @param {boolean} open - Contrôle l'ouverture/fermeture de la modal
 * @param {Function} onClose - Callback appelé lors de la fermeture de la modal
 * @param {Function} onSubmit - Callback appelé lors de la soumission du formulaire (reçoit les données validées)
 * @param {object} initialValues - Valeurs initiales pour le formulaire (pour l'édition)
 * @param {boolean} loading - Indique si la soumission est en cours
 * @param {string} errorMessage - Message d'erreur serveur à afficher
 */

import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Alert,
  CircularProgress,
  Typography,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormHelperText,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Select,
  MenuItem,
  InputLabel,
} from '@mui/material';
import { Close as CloseIcon, Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { get } from '../../services/api';

/**
 * Schéma de validation Yup pour une ligne de transaction.
 */
const ligneValidationSchema = yup.object().shape({
  id_produit: yup
    .number()
    .required('Le produit est requis')
    .positive('Le produit est requis'),
  quantite: yup
    .number()
    .required('La quantité est requise')
    .positive('La quantité doit être supérieure à 0')
    .integer('La quantité doit être un nombre entier'),
  prix_unitaire: yup
    .number()
    .required('Le prix unitaire est requis')
    .positive('Le prix unitaire doit être supérieur à 0'),
});

/**
 * Schéma de validation Yup pour le formulaire transaction.
 */
const transactionValidationSchema = yup.object().shape({
  date_transaction: yup
    .date()
    .required('La date de transaction est requise')
    .typeError('La date de transaction est requise'),
  type_entite: yup
    .string()
    .required('Vous devez sélectionner un client ou un fournisseur')
    .oneOf(['client', 'fournisseur'], 'Vous devez sélectionner un client ou un fournisseur'),
  id_client: yup
    .number()
    .nullable()
    .when('type_entite', {
      is: 'client',
      then: (schema) => schema.required('Le client est requis').positive('Le client est requis'),
      otherwise: (schema) => schema.nullable(),
    }),
  id_fournisseur: yup
    .number()
    .nullable()
    .when('type_entite', {
      is: 'fournisseur',
      then: (schema) => schema.required('Le fournisseur est requis').positive('Le fournisseur est requis'),
      otherwise: (schema) => schema.nullable(),
    }),
  lignes: yup
    .array()
    .of(ligneValidationSchema)
    .min(1, 'Au moins une ligne est requise')
    .required('Au moins une ligne est requise'),
});

/**
 * Composant TransactionForm.
 */
function TransactionForm({
  open = false,
  onClose,
  onSubmit,
  initialValues = {},
  loading = false,
  errorMessage = null,
}) {
  // État pour les données de référence
  const [clients, setClients] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [produits, setProduits] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  // Initialiser react-hook-form avec le resolver Yup
  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    setError,
    clearErrors,
    watch,
    setValue,
  } = useForm({
    resolver: yupResolver(transactionValidationSchema),
    defaultValues: {
      date_transaction: new Date().toISOString().split('T')[0], // Date du jour par défaut
      type_entite: 'client',
      id_client: null,
      id_fournisseur: null,
      lignes: [{ id_produit: '', quantite: 1, prix_unitaire: 0 }],
    },
    mode: 'onChange',
  });

  // Observer les valeurs du formulaire pour calculer le total
  const watchedLignes = watch('lignes');
  const watchedTypeEntite = watch('type_entite');

  /**
   * Charge les données de référence (clients, fournisseurs, produits).
   */
  const fetchReferenceData = async () => {
    setLoadingData(true);
    try {
      const [clientsData, fournisseursData, produitsData] = await Promise.all([
        get('/clients', { params: { est_actif: true, limit: 1000 } }),
        get('/fournisseurs', { params: { est_actif: true, limit: 1000 } }),
        get('/produits', { params: { est_actif: true, limit: 1000 } }),
      ]);

      setClients(clientsData || []);
      setFournisseurs(fournisseursData || []);
      setProduits(produitsData || []);
    } catch (err) {
      console.error('Erreur lors du chargement des données de référence:', err);
    } finally {
      setLoadingData(false);
    }
  };

  // Charger les données de référence au montage et à l'ouverture de la modal
  useEffect(() => {
    if (open) {
      fetchReferenceData();
    }
  }, [open]);

  // Réinitialiser le formulaire lorsque initialValues change (pour l'édition)
  useEffect(() => {
    if (open) {
      const isEditing = initialValues && initialValues.id_transaction;
      
      if (isEditing) {
        // Mode édition : pré-remplir avec les valeurs initiales
        const typeEntite = initialValues.id_client ? 'client' : 'fournisseur';
        reset({
          date_transaction: initialValues.date_transaction
            ? new Date(initialValues.date_transaction).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0],
          type_entite: typeEntite,
          id_client: initialValues.id_client || null,
          id_fournisseur: initialValues.id_fournisseur || null,
          lignes: initialValues.lignes_transaction?.map((ligne) => ({
            id_produit: ligne.id_produit,
            quantite: ligne.quantite,
            prix_unitaire: 0, // Le prix n'est pas stocké, on le met à 0 pour l'édition
          })) || [{ id_produit: '', quantite: 1, prix_unitaire: 0 }],
        });
      } else {
        // Mode création : valeurs par défaut
        reset({
          date_transaction: new Date().toISOString().split('T')[0],
          type_entite: 'client',
          id_client: null,
          id_fournisseur: null,
          lignes: [{ id_produit: '', quantite: 1, prix_unitaire: 0 }],
        });
      }
      clearErrors();
    }
  }, [open, initialValues, reset, clearErrors]);

  // Nettoyer les erreurs serveur lorsque la modal se ferme
  useEffect(() => {
    if (!open) {
      reset();
      clearErrors();
    }
  }, [open, reset, clearErrors]);

  /**
   * Calcule le montant total à partir des lignes.
   */
  const calculateTotal = () => {
    if (!watchedLignes || watchedLignes.length === 0) return 0;
    
    return watchedLignes.reduce((total, ligne) => {
      const quantite = parseFloat(ligne.quantite) || 0;
      const prix = parseFloat(ligne.prix_unitaire) || 0;
      return total + quantite * prix;
    }, 0);
  };

  /**
   * Gère la soumission du formulaire.
   */
  const handleFormSubmit = async (data) => {
    try {
      const isEditing = initialValues && initialValues.id_transaction;
      
      // Préparer les données pour l'API
      let transactionData;
      
      if (isEditing) {
        // Mode édition : l'endpoint PUT ne supporte pas les lignes
        // On envoie uniquement les champs modifiables
        transactionData = {
          date_transaction: data.date_transaction,
          id_client: data.type_entite === 'client' ? data.id_client : null,
          id_fournisseur: data.type_entite === 'fournisseur' ? data.id_fournisseur : null,
          est_actif: initialValues.est_actif !== undefined ? initialValues.est_actif : true,
        };
      } else {
        // Mode création : on envoie les lignes pour calculer le montant total
        transactionData = {
          date_transaction: data.date_transaction,
          id_client: data.type_entite === 'client' ? data.id_client : null,
          id_fournisseur: data.type_entite === 'fournisseur' ? data.id_fournisseur : null,
          lignes: data.lignes.map((ligne) => ({
            id_produit: parseInt(ligne.id_produit),
            quantite: parseInt(ligne.quantite),
            prix_unitaire: parseFloat(ligne.prix_unitaire),
          })),
          est_actif: true,
        };
      }

      // Appeler le callback onSubmit avec les données formatées
      await onSubmit(transactionData);
      
      // Si la soumission réussit, réinitialiser le formulaire
      reset();
    } catch (error) {
      // Gérer les erreurs de validation serveur
      if (error?.data?.detail) {
        const detail = error.data.detail;
        
        if (Array.isArray(detail)) {
          detail.forEach((err) => {
            if (err.loc && err.loc.length > 1) {
              const fieldName = err.loc[err.loc.length - 1];
              setError(fieldName, {
                type: 'server',
                message: err.msg,
              });
            }
          });
        } else if (typeof detail === 'string') {
          setError('root', {
            type: 'server',
            message: detail,
          });
        }
      } else if (error?.message) {
        setError('root', {
          type: 'server',
          message: error.message,
        });
      }
    }
  };

  /**
   * Gère la fermeture de la modal.
   */
  const handleClose = () => {
    if (!loading) {
      reset();
      clearErrors();
      onClose();
    }
  };

  /**
   * Ajoute une nouvelle ligne au formulaire.
   */
  const handleAddLine = () => {
    const currentLignes = watch('lignes') || [];
    setValue('lignes', [...currentLignes, { id_produit: '', quantite: 1, prix_unitaire: 0 }], {
      shouldDirty: true,
    });
  };

  /**
   * Supprime une ligne du formulaire.
   */
  const handleRemoveLine = (index) => {
    const currentLignes = watch('lignes') || [];
    if (currentLignes.length > 1) {
      const newLignes = currentLignes.filter((_, i) => i !== index);
      setValue('lignes', newLignes, { shouldDirty: true });
    }
  };

  /**
   * Gère le changement du type d'entité (client/fournisseur).
   */
  const handleTypeEntiteChange = (newType) => {
    setValue('type_entite', newType, { shouldDirty: true });
    // Réinitialiser les sélections
    setValue('id_client', null, { shouldDirty: true });
    setValue('id_fournisseur', null, { shouldDirty: true });
  };

  const montantTotal = calculateTotal();
  const isEditing = initialValues && initialValues.id_transaction;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: '500px',
        },
      }}
    >
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <DialogTitle>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography variant="h6" component="div">
              {isEditing ? 'Modifier la transaction' : 'Créer une nouvelle transaction'}
            </Typography>
            <Button
              onClick={handleClose}
              disabled={loading}
              sx={{ minWidth: 'auto', p: 1 }}
            >
              <CloseIcon />
            </Button>
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          {/* Afficher l'erreur serveur générale si présente */}
          {(errorMessage || errors.root) && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMessage || errors.root?.message}
            </Alert>
          )}

          {loadingData ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ mt: 1 }}>
              {/* Date de transaction */}
              <Controller
                name="date_transaction"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Date de transaction"
                    type="date"
                    error={!!error}
                    helperText={error?.message || ''}
                    required
                    disabled={loading}
                    margin="normal"
                    variant="outlined"
                    InputLabelProps={{
                      shrink: true,
                    }}
                  />
                )}
              />

              {/* Sélection Client OU Fournisseur */}
              <FormControl component="fieldset" margin="normal" fullWidth error={!!errors.type_entite}>
                <FormLabel component="legend">Type d'entité</FormLabel>
                <Controller
                  name="type_entite"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup
                      {...field}
                      row
                      onChange={(e) => handleTypeEntiteChange(e.target.value)}
                    >
                      <FormControlLabel
                        value="client"
                        control={<Radio />}
                        label="Client"
                        disabled={loading}
                      />
                      <FormControlLabel
                        value="fournisseur"
                        control={<Radio />}
                        label="Fournisseur"
                        disabled={loading}
                      />
                    </RadioGroup>
                  )}
                />
                {errors.type_entite && (
                  <FormHelperText>{errors.type_entite.message}</FormHelperText>
                )}
              </FormControl>

              {/* Sélection Client */}
              {watchedTypeEntite === 'client' && (
                <Controller
                  name="id_client"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      fullWidth
                      margin="normal"
                      error={!!error}
                      disabled={loading}
                    >
                      <InputLabel required>Client</InputLabel>
                      <Select
                        {...field}
                        label="Client"
                        value={field.value || ''}
                      >
                        <MenuItem value="">
                          <em>Sélectionner un client</em>
                        </MenuItem>
                        {clients.map((client) => (
                          <MenuItem key={client.id_client} value={client.id_client}>
                            {client.nom_client}
                          </MenuItem>
                        ))}
                      </Select>
                      {error && <FormHelperText>{error.message}</FormHelperText>}
                    </FormControl>
                  )}
                />
              )}

              {/* Sélection Fournisseur */}
              {watchedTypeEntite === 'fournisseur' && (
                <Controller
                  name="id_fournisseur"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      fullWidth
                      margin="normal"
                      error={!!error}
                      disabled={loading}
                    >
                      <InputLabel required>Fournisseur</InputLabel>
                      <Select
                        {...field}
                        label="Fournisseur"
                        value={field.value || ''}
                      >
                        <MenuItem value="">
                          <em>Sélectionner un fournisseur</em>
                        </MenuItem>
                        {fournisseurs.map((fournisseur) => (
                          <MenuItem
                            key={fournisseur.id_fournisseur}
                            value={fournisseur.id_fournisseur}
                          >
                            {fournisseur.nom_fournisseur}
                          </MenuItem>
                        ))}
                      </Select>
                      {error && <FormHelperText>{error.message}</FormHelperText>}
                    </FormControl>
                  )}
                />
              )}

              {/* Lignes de transaction */}
              <Box sx={{ mt: 3, mb: 2 }}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 2,
                  }}
                >
                  <Typography variant="h6">Lignes de transaction</Typography>
                  {!isEditing && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={handleAddLine}
                      disabled={loading}
                    >
                      Ajouter une ligne
                    </Button>
                  )}
                </Box>
                
                {isEditing && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Note : Les lignes de transaction ne peuvent pas être modifiées lors de l'édition.
                    Seuls la date, le client/fournisseur et le statut peuvent être modifiés.
                  </Alert>
                )}

                {errors.lignes && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {errors.lignes.message}
                  </Alert>
                )}

                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Produit</TableCell>
                        <TableCell align="right">Quantité</TableCell>
                        <TableCell align="right">Prix unitaire</TableCell>
                        <TableCell align="right">Total</TableCell>
                        <TableCell align="center" width={80}>
                          Actions
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {watchedLignes?.map((ligne, index) => {
                        const ligneTotal =
                          (parseFloat(ligne.quantite) || 0) *
                          (parseFloat(ligne.prix_unitaire) || 0);
                        return (
                          <TableRow key={index}>
                            <TableCell>
                              <Controller
                                name={`lignes.${index}.id_produit`}
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                  <FormControl
                                    fullWidth
                                    size="small"
                                    error={!!error}
                                    disabled={loading}
                                  >
                                    <Select
                                      {...field}
                                      value={field.value || ''}
                                      displayEmpty
                                      disabled={loading || isEditing}
                                    >
                                      <MenuItem value="">
                                        <em>Sélectionner</em>
                                      </MenuItem>
                                      {produits.map((produit) => (
                                        <MenuItem
                                          key={produit.id_produit}
                                          value={produit.id_produit}
                                        >
                                          {produit.nom_produit}
                                        </MenuItem>
                                      ))}
                                    </Select>
                                    {error && (
                                      <FormHelperText error>
                                        {error.message}
                                      </FormHelperText>
                                    )}
                                  </FormControl>
                                )}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Controller
                                name={`lignes.${index}.quantite`}
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                    <TextField
                                      {...field}
                                      type="number"
                                      size="small"
                                      inputProps={{ min: 1, step: 1 }}
                                      error={!!error}
                                      helperText={error?.message}
                                      disabled={loading || isEditing}
                                      sx={{ width: 100 }}
                                      onChange={(e) => {
                                        field.onChange(e);
                                        // Déclencher la validation
                                      }}
                                    />
                                )}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Controller
                                name={`lignes.${index}.prix_unitaire`}
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                    <TextField
                                      {...field}
                                      type="number"
                                      size="small"
                                      inputProps={{ min: 0, step: 0.01 }}
                                      error={!!error}
                                      helperText={error?.message}
                                      disabled={loading || isEditing}
                                      sx={{ width: 120 }}
                                      onChange={(e) => {
                                        field.onChange(e);
                                        // Déclencher la validation
                                      }}
                                    />
                                )}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2">
                                {ligneTotal.toFixed(2)} €
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              {!isEditing && (
                                <IconButton
                                  size="small"
                                  onClick={() => handleRemoveLine(index)}
                                  disabled={loading || watchedLignes.length <= 1}
                                  color="error"
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Montant total */}
                <Box
                  sx={{
                    mt: 2,
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                  }}
                >
                  <Typography variant="h6" sx={{ mr: 2 }}>
                    Montant total :
                  </Typography>
                  <Typography variant="h6" color="primary" fontWeight="bold">
                    {montantTotal.toFixed(2)} €
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={handleClose}
            disabled={loading}
            color="inherit"
          >
            Annuler
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !isDirty}
            startIcon={loading ? <CircularProgress size={16} /> : null}
          >
            {loading ? 'Enregistrement...' : isEditing ? 'Modifier' : 'Créer'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default TransactionForm;

