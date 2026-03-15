/**
 * Composant TransactionForm.
 * 
 * Formulaire pour créer et éditer des transactions avec :
 * - Date transaction
 * - Sélection Client OU Fournisseur (radio buttons)
 * - Liste de lignes dynamique (produit + quantité + prix unitaire)
 * - Calcul automatique du montant total
 * - Validation complète
 * 
 * En mode création : crée N transactions indépendantes (une par ligne) via /batch
 * En mode édition : édite UNE transaction existante
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
  Checkbox,
  Divider,
  Collapse,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
} from '@mui/material';
import { 
  Close as CloseIcon, 
  Add as AddIcon, 
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  Payment as PaymentIcon,
} from '@mui/icons-material';
import { get, getProduitsParType, post, put } from '../../services/api';
import { formatMontant } from '../../utils/formatNumber';

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
    .typeError('La quantité doit être un nombre')
    .required('La quantité est requise')
    .positive('La quantité doit être supérieure à 0')
    .integer('La quantité doit être un nombre entier')
    .transform((value, originalValue) => {
      if (originalValue === '' || originalValue === null || originalValue === undefined) {
        return undefined;
      }
      const num = Number(originalValue);
      return isNaN(num) ? undefined : num;
    }),
  prix_unitaire: yup
    .number()
    .typeError('Le prix unitaire doit être un nombre')
    .required('Le prix unitaire est requis')
    .positive('Le prix unitaire doit être supérieur à 0')
    .transform((value, originalValue) => {
      if (originalValue === '' || originalValue === null || originalValue === undefined) {
        return undefined;
      }
      const num = Number(originalValue);
      return isNaN(num) ? undefined : num;
    }),
  // Champs pour le paiement de cette ligne (optionnels)
  ajouter_paiement: yup.boolean(),
  paiement_date: yup.string().nullable(),
  paiement_montant: yup.number().nullable().positive('Le montant doit être positif'),
  paiement_type: yup.string().nullable(),
  paiement_numero_cheque: yup.string().nullable(),
  paiement_banque: yup.string().nullable(),
  paiement_reference: yup.string().nullable(),
  paiement_id_lc: yup.number().nullable(),
  paiement_notes: yup.string().nullable(),
  paiement_id: yup.number().nullable(), // ID du paiement existant (en mode édition)
});

/**
 * Composant interne pour la sélection d'une Lettre de Crédit dans une ligne de transaction.
 * Encapsule la logique de chargement des LC disponibles pour éviter les mises à jour d'état
 * pendant le rendu du composant parent.
 */
const LcPaymentSelector = ({ index, control, watch, setValue, loading, formatMontant }) => {
  const [lcs, setLcs] = React.useState([]);
  const [fetching, setFetching] = React.useState(false);
  
  const typeEntite = watch('type_entite');
  const clientId = watch('id_client');
  const fournisseurId = watch('id_fournisseur');

  React.useEffect(() => {
    const fetchLcs = async () => {
      setFetching(true);
      try {
        const params = {};
        if (typeEntite === 'client') {
          if (clientId) params.id_client = clientId;
          else {
            setLcs([]);
            setFetching(false);
            return;
          }
        } else {
          if (fournisseurId) params.id_fournisseur = fournisseurId;
          else {
            setLcs([]);
            setFetching(false);
            return;
          }
        }
        const data = await get('/lettres-credit/disponibles', { params });
        setLcs(data || []);
      } catch (err) {
        console.error('Erreur chargement LC:', err);
        setLcs([]);
      } finally {
        setFetching(false);
      }
    };

    fetchLcs();
  }, [typeEntite, clientId, fournisseurId]);

  return (
    <Controller
      name={`lignes.${index}.paiement_id_lc`}
      control={control}
      rules={{ required: 'Veuillez sélectionner une LC' }}
      render={({ field, fieldState: { error } }) => (
        <TextField
          {...field}
          select
          fullWidth
          label="Choisir une Lettre de Crédit"
          error={!!error}
          helperText={error?.message || (lcs.length === 0 && !fetching ? 'Aucune LC disponible pour ce partenaire' : '')}
          disabled={loading || fetching}
          size="small"
          value={field.value || ''}
          onChange={(e) => {
            field.onChange(e.target.value);
            // Auto-remplissage du montant avec le montant de la LC
            const selectedLc = lcs.find(l => l.id_lc === e.target.value);
            if (selectedLc) {
              setValue(`lignes.${index}.paiement_montant`, parseFloat(selectedLc.montant));
            }
          }}
        >
          {lcs.map((l) => (
            <MenuItem key={l.id_lc} value={l.id_lc}>
              {l.numero_reference} ({formatMontant(l.montant)})
            </MenuItem>
          ))}
        </TextField>
      )}
    />
  );
};

/**
 * Schéma de validation Yup pour le formulaire transaction.
 */
const transactionValidationSchema = yup.object().shape({
  date_transaction: yup
    .string()
    .required('La date de transaction est requise')
    .matches(/^\d{4}-\d{2}-\d{2}$/, 'La date doit être au format YYYY-MM-DD'),
  date_echeance: yup
    .string()
    .nullable()
    .matches(/^\d{4}-\d{2}-\d{2}$/, 'La date doit être au format YYYY-MM-DD')
    .test('date-apres-transaction', 'La date d\'échéance doit être après la date de transaction', function(value) {
      if (!value) return true; // Optionnel
      const dateTransaction = this.parent.date_transaction;
      if (!dateTransaction) return true;
      return new Date(value) >= new Date(dateTransaction);
    }),
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
  prefillClientId = null,
  prefillFournisseurId = null,
}) {
  // État pour les données de référence
  const [clients, setClients] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [produits, setProduits] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  
  // État pour gérer les paiements par ligne (tableau de booleans)
  const [paiementsParLigne, setPaiementsParLigne] = useState([false]);
  
  // État pour gérer l'expansion des accordions (première ligne expanded par défaut)
  const [expandedAccordion, setExpandedAccordion] = useState(0);

  // État pour stocker les paiements existants (en mode édition)
  const [paiementsExistants, setPaiementsExistants] = useState([]);

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
      date_transaction: new Date().toISOString().split('T')[0],
      date_echeance: '',
      type_entite: 'client',
      id_client: '',
      id_fournisseur: '',
      lignes: [{ 
        id_produit: '', 
        quantite: undefined, 
        prix_unitaire: undefined,
        ajouter_paiement: false,
        paiement_date: new Date().toISOString().split('T')[0],
        paiement_montant: '',
        paiement_type: 'cash',
        paiement_numero_cheque: '',
        paiement_banque: '',
        paiement_reference: '',
        paiement_id_lc: '',
        paiement_notes: '',
      }],
    },
    mode: 'onChange',
  });

  // Observer les valeurs du formulaire pour calculer le total
  const watchedLignes = watch('lignes');
  const watchedTypeEntite = watch('type_entite');


  /**
   * Charge les données de référence (clients, fournisseurs, produits).
   */
  const fetchReferenceData = async (typeEntite = 'client') => {
    setLoadingData(true);
    try {
      const [clientsData, fournisseursData, produitsData] = await Promise.all([
        get('/clients', { params: { est_actif: true, limit: 1000 } }),
        get('/fournisseurs', { params: { est_actif: true, limit: 1000 } }),
        getProduitsParType(typeEntite, { est_actif: true, limit: 1000 }),
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

  /**
   * Charge les paiements existants pour une transaction (en mode édition).
   */
  const fetchPaiementsExistants = async (idTransaction) => {
    try {
      const paiements = await get('/paiements', {
        params: { id_transaction: idTransaction },
      });
      setPaiementsExistants(paiements || []);
      return paiements || [];
    } catch (err) {
      console.error('Erreur lors du chargement des paiements:', err);
      return [];
    }
  };

  // Charger les données de référence au montage et à l'ouverture de la modal
  useEffect(() => {
    if (open) {
      fetchReferenceData(watchedTypeEntite || 'client');
    }
  }, [open, watchedTypeEntite]);

  // Réinitialiser le formulaire lorsque initialValues change (pour l'édition)
  useEffect(() => {
    const loadFormData = async () => {
      if (open) {
        const isEditing = initialValues && initialValues.id_transaction;
        
        if (isEditing) {
          // Mode édition : pré-remplir avec UNE ligne (la transaction à éditer)
          const typeEntite = initialValues.id_client ? 'client' : 'fournisseur';
          
          // Charger les paiements existants
          const paiements = await fetchPaiementsExistants(initialValues.id_transaction);
          
          // Vérifier s'il y a au moins un paiement
          const hasPaiement = paiements && paiements.length > 0;
          const premierPaiement = hasPaiement ? paiements[0] : null;
          
          reset({
            date_transaction: initialValues.date_transaction
              ? new Date(initialValues.date_transaction).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0],
            date_echeance: initialValues.date_echeance
              ? new Date(initialValues.date_echeance).toISOString().split('T')[0]
              : '',
            type_entite: typeEntite,
            id_client: initialValues.id_client || '',
            id_fournisseur: initialValues.id_fournisseur || '',
            lignes: [{
              id_produit: initialValues.id_produit || '',
              quantite: initialValues.quantite || undefined,
              prix_unitaire: initialValues.prix_unitaire || undefined,
              ajouter_paiement: hasPaiement,
              paiement_date: premierPaiement 
                ? new Date(premierPaiement.date_paiement).toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0],
              paiement_montant: premierPaiement ? parseFloat(premierPaiement.montant) : '',
              paiement_type: premierPaiement ? premierPaiement.type_paiement : 'cash',
              paiement_numero_cheque: premierPaiement ? (premierPaiement.numero_cheque || '') : '',
              paiement_banque: premierPaiement ? (premierPaiement.banque || '') : '',
              paiement_reference: premierPaiement ? (premierPaiement.reference_virement || '') : '',
              paiement_id_lc: premierPaiement ? (premierPaiement.id_lc || '') : '',
              paiement_notes: premierPaiement ? (premierPaiement.notes || '') : '',
              paiement_id: premierPaiement ? premierPaiement.id_paiement : '', // Sauvegarder l'ID pour la mise à jour
            }],
          });
        } else {
          // Mode création : valeurs par défaut ou pré-remplies
          const hasPrefillClient = prefillClientId !== null && prefillClientId !== undefined;
          const hasPrefillFournisseur = prefillFournisseurId !== null && prefillFournisseurId !== undefined;
          
          reset({
            date_transaction: new Date().toISOString().split('T')[0],
            date_echeance: '',
            type_entite: hasPrefillClient ? 'client' : hasPrefillFournisseur ? 'fournisseur' : 'client',
            id_client: hasPrefillClient ? prefillClientId : '',
            id_fournisseur: hasPrefillFournisseur ? prefillFournisseurId : '',
            lignes: [{ 
              id_produit: '', 
              quantite: undefined, 
              prix_unitaire: undefined,
              ajouter_paiement: false,
              paiement_date: new Date().toISOString().split('T')[0],
              paiement_montant: '',
              paiement_type: 'cash',
              paiement_numero_cheque: '',
              paiement_banque: '',
              paiement_reference: '',
              paiement_id_lc: '',
              paiement_notes: '',
            }],
          });
        }
        clearErrors();
      }
    };
    
    loadFormData();
  }, [open, initialValues, reset, clearErrors, prefillClientId, prefillFournisseurId]);

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
      
      if (isEditing) {
        // Mode édition : on édite UNE seule transaction
        const transactionData = {
          date_transaction: data.date_transaction,
          date_echeance: data.date_echeance || null,
          id_client: data.type_entite === 'client' ? data.id_client : null,
          id_fournisseur: data.type_entite === 'fournisseur' ? data.id_fournisseur : null,
          id_produit: parseInt(data.lignes[0].id_produit),
          quantite: parseInt(data.lignes[0].quantite),
          prix_unitaire: parseFloat(data.lignes[0].prix_unitaire),
          est_actif: initialValues.est_actif !== undefined ? initialValues.est_actif : true,
        };
        
        // Passer aussi les données de paiement pour que le parent les gère
        const paiementData = data.lignes[0].ajouter_paiement ? {
          ajouter_paiement: true,
          paiement_id: data.lignes[0].paiement_id || null,
          paiement_date: data.lignes[0].paiement_date,
          paiement_montant: parseFloat(data.lignes[0].paiement_montant),
          paiement_type: data.lignes[0].paiement_type,
          paiement_numero_cheque: data.lignes[0].paiement_numero_cheque || null,
          paiement_banque: data.lignes[0].paiement_banque || null,
          paiement_reference: data.lignes[0].paiement_reference || null,
          paiement_notes: data.lignes[0].paiement_notes || null,
        } : null;
        
        await onSubmit({ ...transactionData, paiement: paiementData });
      } else {
        // Mode création : on crée N transactions via l'endpoint batch
        const transactionsData = data.lignes.map((ligne) => ({
          date_transaction: data.date_transaction,
          date_echeance: data.date_echeance || null,
          id_client: data.type_entite === 'client' ? data.id_client : null,
          id_fournisseur: data.type_entite === 'fournisseur' ? data.id_fournisseur : null,
          id_produit: parseInt(ligne.id_produit),
          quantite: parseInt(ligne.quantite),
          prix_unitaire: parseFloat(ligne.prix_unitaire),
          est_actif: true,
        }));
        
        // Appeler le callback onSubmit avec le tableau de transactions et les données des lignes (pour les paiements)
        await onSubmit({ batch: true, transactions: transactionsData, lignesData: data.lignes });
      }
      
      // Si la soumission réussit, réinitialiser le formulaire
      reset();
    } catch (error) {
      // Gérer les erreurs de validation serveur
      if (error?.data?.detail) {
        const detail = error.data.detail;
        
        if (Array.isArray(detail)) {
          detail.forEach((err) => {
            if (err.loc && err.loc.length > 1) {
              const fieldPath = err.loc.slice(1);
              
              // Gérer les erreurs dans les lignes
              if (fieldPath[0] === 'lignes' && fieldPath.length === 3) {
                const ligneIndex = parseInt(fieldPath[1]);
                const fieldName = fieldPath[2];
                
                setError(`lignes.${ligneIndex}.${fieldName}`, {
                  type: 'server',
                  message: err.msg,
                });
              } else {
                const fieldName = fieldPath[fieldPath.length - 1];
                setError(fieldName, {
                  type: 'server',
                  message: err.msg,
                });
              }
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
      
      // Re-throw pour que le composant parent puisse aussi gérer l'erreur
      throw error;
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
    setValue('lignes', [...currentLignes, { 
      id_produit: '', 
      quantite: undefined, 
      prix_unitaire: undefined,
      ajouter_paiement: false,
      paiement_date: watch('date_transaction') || new Date().toISOString().split('T')[0],
      paiement_montant: '',
      paiement_type: 'cash',
      paiement_numero_cheque: '',
      paiement_banque: '',
      paiement_reference: '',
      paiement_id_lc: '',
      paiement_notes: '',
    }], {
      shouldDirty: true,
    });
    // Expand le nouvel accordion
    setExpandedAccordion(currentLignes.length);
  };

  /**
   * Supprime une ligne du formulaire.
   */
  const handleRemoveLine = (index) => {
    const currentLignes = watch('lignes') || [];
    if (currentLignes.length > 1) {
      const newLignes = currentLignes.filter((_, i) => i !== index);
      setValue('lignes', newLignes, { shouldDirty: true });
      
      // Ajuster l'accordion expanded si nécessaire
      if (expandedAccordion === index) {
        setExpandedAccordion(0); // Expand la première ligne
      } else if (expandedAccordion > index) {
        setExpandedAccordion(expandedAccordion - 1); // Décaler l'index
      }
    }
  };

  /**
   * Gère le changement du type d'entité (client/fournisseur).
   */
  const handleTypeEntiteChange = async (newType) => {
    setValue('type_entite', newType, { shouldDirty: true });
    setValue('id_client', '', { shouldDirty: true });
    setValue('id_fournisseur', '', { shouldDirty: true });

    // Recharger les produits pour le type sélectionné
    setLoadingData(true);
    try {
      const produitsData = await getProduitsParType(newType, {
        est_actif: true,
        limit: 1000,
      });
      setProduits(produitsData || []);
    } catch (err) {
      console.error('Erreur lors du chargement des produits:', err);
    } finally {
      setLoadingData(false);
    }
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

              {/* Date d'échéance (optionnel) */}
              <Controller
                name="date_echeance"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Date d'échéance du paiement (optionnel)"
                    type="date"
                    error={!!error}
                    helperText={error?.message || 'Date limite pour le paiement'}
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
                        disabled={loading || (prefillFournisseurId !== null && prefillFournisseurId !== undefined)}
                      />
                      <FormControlLabel
                        value="fournisseur"
                        control={<Radio />}
                        label="Fournisseur"
                        disabled={loading || (prefillClientId !== null && prefillClientId !== undefined)}
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
                      disabled={loading || (prefillClientId !== null && prefillClientId !== undefined)}
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
                      disabled={loading || (prefillFournisseurId !== null && prefillFournisseurId !== undefined)}
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

              {/* Lignes de transaction avec Accordions */}
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

                {errors.lignes && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {errors.lignes.message}
                  </Alert>
                )}

                {/* Accordions pour chaque ligne */}
                      {watchedLignes?.map((ligne, index) => {
                        const ligneTotal =
                          (parseFloat(ligne.quantite) || 0) *
                          (parseFloat(ligne.prix_unitaire) || 0);
                  const produitNom = produits.find(p => p.id_produit === ligne.id_produit)?.nom_produit || 'Produit non sélectionné';
                  
                        return (
                    <Accordion 
                      key={index}
                      expanded={expandedAccordion === index}
                      onChange={() => setExpandedAccordion(expandedAccordion === index ? -1 : index)}
                      sx={{ mb: 1 }}
                    >
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', pr: 2 }}>
                          <Chip 
                            label={`Ligne ${index + 1}`} 
                            size="small" 
                            color="primary" 
                            variant="outlined"
                          />
                          <Typography variant="body1" sx={{ flex: 1 }}>
                            {produitNom}
                          </Typography>
                          <Typography variant="body2" fontWeight="bold" color="primary">
                            {ligneTotal.toFixed(2)} MAD
                          </Typography>
                          {ligne.ajouter_paiement && (
                            <Chip 
                              icon={<PaymentIcon />}
                              label="Avec paiement" 
                              size="small" 
                              color="success"
                            />
                          )}
                        </Box>
                      </AccordionSummary>
                      
                      <AccordionDetails>
                        <Grid container spacing={2}>
                          {/* Produit */}
                          <Grid item xs={12}>
                              <Controller
                                name={`lignes.${index}.id_produit`}
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                <FormControl fullWidth error={!!error} disabled={loading}>
                                  <InputLabel>Produit *</InputLabel>
                                    <Select
                                      {...field}
                                      value={field.value || ''}
                                    label="Produit *"
                                      disabled={loading}
                                    >
                                      <MenuItem value="">
                                      <em>Sélectionner un produit</em>
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
                          </Grid>

                          {/* Quantité */}
                          <Grid item xs={12} sm={6}>
                              <Controller
                                name={`lignes.${index}.quantite`}
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                  <TextField
                                    {...field}
                                    fullWidth
                                    label="Quantité *"
                                    type="number"
                                    inputProps={{ min: 1, step: 1 }}
                                    value={field.value ?? ''}
                                    error={!!error}
                                    helperText={error?.message || ''}
                                    disabled={loading}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      field.onChange(value === '' ? undefined : value);
                                      // Mettre à jour le montant du paiement si paiement activé
                                      if (ligne.ajouter_paiement) {
                                        const newTotal = (parseFloat(value) || 0) * (parseFloat(ligne.prix_unitaire) || 0);
                                        setValue(`lignes.${index}.paiement_montant`, newTotal);
                                      }
                                    }}
                                    onBlur={field.onBlur}
                                  />
                                )}
                              />
                          </Grid>

                          {/* Prix unitaire */}
                          <Grid item xs={12} sm={6}>
                              <Controller
                                name={`lignes.${index}.prix_unitaire`}
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                  <TextField
                                    {...field}
                                    fullWidth
                                    label="Prix unitaire (MAD) *"
                                    type="number"
                                    inputProps={{ min: 0, step: 0.01 }}
                                    value={field.value ?? ''}
                                    error={!!error}
                                    helperText={error?.message || ''}
                                    disabled={loading}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      field.onChange(value === '' ? undefined : value);
                                      // Mettre à jour le montant du paiement si paiement activé
                                      if (ligne.ajouter_paiement) {
                                        const newTotal = (parseFloat(ligne.quantite) || 0) * (parseFloat(value) || 0);
                                        setValue(`lignes.${index}.paiement_montant`, newTotal);
                                      }
                                    }}
                                    onBlur={field.onBlur}
                                  />
                                )}
                              />
                          </Grid>

                          {/* Total de cette ligne */}
                          <Grid item xs={12}>
                            <Box sx={{ p: 1.5, bgcolor: 'primary.50', borderRadius: 1 }}>
                              <Typography variant="body2" color="text.secondary">
                                Total de cette ligne
                              </Typography>
                              <Typography variant="h6" color="primary" fontWeight="bold">
                                {ligneTotal.toFixed(2)} MAD
                              </Typography>
                            </Box>
                          </Grid>

                          <Grid item xs={12}>
                            <Divider />
                          </Grid>

                          {/* Section Paiement */}
                          <Grid item xs={12}>
                            <Controller
                              name={`lignes.${index}.ajouter_paiement`}
                              control={control}
                              render={({ field }) => (
                                <FormControlLabel
                                  control={
                                    <Checkbox
                                      {...field}
                                      checked={field.value || false}
                                      disabled={loading}
                                      onChange={(e) => {
                                        field.onChange(e.target.checked);
                                        // Pré-remplir le montant avec le total de la ligne
                                        if (e.target.checked && ligneTotal > 0) {
                                          setValue(`lignes.${index}.paiement_montant`, ligneTotal);
                                          setValue(`lignes.${index}.paiement_date`, watch('date_transaction'));
                                        }
                                      }}
                                    />
                                  }
                                  label={
                                    <Box>
                                      <Typography variant="subtitle2" fontWeight="medium">
                                        💰 Ajouter un paiement pour cette ligne
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        Le paiement sera créé en même temps que la transaction
                                      </Typography>
                                    </Box>
                                  }
                                />
                              )}
                            />

                            {/* Champs de paiement conditionnels */}
                            <Collapse in={ligne.ajouter_paiement}>
                              <Box sx={{ mt: 2, p: 2, bgcolor: 'success.50', borderRadius: 1 }}>
                                <Typography variant="subtitle2" gutterBottom color="success.dark">
                                  📋 Informations du paiement
                                </Typography>
                                
                                <Grid container spacing={2}>
                                  {/* Date du paiement */}
                                  <Grid item xs={12} sm={6}>
                                    <Controller
                                      name={`lignes.${index}.paiement_date`}
                                      control={control}
                                      render={({ field, fieldState: { error } }) => (
                                        <TextField
                                          {...field}
                                          fullWidth
                                          label="Date du paiement"
                                          type="date"
                                          error={!!error}
                                          helperText={error?.message}
                                          disabled={loading}
                                          InputLabelProps={{ shrink: true }}
                                  size="small"
                                        />
                                      )}
                                    />
                                  </Grid>

                                  {/* Montant */}
                                  <Grid item xs={12} sm={6}>
                                    <Controller
                                      name={`lignes.${index}.paiement_montant`}
                                      control={control}
                                      render={({ field, fieldState: { error } }) => (
                                        <TextField
                                          {...field}
                                          fullWidth
                                          label="Montant (MAD)"
                                          type="number"
                                          error={!!error}
                                          helperText={error?.message || `Max: ${ligneTotal.toFixed(2)} MAD`}
                                          disabled={loading}
                                          inputProps={{ step: '0.01', min: '0.01' }}
                                          InputLabelProps={{ shrink: true }}
                                          size="small"
                                        />
                                      )}
                                    />
                                  </Grid>

                                  {/* Type de paiement */}
                                  <Grid item xs={12}>
                                    <Controller
                                      name={`lignes.${index}.paiement_type`}
                                      control={control}
                                      render={({ field, fieldState: { error } }) => (
                                        <TextField
                                          {...field}
                                          select
                                          fullWidth
                                          label="Type de paiement"
                                          error={!!error}
                                          helperText={error?.message}
                                          disabled={loading}
                                          size="small"
                                        >
                                          <MenuItem value="cash">💵 Espèces</MenuItem>
                                          <MenuItem value="cheque">💳 Chèque</MenuItem>
                                          <MenuItem value="virement">🏦 Virement</MenuItem>
                                          <MenuItem value="carte">💳 Carte bancaire</MenuItem>
                                          <MenuItem value="traite">📝 Traite</MenuItem>
                                          <MenuItem value="compensation">↔️ Compensation</MenuItem>
                                          <MenuItem value="lc">📜 Lettre de Crédit</MenuItem>
                                          <MenuItem value="autre">📄 Autre</MenuItem>
                                        </TextField>
                                      )}
                                    />
                                  </Grid>

                                  {/* Champs conditionnels pour chèque */}
                                  {ligne.paiement_type === 'cheque' && (
                                    <>
                                      <Grid item xs={12} sm={6}>
                                        <Controller
                                          name={`lignes.${index}.paiement_numero_cheque`}
                                          control={control}
                                          render={({ field }) => (
                                            <TextField
                                              {...field}
                                              fullWidth
                                              label="Numéro du chèque"
                                              disabled={loading}
                                              size="small"
                                            />
                                          )}
                                        />
                                      </Grid>
                                      <Grid item xs={12} sm={6}>
                                        <Controller
                                          name={`lignes.${index}.paiement_banque`}
                                          control={control}
                                          render={({ field }) => (
                                            <TextField
                                              {...field}
                                              fullWidth
                                              label="Banque"
                                              disabled={loading}
                                              size="small"
                                            />
                                          )}
                                        />
                                      </Grid>
                                    </>
                                  )}

                                  {/* Champs conditionnels pour virement */}
                                  {ligne.paiement_type === 'virement' && (
                                    <Grid item xs={12}>
                                      <Controller
                                        name={`lignes.${index}.paiement_reference`}
                                        control={control}
                                        render={({ field }) => (
                                          <TextField
                                            {...field}
                                            fullWidth
                                            label="Référence du virement"
                                            disabled={loading}
                                            size="small"
                                            placeholder="Ex: VIR-2025-001234"
                                          />
                                        )}
                                      />
                                    </Grid>
                                  )}

                                  {/* Champs conditionnels pour Lettre de Crédit */}
                                  {ligne.paiement_type === 'lc' && (
                                    <Grid item xs={12}>
                                      <LcPaymentSelector
                                        index={index}
                                        control={control}
                                        watch={watch}
                                        setValue={setValue}
                                        loading={loading}
                                        formatMontant={formatMontant}
                                      />
                                      {ligne.paiement_id_lc && (
                                        <Alert severity="warning" sx={{ mt: 1 }}>
                                          Une Lettre de Crédit doit être utilisée en totalité.
                                        </Alert>
                                      )}
                                    </Grid>
                                  )}

                                  {/* Notes */}
                                  <Grid item xs={12}>
                                    <Controller
                                      name={`lignes.${index}.paiement_notes`}
                                      control={control}
                                      render={({ field }) => (
                                        <TextField
                                          {...field}
                                          fullWidth
                                          label="Notes (optionnel)"
                                          multiline
                                          rows={2}
                                          disabled={loading}
                                          size="small"
                                        />
                                      )}
                                    />
                                  </Grid>
                                </Grid>
                              </Box>
                            </Collapse>
                          </Grid>

                          {/* Bouton supprimer la ligne */}
                          {!isEditing && watchedLignes.length > 1 && (
                            <Grid item xs={12}>
                              <Button
                                startIcon={<DeleteIcon />}
                                  onClick={() => handleRemoveLine(index)}
                                disabled={loading}
                                  color="error"
                                size="small"
                                fullWidth
                                variant="outlined"
                              >
                                Supprimer cette ligne
                              </Button>
                            </Grid>
                            )}
                        </Grid>
                      </AccordionDetails>
                    </Accordion>
                        );
                      })}

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
                    {montantTotal.toFixed(2)} MAD
                  </Typography>
                </Box>
                
                {!isEditing && watchedLignes.length > 1 && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    {watchedLignes.length} transactions indépendantes seront créées (une par ligne).
                    Vous pouvez ajouter un paiement pour chacune dans son accordion.
                  </Alert>
                )}
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
