import DateField from '../../utils/DateField';
import ProductionSourcePicker from './ProductionSourcePicker';
import SaleLineDetails from './SaleSummary';
import { saleStockSummary } from './saleStockSummary';
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

import React, { useState, useEffect, useRef } from 'react';
import { keyframes } from '@emotion/react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  Stack,
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
  Paper,
  Select,
  MenuItem,
  InputLabel,
  Divider,
  Collapse,
  Grid,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  PaymentsOutlined as PaymentsIcon,
  ReceiptLongOutlined as ChequeIcon,
  AccountBalanceOutlined as BankTransferIcon,
  DescriptionOutlined as CreditLetterIcon,
} from '@mui/icons-material';
import { get, getProduitsParType } from '../../services/api';
import { formatMontant } from '../../utils/formatNumber';
import { getDefaultDueDate } from '../../utils/dueDates';
import { transactionValidationSchema } from './transactionValidation';
import { DECIMAL_INPUT_PROPS } from '../../utils/decimalInput';

const EMPTY_INITIAL_VALUES = {};

const today = () => new Date().toISOString().split('T')[0];
// The day after a given ISO date (default: today), used as the default planned delivery date.
const tomorrow = (from = today()) => {
  const value = new Date(`${String(from).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(value.getTime())) return tomorrow();
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().split('T')[0];
};

const requiredFieldShake = keyframes`
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-5px); }
  40%, 80% { transform: translateX(5px); }
`;

const getRequiredFieldAnimation = (error, animateInvalidFields) => (
  error && animateInvalidFields
    ? {
      animation: `${requiredFieldShake} 420ms ease-in-out`,
      '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
    }
    : undefined
);

const getFieldLabel = (path) => {
  const line = path.match(/^lignes\.(\d+)/);
  const lineSuffix = line ? ` (ligne ${Number(line[1]) + 1})` : '';
  const field = path.split('.').at(-1);
  const labels = {
    date_transaction: 'Date de transaction',
    date_echeance: 'Date d’échéance',
    id_client: 'Client',
    id_fournisseur: 'Fournisseur',
    type_entite: 'Type de transaction',
    id_produit: 'Produit acheté',
    id_production: 'Type d’œufs de la saisie',
    id_batiment: 'Bâtiment source',
    date_production: 'Date de la saisie',
    date_livraison_prevue: 'Date prévue de livraison',
    est_promesse: 'Livraison différée',
    source_ready: 'Saisie de production',
    quantite: 'Quantité',
    prix_unitaire: 'Prix unitaire',
    date: 'Date du paiement',
    montant: 'Montant du paiement',
    type: 'Mode de paiement',
    id_lc: 'Lettre de crédit',
  };
  if (path === 'lignes') return 'Produit et paiement';
  return `${labels[field] || 'Information requise'}${['id_client', 'id_fournisseur', 'date_transaction', 'date_echeance', 'type_entite'].includes(field) ? '' : lineSuffix}`;
};

const getFieldErrorPaths = (errors, prefix = '') => {
  if (!errors || typeof errors !== 'object') return [];
  if (typeof errors.message === 'string') return prefix ? [prefix] : [];
  return Object.entries(errors).flatMap(([key, value]) => {
    if (['ref', 'type', 'types', 'root'].includes(key)) return [];
    return getFieldErrorPaths(value, prefix ? `${prefix}.${key}` : key);
  });
};

const mapApiLocationToFormPath = (location) => {
  if (!Array.isArray(location)) return null;
  const parts = location.filter((part) => !['body', 'query', 'path'].includes(part));
  const itemsIndex = parts.indexOf('items');
  const transactionIndex = parts.indexOf('transaction');
  const paymentsIndex = parts.indexOf('paiements');
  const rowIndex = itemsIndex >= 0
    ? Number(parts[itemsIndex + 1] || 0)
    : transactionIndex > 0
      ? Number(parts[transactionIndex - 1] || 0)
      : Number(parts[0] || 0);
  const field = parts.at(-1);
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || !field) return null;
  if (paymentsIndex >= 0) {
    const paymentIndex = Number(parts[paymentsIndex + 1] || 0);
    const paymentField = {
      date_paiement: 'date',
      type_paiement: 'type',
      reference_virement: 'reference',
    }[field] || field;
    return `lignes.${rowIndex}.paiements.${Number.isInteger(paymentIndex) ? paymentIndex : 0}.${paymentField}`;
  }
  const transactionFields = ['date_transaction', 'date_echeance', 'id_client', 'id_fournisseur'];
  if (transactionFields.includes(field)) return field;
  const lineField = {
    id_produit: 'id_produit',
    quantite: 'quantite',
    prix_unitaire: 'prix_unitaire',
    id_batiment: 'id_batiment',
    id_production: 'id_production',
  }[field];
  return lineField ? `lignes.${rowIndex}.${lineField}` : null;
};

const localizeValidationMessage = (message) => {
  if (/^field required$/i.test(message || '')) return 'Champ obligatoire.';
  if (/greater than 0|must be positive/i.test(message || '')) return 'La valeur doit être supérieure à 0.';
  return message || 'Champ invalide.';
};

const getFournisseurPaymentType = (fournisseurs, idFournisseur) => {
  const fournisseur = fournisseurs.find(
    (item) => String(item.id_fournisseur) === String(idFournisseur)
  );
  if (fournisseur?.mode_reglement_prefere === 'caisse') return 'cash';
  if (fournisseur?.mode_reglement_prefere === 'banque') return 'virement';
  return null;
};

const createPaymentDefaults = (date = today(), type = 'cash') => ({
  date,
  montant: '',
  type,
  numero_cheque: '',
  banque: '',
  reference: '',
  id_lc: '',
  source_reglement: null,
  id_compte: '',
  notes: '',
});

const createLineDefaults = (prefillBatimentId = '', date = today(), paymentType = 'cash') => ({
  id_produit: '',
  id_production: '',
  date_production: '',
  source_ready: false,
  est_promesse: false,
  date_livraison_prevue: tomorrow(),
  id_batiment: prefillBatimentId || '',
  quantite: undefined,
  prix_unitaire: undefined,
  ajouter_paiement: false,
  paiements: [createPaymentDefaults(date, paymentType)],
});

/**
 * Composant interne pour la sélection d'une Lettre de Crédit dans une ligne de transaction.
 * Encapsule la logique de chargement des LC disponibles pour éviter les mises à jour d'état
 * pendant le rendu du composant parent.
 */
const LcPaymentSelector = ({ index, paymentIndex, control, watch, setValue, loading, formatMontant, animateInvalidFields }) => {
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
      name={`lignes.${index}.paiements.${paymentIndex}.id_lc`}
      control={control}
      rules={{ required: 'Veuillez sélectionner une LC' }}
      render={({ field, fieldState: { error } }) => (
        <TextField
          {...field}
          select
          fullWidth
          label="Choisir une Lettre de Crédit"
          error={!!error}
          sx={getRequiredFieldAnimation(error, animateInvalidFields)}
          helperText={error?.message || (lcs.length === 0 && !fetching ? 'Aucune LC disponible pour ce partenaire' : '')}
          disabled={loading || fetching}
          size="small"
          value={field.value || ''}
          onChange={(e) => {
            field.onChange(e.target.value);
            // Auto-remplissage du montant avec le montant de la LC
            const selectedLc = lcs.find(l => l.id_lc === e.target.value);
            if (selectedLc) {
              setValue(`lignes.${index}.paiements.${paymentIndex}.montant`, parseFloat(selectedLc.montant));
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

const isEggProduct = (produit) => (
  produit?.nom_produit?.trim().toLowerCase().startsWith('oeufs -')
);

/**
 * Composant TransactionForm.
 */
function TransactionForm({
  open = false,
  onClose,
  onSubmit,
  initialValues: providedInitialValues = EMPTY_INITIAL_VALUES,
  loading = false,
  errorMessage = null,
  prefillClientId = null,
  prefillFournisseurId = null,
  prefillBatimentId = null,
  // 'client' (vente) or 'fournisseur' (achat): preselected type for a new transaction.
  initialType = 'client',
}) {
  const initialValues = providedInitialValues?.id_transaction ? providedInitialValues : EMPTY_INITIAL_VALUES;

  // État pour les données de référence
  const [clients, setClients] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [comptesBancaires, setComptesBancaires] = useState([]);
  const [produits, setProduits] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [animateInvalidFields, setAnimateInvalidFields] = useState(false);
  const validationAnimationTimer = useRef(null);

  // État pour gérer les paiements par ligne (tableau de booleans)
  // État pour stocker les paiements existants (en mode édition)
  const [paiementsExistants, setPaiementsExistants] = useState([]);
  const [editReview, setEditReview] = useState(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // Initialiser react-hook-form avec le resolver Yup
  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    setError,
    setFocus,
    clearErrors,
    watch,
    setValue,
    trigger,
    getValues,
  } = useForm({
    resolver: yupResolver(transactionValidationSchema),
    defaultValues: {
      date_transaction: today(),
      date_echeance: getDefaultDueDate(today()),
      type_entite: 'client',
      id_client: '',
      id_fournisseur: '',
      lignes: [createLineDefaults(prefillBatimentId)],
    },
    mode: 'onChange',
  });

  useEffect(() => () => {
    if (validationAnimationTimer.current) clearTimeout(validationAnimationTimer.current);
  }, []);

  // Observer les valeurs du formulaire pour calculer le total
  const watchedLignes = useWatch({ control, name: 'lignes' });
  const watchedTypeEntite = watch('type_entite');
  const watchedFournisseurId = watch('id_fournisseur');
  const isEditingTransaction = Boolean(initialValues?.id_transaction);
  // The server refuses changes to the amounts/identity of a paid transaction, and to the
  // identity of a deferred delivery: lock those fields up front instead of failing on save.
  const financialLocked = isEditingTransaction && paiementsExistants.length > 0;
  const identityLocked = financialLocked || (isEditingTransaction && Boolean(initialValues?.est_promesse));
  useEffect(() => {
    if (!open || isEditingTransaction || watchedTypeEntite !== 'client') return;
    (watchedLignes || []).forEach((line, index, lines) => {
      const stock = saleStockSummary(line, index, lines);
      if (line.est_promesse && stock.ready && stock.pending === 0) {
        setValue(`lignes.${index}.est_promesse`, false, { shouldDirty: true, shouldValidate: true });
      }
    });
  }, [open, isEditingTransaction, watchedTypeEntite, watchedLignes, setValue]);
  const supplierSource = watchedTypeEntite === 'fournisseur'
    ? fournisseurs.find((item) => String(item.id_fournisseur) === String(watchedFournisseurId))?.mode_reglement_prefere || null
    : null;

  // Apply the supplier's saved preference to each payment on new transactions.
  useEffect(() => {
    if (isEditingTransaction || watchedTypeEntite !== 'fournisseur' || !watchedFournisseurId) return;
    const paymentType = getFournisseurPaymentType(fournisseurs, watchedFournisseurId);
    if (!paymentType) return;

    const currentLines = watch('lignes') || [];
    currentLines.forEach((line, lineIndex) => {
      (line.paiements || []).forEach((_, paymentIndex) => {
        setValue(`lignes.${lineIndex}.paiements.${paymentIndex}.type`, paymentType, {
          shouldDirty: true,
        });
      });
    });
  }, [watchedFournisseurId, watchedTypeEntite, fournisseurs, isEditingTransaction, setValue, watch]);

  // Funding follows the supplier, not the method selected for a payment.
  useEffect(() => {
    if (isEditingTransaction && watchedTypeEntite !== 'fournisseur') return;
    (watchedLignes || []).forEach((line, lineIndex) => {
      (line.paiements || []).forEach((payment, paymentIndex) => {
        if (payment.id_paiement) return;
        const path = `lignes.${lineIndex}.paiements.${paymentIndex}`;
        if (isEditingTransaction && !payment.source_reglement && supplierSource) {
          setValue(`${path}.type`, supplierSource === 'banque' ? 'virement' : 'cash');
        }
        if ((payment.source_reglement || null) !== supplierSource) {
          setValue(`${path}.source_reglement`, supplierSource);
        }
        const bankFunded = supplierSource === 'banque' || (!supplierSource && payment.type === 'virement');
        if (!bankFunded && payment.id_compte) setValue(`${path}.id_compte`, '');
        if (supplierSource === 'banque' && !payment.id_compte && comptesBancaires.length === 1) {
          setValue(`${path}.id_compte`, comptesBancaires[0].id_compte);
        }
      });
    });
  }, [watchedLignes, supplierSource, comptesBancaires, isEditingTransaction, watchedTypeEntite, setValue]);


  /**
   * Charge les données de référence (clients, fournisseurs, produits).
   */
  const fetchReferenceData = async (typeEntite = 'client') => {
    setLoadingData(true);
    try {
      const [clientsData, fournisseursData, produitsData, batimentsData, comptesData] = await Promise.all([
        get('/clients', { params: { est_actif: true, limit: 1000 } }),
        get('/fournisseurs', { params: { est_actif: true, limit: 1000 } }),
        getProduitsParType(typeEntite, { est_actif: true, limit: 1000 }),
        get('/batiments'),
        get('/comptes-bancaires'),
      ]);

      setClients(clientsData || []);
      setFournisseurs(fournisseursData || []);
      setProduits(produitsData || []);
      setBatiments(batimentsData || []);
      setComptesBancaires(comptesData || []);
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
          reset({
            date_transaction: initialValues.date_transaction
              ? new Date(initialValues.date_transaction).toISOString().split('T')[0]
              : today(),
            date_echeance: initialValues.date_echeance
              ? new Date(initialValues.date_echeance).toISOString().split('T')[0]
              : getDefaultDueDate(initialValues.date_transaction
                ? new Date(initialValues.date_transaction).toISOString().split('T')[0]
                : today()),
            type_entite: typeEntite,
            id_client: initialValues.id_client || '',
            id_fournisseur: initialValues.id_fournisseur || '',
            lignes: [{
              ...createLineDefaults(initialValues.id_batiment || ''),
              id_produit: initialValues.id_produit || '',
              id_production: initialValues.id_production || '',
              date_production: initialValues.date_production || '',
              id_batiment: initialValues.id_batiment || '',
              quantite: initialValues.quantite || undefined,
              prix_unitaire: initialValues.prix_unitaire || undefined,
              est_promesse: !!initialValues.est_promesse,
              date_livraison_prevue: initialValues.date_livraison_prevue || tomorrow(),
              allocation_automatique: initialValues.allocation_automatique ?? true,
              ajouter_paiement: paiements.length > 0,
              paiements: paiements.length > 0 ? paiements.map(p => ({
                date: new Date(p.date_paiement).toISOString().split('T')[0],
                montant: parseFloat(p.montant),
                type: p.type_paiement,
                numero_cheque: p.numero_cheque || '',
                banque: p.banque || '',
                reference: p.reference_virement || '',
                id_compte: p.id_compte || '',
                source_reglement: p.source_reglement || null,
                id_lc: p.id_lc || '',
                notes: p.notes || '',
                id_paiement: p.id_paiement,
              })) : [createPaymentDefaults()],
            }],
          });
        } else {
          // Mode création : valeurs par défaut ou pré-remplies
          const hasPrefillClient = prefillClientId !== null && prefillClientId !== undefined;
          const hasPrefillFournisseur = prefillFournisseurId !== null && prefillFournisseurId !== undefined;

          reset({
            date_transaction: today(),
            date_echeance: getDefaultDueDate(today()),
            type_entite: hasPrefillClient ? 'client' : hasPrefillFournisseur ? 'fournisseur' : (initialType === 'fournisseur' ? 'fournisseur' : 'client'),
            id_client: hasPrefillClient ? prefillClientId : '',
            id_fournisseur: hasPrefillFournisseur ? prefillFournisseurId : '',
            lignes: [createLineDefaults(prefillBatimentId)],
          });
        }
        clearErrors();
      }
    };

    loadFormData();
  }, [open, initialValues, reset, clearErrors, prefillClientId, prefillFournisseurId, prefillBatimentId, initialType]);

  useEffect(() => {
    setEditReview(null);
    setReviewError('');
  }, [open, initialValues?.id_transaction]);

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
    clearErrors('root');
    try {
      const isEditing = initialValues && initialValues.id_transaction;

      if (isEditing) {
        // Mode édition : on édite UNE seule transaction
        const transactionData = {
          date_transaction: data.date_transaction,
          date_echeance: data.date_echeance || null,
          id_client: data.type_entite === 'client' ? data.id_client : null,
          id_fournisseur: data.type_entite === 'fournisseur' ? data.id_fournisseur : null,
          ...(data.type_entite === 'client'
            ? { id_production: data.lignes[0].id_production ? Number(data.lignes[0].id_production) : null,
              id_produit: Number(data.lignes[0].id_produit), allocation_automatique: true,
              est_promesse: !!data.lignes[0].est_promesse,
              date_livraison_prevue: data.lignes[0].est_promesse ? data.lignes[0].date_livraison_prevue : null }
            : { id_produit: Number(data.lignes[0].id_produit) }),
          id_batiment: data.type_entite === 'client' && data.lignes[0].id_batiment ? parseInt(data.lignes[0].id_batiment) : null,
          quantite: parseInt(data.lignes[0].quantite),
          prix_unitaire: parseFloat(data.lignes[0].prix_unitaire),
          est_actif: initialValues.est_actif !== undefined ? initialValues.est_actif : true,
        };

        // Passer aussi les données de paiement pour que le parent les gère
        const paiementsData = data.lignes[0].ajouter_paiement ? data.lignes[0].paiements.map(p => ({
          id_paiement: p.id_paiement || null,
          date_paiement: p.date,
          montant: parseFloat(p.montant),
          type_paiement: p.type,
          numero_cheque: p.numero_cheque || null,
          banque: p.banque || null,
          reference_virement: p.reference || null,
          id_compte: p.id_compte ? parseInt(p.id_compte, 10) : null,
          source_reglement: p.source_reglement || null,
          id_lc: p.id_lc || null,
          notes: p.notes || null,
        })) : [];

        if (paiementsExistants.length > 0) {
          // Paid sales accept operational edits only. Omit unchanged financial
          // fields so saving a delivery date does not look like rewriting a sale.
          const numericFields = ['id_production', 'id_batiment', 'id_cycle', 'id_produit',
            'quantite', 'prix_unitaire', 'montant_total', 'id_client', 'id_fournisseur'];
          const numberOrNull = value => value == null || value === '' ? null : Number(value);
          numericFields.forEach(key => {
            if (key in transactionData && numberOrNull(transactionData[key]) === numberOrNull(initialValues[key])) delete transactionData[key];
          });
          if (transactionData.date_transaction === initialValues.date_transaction?.slice(0, 10)) delete transactionData.date_transaction;
        }
        // Read-only client-side review: existing API applies final validations.
        setReviewError('');
        setEditReview({ payload: { ...transactionData, paiements: paiementsData } });
      } else {
        // Mode création : on crée N transactions via l'endpoint batch
        const transactionsData = data.lignes.map((ligne) => ({
          date_transaction: data.date_transaction,
          date_echeance: data.date_echeance || null,
          id_client: data.type_entite === 'client' ? data.id_client : null,
          id_fournisseur: data.type_entite === 'fournisseur' ? data.id_fournisseur : null,
          ...(data.type_entite === 'client'
            ? { id_production: ligne.id_production ? Number(ligne.id_production) : null,
              id_produit: Number(ligne.id_produit), allocation_automatique: true,
              est_promesse: !!ligne.est_promesse,
              date_livraison_prevue: ligne.est_promesse ? ligne.date_livraison_prevue : null }
            : { id_produit: Number(ligne.id_produit) }),
          id_batiment: data.type_entite === 'client' && ligne.id_batiment ? parseInt(ligne.id_batiment) : null,
          quantite: parseInt(ligne.quantite),
          prix_unitaire: parseFloat(ligne.prix_unitaire),
          est_actif: true,
        }));

        // Appeler le callback onSubmit avec le tableau de transactions et les données des lignes (pour les paiements)
        await onSubmit({ batch: true, transactions: transactionsData, lignesData: data.lignes });
      }

      // Keep the edit draft until review confirmation succeeds.
      if (!isEditing) reset();
    } catch (error) {
      // Gérer les erreurs de validation serveur
      if (error?.data?.detail) {
        const detail = error.data.detail;

        if (Array.isArray(detail)) {
          const mappedPaths = [];
          detail.forEach((apiError) => {
            const fieldPath = mapApiLocationToFormPath(apiError.loc);
            if (!fieldPath) return;
            mappedPaths.push(fieldPath);
            setError(fieldPath, {
              type: 'server',
              message: localizeValidationMessage(apiError.msg),
            });
          });
          const uniquePaths = [...new Set(mappedPaths)];
          setError('root', {
            type: 'server',
            message: uniquePaths.length
              ? `À compléter ou corriger : ${uniquePaths.map((path) => getFieldLabel(path, watchedTypeEntite)).join(', ')}.`
              : 'La transaction contient un champ obligatoire manquant. Vérifiez les champs signalés.',
          });
        } else if (typeof detail === 'string') {
          const isGenericRequired = /field required|field is required/i.test(detail);
          setError('root', {
            type: 'server',
            message: isGenericRequired
              ? 'Une information obligatoire manque. Vérifiez les champs signalés en rouge.'
              : detail,
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

  const confirmEditReview = async () => {
    if (!editReview || reviewSaving || loading) return;
    setReviewSaving(true);
    setReviewError('');
    try {
      await onSubmit(editReview.payload);
      setEditReview(null);
      reset();
    } catch (error) {
      setReviewError(error?.message || 'Impossible d’enregistrer les modifications.');
    } finally {
      setReviewSaving(false);
    }
  };

  // RHF skips handleFormSubmit when schema validation fails. Without an
  // invalid-submit callback, errors on conditionally hidden fields look like
  // a dead submit button to the user.
  const findFirstErrorPath = (node, prefix = '') => {
    if (!node || typeof node !== 'object') return null;
    if (typeof node.message === 'string') return prefix;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'ref' || key === 'type' || key === 'types') continue;
      const path = prefix ? `${prefix}.${key}` : key;
      const result = findFirstErrorPath(value, path);
      if (result) return result;
    }
    return null;
  };

  const focusValidationField = (path) => {
    setFocus(path);
    const field = [...document.querySelectorAll('[name]')].find((element) => element.name === path);
    const formControl = field?.closest('.MuiFormControl-root');
    const visibleControl = formControl?.querySelector('[role="combobox"]') || field;
    window.requestAnimationFrame(() => {
      visibleControl?.focus?.();
      (formControl || visibleControl)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    });
  };

  const handleInvalidSubmit = (formErrors) => {
    if (validationAnimationTimer.current) clearTimeout(validationAnimationTimer.current);
    setAnimateInvalidFields(false);
    validationAnimationTimer.current = setTimeout(() => {
      setAnimateInvalidFields(true);
      validationAnimationTimer.current = setTimeout(() => {
        setAnimateInvalidFields(false);
        validationAnimationTimer.current = null;
      }, 460);
    }, 20);
    const firstErrorPath = findFirstErrorPath(formErrors);
    const invalidPaths = getFieldErrorPaths(formErrors);
    const invalidLabels = [...new Set(invalidPaths.map((path) => getFieldLabel(path, watchedTypeEntite)))];
    setError('root', {
      type: 'validation',
      message: invalidLabels.length
        ? `À compléter ou corriger : ${invalidLabels.join(', ')}.`
        : 'Vérifiez les champs signalés en rouge.',
    });
    if (firstErrorPath) setTimeout(() => focusValidationField(firstErrorPath), 0);
  };

  /**
   * Gère la fermeture de la modal.
   */
  const handleClose = () => {
    if (!loading) {
      reset();
      clearErrors();
      setEditReview(null);
      setReviewError('');
      onClose();
    }
  };

  /**
   * Ajoute une nouvelle ligne au formulaire.
   */
  const handleAddLine = () => {
    const currentLignes = watch('lignes') || [];
    const paymentType = watchedTypeEntite === 'fournisseur'
      ? getFournisseurPaymentType(fournisseurs, watchedFournisseurId) || 'cash'
      : 'cash';
    setValue('lignes', [...currentLignes, createLineDefaults(
      prefillBatimentId,
      watch('date_transaction') || today(),
      paymentType
    )], {
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
  const handleTypeEntiteChange = async (newType) => {
    setValue('type_entite', newType, { shouldDirty: true });
    setValue('id_client', '', { shouldDirty: true });
    setValue('id_fournisseur', '', { shouldDirty: true });
    setValue('lignes', [createLineDefaults()], { shouldDirty: true });

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
  const montantPaye = (watchedLignes || []).reduce(
    (sum, ligne) => ligne.ajouter_paiement
      ? sum + (ligne.paiements || []).reduce((ligneSum, paiement) => ligneSum + (parseFloat(paiement.montant) || 0), 0)
      : sum,
    0
  );
  const montantRestant = Math.max(0, montantTotal - montantPaye);
  const theme = useTheme();
  // Full-screen form on phones (it used to be a floating card scrolled inside the page).
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const isSale = watchedTypeEntite === 'client';
  const isEditing = initialValues && initialValues.id_transaction;

  const saleBlocked = watchedTypeEntite === 'client' && (watchedLignes || []).some((line, index, lines) => {
    const stock = saleStockSummary(line, index, lines);
    return !stock.ready || (stock.pending > 0 && !line.est_promesse);
  });
  const renderLinePayment = (ligne, index) => {
    const ligneTotal = (Number(ligne.quantite) || 0) * (Number(ligne.prix_unitaire) || 0);
    return <>
      <Grid item xs={12}>
        <Divider />
      </Grid>

      {/* Paiement */}
      <Grid item xs={12}>
        <Controller
          name={`lignes.${index}.ajouter_paiement`}
          control={control}
          render={({ field }) => (
            <RadioGroup
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                gap: 1,
              }}
              value={field.value ? 'now' : 'later'}
              onChange={(event) => {
                const shouldPayNow = event.target.value === 'now';
                field.onChange(shouldPayNow);
                if (shouldPayNow && ligneTotal > 0) {
                  const existingPaiements = watch(`lignes.${index}.paiements`);
                  if (!existingPaiements || existingPaiements.length === 0) {
                    setValue(`lignes.${index}.paiements`, [
                      createPaymentDefaults(
                        watch('date_transaction') || today(),
                        watchedTypeEntite === 'fournisseur'
                          ? getFournisseurPaymentType(fournisseurs, watchedFournisseurId) || 'cash'
                          : 'cash'
                      ),
                    ]);
                    setValue(`lignes.${index}.paiements.0.montant`, ligneTotal);
                  } else {
                    setValue(`lignes.${index}.paiements.0.montant`, ligneTotal);
                    setValue(
                      `lignes.${index}.paiements.0.date`,
                      watch('date_transaction') || today()
                    );
                  }
                }
              }}
              aria-label="Choix du paiement"
            >
              <FormControlLabel
                value="now"
                sx={{
                  m: 0,
                  px: 1,
                  py: 0.5,
                  minHeight: 48,
                  border: '1px solid',
                  borderRadius: 1.5,
                  borderColor: field.value ? 'primary.main' : 'divider',
                  bgcolor: field.value ? 'action.selected' : 'background.paper',
                  '& .MuiFormControlLabel-label': { fontWeight: field.value ? 700 : 500 },
                  '&:has(.Mui-focusVisible)': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                }}
                control={<Radio size="small" />}
                label="Payer maintenant"
                disabled={loading}
              />
              <FormControlLabel
                value="later"
                sx={{
                  m: 0,
                  px: 1,
                  py: 0.5,
                  minHeight: 48,
                  border: '1px solid',
                  borderRadius: 1.5,
                  borderColor: !field.value ? 'primary.main' : 'divider',
                  bgcolor: !field.value ? 'action.selected' : 'background.paper',
                  '& .MuiFormControlLabel-label': { fontWeight: !field.value ? 700 : 500 },
                  '&:has(.Mui-focusVisible)': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                }}
                control={<Radio size="small" />}
                label="À régler plus tard"
                disabled={loading}
              />
            </RadioGroup>
          )}
        />
      </Grid>

      {/* Champs de paiement conditionnels */}
      <Grid item xs={12} sx={{ display: watch(`lignes.${index}.ajouter_paiement`) ? 'block' : 'none' }}>
        <Collapse in={!!watch(`lignes.${index}.ajouter_paiement`)}>
          <Box sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: 'grey.50', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle2" color="text.primary" fontWeight={700}>
                Paiement
              </Typography>
              <Button
                size="small"
                disabled={loading}
                startIcon={<AddIcon />}
                onClick={() => {
                  const currentPaiements = watch(`lignes.${index}.paiements`) || [];
                  setValue(`lignes.${index}.paiements`, [
                    ...currentPaiements,
                    createPaymentDefaults(
                      watch('date_transaction') || today(),
                      watchedTypeEntite === 'fournisseur'
                        ? getFournisseurPaymentType(fournisseurs, watchedFournisseurId) || 'cash'
                        : 'cash'
                    ),
                  ]);
                }}
              >
                Ajouter un paiement
              </Button>
            </Box>

            {ligne.paiements?.map((paiement, pIndex) => (
              <Box key={pIndex} sx={{ mb: 2, pb: 2, borderBottom: pIndex < ligne.paiements.length - 1 ? '1px dashed #ccc' : 'none' }}>
                {paiement.source_reglement && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Source débitée : {paiement.source_reglement === 'banque' ? 'compte bancaire' : 'caisse'}.
                    Le type de paiement peut être choisi indépendamment.
                  </Alert>
                )}
                {ligne.paiements.length > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="caption" fontWeight="bold">Paiement #{pIndex + 1}</Typography>

                    <IconButton size="small" color="error" disabled={loading} aria-label={`Supprimer le paiement ${pIndex + 1}`} onClick={() => {
                      const newPaiements = ligne.paiements.filter((_, i) => i !== pIndex);
                      setValue(`lignes.${index}.paiements`, newPaiements);
                    }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                </Box>
                )}
                <Grid container spacing={2}>
                  {/* Montant */}
                  <Grid item xs={12} sm={6} md={4}>
                    <Controller
                      name={`lignes.${index}.paiements.${pIndex}.montant`}
                      control={control}
                      render={({ field, fieldState: { error } }) => (
                        <TextField
                          {...field}
                          fullWidth
                          label="Montant (MAD)"
                          type="text"
                          error={!!error}
                          sx={getRequiredFieldAnimation(error, animateInvalidFields)}
                          helperText={error?.message}
                          disabled={loading}
                          inputProps={{ ...DECIMAL_INPUT_PROPS, step: '0.01', min: '0.01' }}
                          InputLabelProps={{ shrink: true }}
                          size="small"
                        />
                      )}
                    />
                  </Grid>

                  {/* Type de paiement */}
                  <Grid item xs={12} sm={6} md={4}>
                    <Controller
                      name={`lignes.${index}.paiements.${pIndex}.type`}
                      control={control}
                      render={({ field, fieldState: { error } }) => (
                        <TextField
                          {...field}
                          select
                          fullWidth
                          label="Mode de paiement"
                          error={!!error}
                          sx={getRequiredFieldAnimation(error, animateInvalidFields)}
                          helperText={error?.message}
                          disabled={loading}
                          size="small"
                          onChange={(event) => {
                            field.onChange(event);
                            if (event.target.value !== 'virement' && paiement.source_reglement !== 'banque') {
                              setValue(`lignes.${index}.paiements.${pIndex}.id_compte`, '');
                            }
                          }}
                        >
                          <MenuItem value="cash">
                            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, verticalAlign: 'middle' }}>
                              <PaymentsIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                              <Box component="span">Espèces</Box>
                            </Box>
                          </MenuItem>
                          <MenuItem value="cheque">
                            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, verticalAlign: 'middle' }}>
                              <ChequeIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                              <Box component="span">Chèque</Box>
                            </Box>
                          </MenuItem>
                          <MenuItem value="virement">
                            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, verticalAlign: 'middle' }}>
                              <BankTransferIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                              <Box component="span">Virement</Box>
                            </Box>
                          </MenuItem>
                          <MenuItem value="lc">
                            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, verticalAlign: 'middle' }}>
                              <CreditLetterIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                              <Box component="span">Lettre de Crédit</Box>
                            </Box>
                          </MenuItem>
                        </TextField>
                      )}
                    />
                  </Grid>

                  {/* Date du paiement */}
                  <Grid item xs={12} md={4}>
                    <Controller
                      name={`lignes.${index}.paiements.${pIndex}.date`}
                      control={control}
                      render={({ field, fieldState: { error } }) => (
                        <DateField
                          {...field}
                          fullWidth
                          label="Date du paiement"

                          error={!!error}
                          sx={getRequiredFieldAnimation(error, animateInvalidFields)}
                          helperText={error?.message}
                          disabled={loading}
                          InputLabelProps={{ shrink: true }}
                          size="small"
                        />
                      )}
                    />
                  </Grid>

                  {/* Champs conditionnels */}
                  {paiement.type === 'cheque' && (
                    <>
                      <Grid item xs={12} sm={6}>
                        <Controller
                          name={`lignes.${index}.paiements.${pIndex}.numero_cheque`}
                          control={control}
                          render={({ field }) => (
                            <TextField {...field} fullWidth label="N° Chèque" disabled={loading} size="small" />
                          )}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Controller
                          name={`lignes.${index}.paiements.${pIndex}.banque`}
                          control={control}
                          render={({ field }) => (
                            <TextField {...field} fullWidth label="Banque" disabled={loading} size="small" />
                          )}
                        />
                      </Grid>
                    </>
                  )}

                  {(paiement.source_reglement === 'banque' || (!paiement.source_reglement && paiement.type === 'virement')) && (
                    <>
                      <Grid item xs={12} sm={6}>
                        <Controller
                          name={`lignes.${index}.paiements.${pIndex}.id_compte`}
                          control={control}
                          render={({ field, fieldState: { error } }) => (
                            <TextField
                              {...field}
                              select
                              fullWidth
                              required={!isEditingTransaction || (watchedTypeEntite === 'fournisseur' && !paiement.id_paiement)}
                              label="Compte bancaire"
                              error={!!error}
                              helperText={error?.message || (comptesBancaires.length ? '' : 'Aucun compte bancaire configuré')}
                              disabled={loading || (isEditingTransaction && (watchedTypeEntite !== 'fournisseur' || Boolean(paiement.id_paiement))) || comptesBancaires.length === 0}
                              size="small"
                              value={field.value || ''}
                              onChange={(event) => field.onChange(event.target.value)}
                            >
                              <MenuItem value=""><em>Sélectionner un compte</em></MenuItem>
                              {comptesBancaires.map((compte) => (
                                <MenuItem key={compte.id_compte} value={compte.id_compte}>
                                  {compte.nom_banque} · {compte.numero_compte}
                                </MenuItem>
                              ))}
                            </TextField>
                          )}
                        />
                      </Grid>
                    </>
                  )}
                  {paiement.type === 'virement' && (
                    <>
                      <Grid item xs={12} sm={6}>
                        <Controller
                          name={`lignes.${index}.paiements.${pIndex}.reference`}
                          control={control}
                          render={({ field }) => (
                            <TextField {...field} fullWidth label="Référence" disabled={loading} size="small" />
                          )}
                        />
                      </Grid>
                    </>
                  )}

                  {paiement.type === 'lc' && (
                    <Grid item xs={12}>
                      <LcPaymentSelector
                        index={index}
                        paymentIndex={pIndex}
                        control={control}
                        watch={watch}
                        setValue={setValue}
                        loading={loading}
                        formatMontant={formatMontant}
                        animateInvalidFields={animateInvalidFields}
                      />
                    </Grid>
                  )}
                </Grid>
              </Box>
            ))}

            <Box sx={{
              mt: 1,
              pt: 1.5,
              borderTop: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1,
            }}>
              <Typography variant="body2" color="text.secondary">
                Total du produit : <Box component="span" fontWeight={600} color="text.primary">{formatMontant(ligneTotal, { minimumFractionDigits: 2, useCompactNotation: false })}</Box>
              </Typography>
              <Typography variant="body2" fontWeight={700}>
                Reste à régler : <Box component="span" color="primary.main">{formatMontant(Math.max(0, ligneTotal - (ligne.paiements || []).reduce((acc, paiement) => acc + (parseFloat(paiement.montant) || 0), 0)), { minimumFractionDigits: 2, useCompactNotation: false })}</Box>
              </Typography>
            </Box>
          </Box>
        </Collapse>
      </Grid>
    </>;
  };
  const totalsAndActions = (
    <Box sx={{
      display: 'flex',
      flexDirection: { xs: 'column', md: 'row' },
      alignItems: { xs: 'stretch', md: 'center' },
      justifyContent: 'space-between',
      gap: { xs: 1.5, md: 3 },
      width: '100%',
      minWidth: 0,
    }}>
      <Box
        role="group"
        aria-label="Récapitulatif des montants"
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          flex: '1 1 auto',
          minWidth: 0,
          gap: { xs: 1, sm: 2, md: 2.5 },
          '& > div': { minWidth: 0 },
        }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {isSale ? 'Montant de la vente' : 'Montant de l’achat'}
          </Typography>
          <Typography variant="subtitle1" fontWeight={800} sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {formatMontant(montantTotal, { minimumFractionDigits: 2, useCompactNotation: false })}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Déjà payé</Typography>
          <Typography variant="subtitle1" fontWeight={700} sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {formatMontant(montantPaye, { minimumFractionDigits: 2, useCompactNotation: false })}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Reste à payer</Typography>
          <Typography variant="subtitle1" fontWeight={800} color="primary.main" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {formatMontant(montantRestant, { minimumFractionDigits: 2, useCompactNotation: false })}
          </Typography>
        </Box>
      </Box>
      <Box sx={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        justifyContent: 'flex-end',
        gap: 1,
        width: { xs: '100%', md: 'auto' },
        flexShrink: 0,
      }}>
        <Button onClick={handleClose} disabled={loading} color="inherit" sx={{ whiteSpace: 'nowrap' }}>
          Annuler
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={loading || !isDirty || saleBlocked}
          startIcon={loading ? <CircularProgress size={16} /> : null}
          sx={{ whiteSpace: 'nowrap', minWidth: { md: 180 }, flex: { xs: 1, md: 'initial' } }}
        >
          {loading
            ? 'Enregistrement...'
            : isEditing
              ? 'Enregistrer les modifications'
              : isSale
                ? 'Enregistrer la vente'
                : "Enregistrer l’achat"}
        </Button>
      </Box>
    </Box>
  );

  return (
    <>
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isPhone}
      PaperProps={{
        // Let React Hook Form render consistent French errors for every required field.
        component: 'form',
        noValidate: true,
        onSubmit: handleSubmit(handleFormSubmit, handleInvalidSubmit),
        sx: {
          minHeight: { xs: 0, sm: '640px' },
          maxHeight: { xs: '100%', sm: '90vh' },
          borderRadius: { xs: 0, sm: 4 },
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
        <DialogTitle
          sx={{
            px: { xs: 2, md: 3 },
            py: 2,
            background: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 2,
            }}
          >
            <Box>
              <Typography
                component="div"
                sx={{
                  fontSize: { xs: '1.25rem', md: '1.5rem' },
                  fontWeight: 900,
                  letterSpacing: '-0.03em',
                }}
              >
                {isEditing
                  ? `${isSale ? 'Modifier la vente' : 'Modifier l’achat'} n° ${initialValues.id_transaction}`
                  : 'Nouvelle transaction'}
              </Typography>
              {isEditing && identityLocked && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {financialLocked
                  ? 'Déjà payée en partie : seules l’échéance et les paiements peuvent changer.'
                  : 'Livraison différée : le client, la date, le bâtiment et le type d’œufs sont fixes.'}
              </Typography>}
            </Box>
            <IconButton onClick={handleClose} disabled={loading} aria-label="Fermer" sx={{ mt: -0.5, mr: -0.5, borderRadius: 2 }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers sx={{ backgroundColor: 'background.default', px: { xs: 1.5, sm: 2, md: 3 }, py: { xs: 1.5, sm: 2 } }}>
          {/* Afficher l'erreur serveur générale si présente */}
          {(errorMessage || errors.root) && (() => {
            const fieldPaths = [...new Set(getFieldErrorPaths(errors))];
            const genericError = /field required|field is required/i.test(errorMessage || '');
            const summary = fieldPaths.length
              ? `À compléter ou corriger : ${fieldPaths.map((path) => getFieldLabel(path, watchedTypeEntite)).join(', ')}.`
              : genericError
                ? 'Une information obligatoire manque. Vérifiez les champs signalés en rouge.'
                : shortServerError(errors.root?.message || errorMessage);
            return (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                <Typography fontWeight={800}>{summary}</Typography>
                {fieldPaths.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
                    {fieldPaths.map((fieldPath) => (
                      <Button
                        key={fieldPath}
                        size="small"
                        color="error"
                        variant="outlined"
                        onClick={() => focusValidationField(fieldPath)}
                        sx={{ borderRadius: 5, textTransform: 'none', fontWeight: 700 }}
                      >
                        {getFieldLabel(fieldPath, watchedTypeEntite)} · Aller au champ
                      </Button>
                    ))}
                  </Box>
                )}
              </Alert>
            );
          })()}

          {loadingData ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ mt: 1 }}>
              {!isEditing && <Controller
                name="type_entite"
                control={control}
                render={({ field }) => (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 1.5,
                      mb: 2,
                    }}
                  >
                    {[
                      {
                        value: 'client',
                        title: 'Vente client',
                        disabled: prefillFournisseurId !== null && prefillFournisseurId !== undefined,
                        activeColor: 'primary.main',
                        activeBg: 'rgba(13, 148, 136, 0.05)',
                      },
                      {
                        value: 'fournisseur',
                        title: 'Achat fournisseur',
                        disabled: prefillClientId !== null && prefillClientId !== undefined,
                        activeColor: 'primary.main',
                        activeBg: 'rgba(13, 148, 136, 0.05)',
                      },
                    ].map((option) => {
                      const isSelected = field.value === option.value;
                      return (
                        <Box
                          key={option.value}
                          role="button"
                          tabIndex={option.disabled || loading ? -1 : 0}
                          onClick={() => {
                            if (!option.disabled && !loading) {
                              handleTypeEntiteChange(option.value);
                            }
                          }}
                          onKeyDown={(event) => {
                            if ((event.key === 'Enter' || event.key === ' ') && !option.disabled && !loading) {
                              event.preventDefault();
                              handleTypeEntiteChange(option.value);
                            }
                          }}
                          sx={{
                            p: { xs: 1, sm: 1.5 },
                            minHeight: { xs: 48, sm: 68 },
                            borderRadius: 3,
                            border: '2px solid',
                            borderColor: isSelected ? option.activeColor : 'divider',
                            backgroundColor: isSelected ? option.activeBg : 'background.paper',
                            opacity: option.disabled || loading ? 0.55 : 1,
                            cursor: option.disabled || loading ? 'not-allowed' : 'pointer',
                            transition: 'all 160ms ease',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            '&:hover': {
                              borderColor: option.disabled || loading ? 'divider' : option.activeColor,
                              transform: option.disabled || loading ? 'none' : 'translateY(-1px)',
                            },
                          }}
                        >
                          <Typography sx={{ fontSize: 16, fontWeight: 800 }}>
                            {option.title}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              />}
              {errors.type_entite && (
                <FormHelperText error>{errors.type_entite.message}</FormHelperText>
              )}

              <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, borderRadius: 2.5, bgcolor: 'background.paper' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
                  <Box sx={{ width: 26, height: 26, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800 }}>1</Box>
                  <Typography variant="subtitle1" fontWeight={800}>{isSale ? 'Client et dates' : 'Fournisseur et dates'}</Typography>
                </Box>
                <Grid container spacing={1.25}>
                  <Grid item xs={12} md={6}>
              {/* Sélection Client OU Fournisseur */}
              <FormControl component="fieldset" margin="dense" fullWidth error={!!errors.type_entite} sx={{ display: 'none' }}>
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
                    <TextField
                      {...field}
                      select
                      fullWidth
                      required
                      label="Client"
                      margin="dense"
                      size="small"
                      error={!!error}
                      sx={getRequiredFieldAnimation(error, animateInvalidFields)}
                      helperText={error?.message}
                      disabled={loading || identityLocked || (prefillClientId !== null && prefillClientId !== undefined)}
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
                    </TextField>
                  )}
                />
              )}

              {/* Sélection Fournisseur */}
              {watchedTypeEntite === 'fournisseur' && (
                <Controller
                  name="id_fournisseur"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <TextField
                      {...field}
                      select
                      fullWidth
                      required
                      label="Fournisseur"
                      margin="dense"
                      size="small"
                      error={!!error}
                      sx={getRequiredFieldAnimation(error, animateInvalidFields)}
                      helperText={error?.message}
                      disabled={loading || identityLocked || (prefillFournisseurId !== null && prefillFournisseurId !== undefined)}
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
                    </TextField>
                  )}
                />
              )}

                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
              {/* Date de transaction */}
              <Controller
                name="date_transaction"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <DateField
                    {...field}
                    onChange={(event) => {
                      const previousDate = field.value;
                      const nextDate = event.target.value;
                      field.onChange(event);
                      const dueDate = watch('date_echeance');
                      if (!dueDate || dueDate === getDefaultDueDate(previousDate || today())) {
                        setValue('date_echeance', getDefaultDueDate(nextDate || today()));
                      }
                    }}
                    fullWidth
                    label="Date de transaction"
                    size="small"
                    error={!!error}
                    sx={getRequiredFieldAnimation(error, animateInvalidFields)}
                    helperText={error?.message || ''}
                    required
                    disabled={loading || identityLocked}
                    margin="dense"
                    variant="outlined"
                    InputLabelProps={{
                      shrink: true,
                    }}
                  />
                )}
              />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
              {/* Date d'échéance (optionnel) */}
              <Controller
                name="date_echeance"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <DateField
                    {...field}
                    fullWidth
                    label="Date d'échéance du paiement (facultatif)"
                    size="small"
                    error={!!error}
                    sx={getRequiredFieldAnimation(error, animateInvalidFields)}
                    helperText={error?.message || ''}
                    disabled={loading}
                    margin="dense"
                    variant="outlined"
                    InputLabelProps={{
                      shrink: true,
                    }}
                  />
                )}
              />
                  </Grid>
                </Grid>
              </Paper>

              <Box>
              {/* Produits et paiements */}
              <Paper variant="outlined" sx={{ mb: 2, p: { xs: 1.25, sm: 2 }, borderRadius: 2.5, backgroundColor: 'background.paper' }}>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    justifyContent: 'space-between',
                    alignItems: { xs: 'stretch', sm: 'center' },
                    gap: 1,
                    mb: 1.5,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ width: 26, height: 26, flexShrink: 0, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800 }}>2</Box>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={800}>{isSale ? 'Œufs vendus' : 'Produits achetés'}</Typography>
                    </Box>
                  </Box>
                  {!isEditing && (
                    <Button
                      variant="outlined"
                      size="small"
                      fullWidth={false}
                      sx={{ alignSelf: { xs: 'stretch', sm: 'auto' } }}
                      startIcon={<AddIcon />}
                      onClick={handleAddLine}
                      disabled={loading}
                    >
                      {watchedTypeEntite === 'client' ? 'Ajouter une ligne de vente' : 'Ajouter un produit'}
                    </Button>
                  )}
                </Box>

                {typeof errors.lignes?.message === 'string' && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {errors.lignes.message}
                  </Alert>
                )}

                {/* Produits de la transaction */}
                <Box sx={{ display: 'grid', gap: 1.5 }}>
                  {watchedLignes?.map((ligne, index) => {
                        const ligneTotal =
                          (parseFloat(ligne.quantite) || 0) *
                          (parseFloat(ligne.prix_unitaire) || 0);
                  const shouldShowBatimentSource = watchedTypeEntite === 'client';
                  const amountFields = (<>
                          {/* Quantité */}
                          <Grid item xs={12} sm={6} md={4}>
                              <Controller
                                name={`lignes.${index}.quantite`}
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                  <TextField
                                    {...field}
                                    fullWidth
                                    label={shouldShowBatimentSource ? "Quantité vendue (œufs) *" : "Quantité *"}
                                    type="text"
                                    inputProps={{ ...DECIMAL_INPUT_PROPS, min: 1, step: 1 }}
                                    value={field.value ?? ''}
                                    error={!!error}
                                    sx={getRequiredFieldAnimation(error, animateInvalidFields)}
                                    helperText={error?.message}
                                    size="small"
                                    disabled={loading || financialLocked}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      field.onChange(value === '' ? undefined : value);
                                      // Mettre à jour le montant du paiement si paiement activé
                                      if (ligne.ajouter_paiement) {
                                        const newTotal = (parseFloat(value) || 0) * (parseFloat(ligne.prix_unitaire) || 0);
                                        setValue(`lignes.${index}.paiements.0.montant`, newTotal);
                                      }
                                    }}
                                    onBlur={field.onBlur}
                                  />
                                )}
                              />
                          </Grid>

                          {/* Prix unitaire */}
                          <Grid item xs={12} sm={6} md={4}>
                              <Controller
                                name={`lignes.${index}.prix_unitaire`}
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                  <TextField
                                    {...field}
                                    fullWidth
                                    label="Prix unitaire (MAD) *"
                                    type="text"
                                    inputProps={{ ...DECIMAL_INPUT_PROPS, min: 0, step: 0.01 }}
                                    value={field.value ?? ''}
                                    error={!!error}
                                    sx={getRequiredFieldAnimation(error, animateInvalidFields)}
                                    helperText={error?.message || ''}
                                    size="small"
                                    disabled={loading || financialLocked}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      field.onChange(value === '' ? undefined : value);
                                      // Mettre à jour le montant du paiement si paiement activé
                                      if (ligne.ajouter_paiement) {
                                        const newTotal = (parseFloat(ligne.quantite) || 0) * (parseFloat(value) || 0);
                                        setValue(`lignes.${index}.paiements.0.montant`, newTotal);
                                      }
                                    }}
                                    onBlur={field.onBlur}
                                  />
                                )}
                              />
                          </Grid>
                  </>);

                        return (
                    <Paper
                      key={index}
                      variant="outlined"
                      sx={{ p: { xs: 1.25, sm: 1.75 }, borderRadius: 2.5, bgcolor: 'background.paper' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25, gap: 1 }}>
                        <Typography variant="subtitle2" fontWeight={800}>{watchedTypeEntite === 'client' ? 'Vente' : 'Produit'} {index + 1}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          {watchedLignes.length > 1 && <Box sx={{ px: 1.25, py: 0.5, bgcolor: 'rgba(13, 148, 136, 0.08)', color: 'primary.main', borderRadius: 1.5 }}>
                            <Typography variant="caption" fontWeight={800} sx={{ whiteSpace: 'nowrap' }}>Total : {formatMontant(ligneTotal, { minimumFractionDigits: 2, useCompactNotation: false })}</Typography>
                          </Box>}
                          {!isEditing && watchedLignes.length > 1 && (
                            <IconButton size="small" color="error" onClick={() => handleRemoveLine(index)} disabled={loading} aria-label={`Supprimer le produit ${index + 1}`}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                      </Box>
                      {shouldShowBatimentSource && <ProductionSourcePicker
                        index={index} control={control} setValue={setValue} batiments={batiments}
                        produits={produits}
                        disabled={loading || identityLocked} transactionId={initialValues.id_transaction}
                        saleDate={isEditingTransaction && ligne.est_promesse ? today() : watch('date_transaction')}>{amountFields}</ProductionSourcePicker>}
                      {shouldShowBatimentSource && <SaleLineDetails
                        line={ligne} index={index} lines={watchedLignes || []} products={produits} control={control}
                        onDeferredChange={(checked) => {
                          // Default planned delivery: the day after the sale (editable).
                          if (checked && !getValues(`lignes.${index}.date_livraison_prevue`)) {
                            setValue(`lignes.${index}.date_livraison_prevue`, tomorrow(getValues('date_transaction')), { shouldDirty: true });
                          }
                          setTimeout(() => trigger(`lignes.${index}.quantite`), 0);
                        }}
                        saleDate={watch('date_transaction')} loading={loading} renderPayment={renderLinePayment} />}
                      <Grid container spacing={1.25}>
                        {!shouldShowBatimentSource && <>
                        {/* Produit */}
                        <Grid item xs={12} md={4}>
                              <Controller
                                name={`lignes.${index}.id_produit`}
                                control={control}
                                render={({ field, fieldState: { error } }) => (
                                <FormControl fullWidth size="small" error={!!error} disabled={loading || financialLocked} sx={getRequiredFieldAnimation(error, animateInvalidFields)}>
                                  <InputLabel id={`ligne-${index}-produit-label`}>{watchedTypeEntite === 'client' ? 'Produit vendu *' : 'Produit acheté *'}</InputLabel>
                                    <Select
                                      {...field}
                                      labelId={`ligne-${index}-produit-label`}
                                      size="small"
                                      value={field.value || ''}
                                    label={watchedTypeEntite === 'client' ? 'Produit vendu *' : 'Produit acheté *'}
                                      disabled={loading || financialLocked}
                                      onChange={(event) => {
                                        field.onChange(event);
                                        const selected = produits.find(p => Number(p.id_produit) === Number(event.target.value));
                                        if (!isEggProduct(selected)) {
                                          setValue(`lignes.${index}.id_batiment`, '');
                                        }
                                      }}
                                    >
                                      <MenuItem value="">
                                      <em>{watchedTypeEntite === 'client' ? 'Sélectionner le produit vendu' : 'Sélectionner le produit acheté'}</em>
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
                                        {error.message === 'Le produit est requis'
                                          ? `Veuillez sélectionner ${watchedTypeEntite === 'client' ? 'le produit vendu' : 'le produit acheté'}.`
                                          : error.message}
                                      </FormHelperText>
                                    )}
                                  </FormControl>
                                )}
                              />
                          </Grid>

                          </>}
                          {!shouldShowBatimentSource && amountFields}

                          {!shouldShowBatimentSource && renderLinePayment(ligne, index)}
                          </Grid>
                    </Paper>
                        );
                  })}
                </Box>
              </Paper>
              </Box>
            </Box>
          )}
        </DialogContent>

        <DialogActions
          sx={{
            px: { xs: 1.5, sm: 3 },
            py: 1.5,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          {totalsAndActions}
        </DialogActions>
    </Dialog>

    <Dialog open={Boolean(editReview && open)}
      onClose={reviewSaving ? undefined : () => setEditReview(null)}
      fullWidth maxWidth="xs" aria-labelledby="edit-review-title">
      <DialogTitle id="edit-review-title">Confirmer la modification</DialogTitle>
      <DialogContent>
        {editReview && (() => {
          const keys = [
            ['date_transaction', 'Date'], ['date_echeance', 'Échéance'],
            ['id_client', 'Client'], ['id_fournisseur', 'Fournisseur'],
            ['id_produit', 'Produit'], ['id_batiment', 'Bâtiment'],
            ['quantite', 'Quantité'], ['prix_unitaire', 'Prix unitaire'],
            ['est_promesse', 'Livraison différée'], ['date_livraison_prevue', 'Livraison prévue'],
          ];
          const normalize = (key, value) => {
            if (value === undefined || value === null || value === '') return null;
            if (key === 'est_promesse') return Boolean(value);
            if (['quantite', 'prix_unitaire', 'id_client', 'id_fournisseur',
              'id_produit', 'id_batiment'].includes(key)) return Number(value);
            if (key.startsWith('date_')) return String(value).slice(0, 10);
            return value;
          };
          const changed = keys.filter(([key]) => key in editReview.payload
            && normalize(key, initialValues[key]) !== normalize(key, editReview.payload[key]));
          const money = (value) => formatMontant(value, { minimumFractionDigits: 2, useCompactNotation: false });
          const labelValue = (key, value) => {
            const v = normalize(key, value);
            if (v === null) return '—';
            if (key === 'est_promesse') return v ? 'Oui' : 'Non';
            if (key.startsWith('date_')) return v.split('-').reverse().join('/');
            if (key === 'prix_unitaire') return money(v);
            if (key === 'quantite') return v.toLocaleString('fr-FR');
            if (key === 'id_client') return clients.find((c) => Number(c.id_client) === v)?.nom_client || '—';
            if (key === 'id_fournisseur') return fournisseurs.find((f) => Number(f.id_fournisseur) === v)?.nom_fournisseur || '—';
            if (key === 'id_produit') return produits.find((p) => Number(p.id_produit) === v)?.nom_produit || '—';
            if (key === 'id_batiment') return batiments.find((b) => Number(b.id_batiment) === v)?.nom || '—';
            return String(v);
          };
          const totalChanged = changed.some(([key]) => ['quantite', 'prix_unitaire'].includes(key));
          const newTotal = Number(editReview.payload.quantite ?? initialValues.quantite)
            * Number(editReview.payload.prix_unitaire ?? initialValues.prix_unitaire);
          const newPayments = (editReview.payload.paiements || []).filter((p) => !p.id_paiement);
          return <Stack spacing={1.25}>
            {changed.length === 0 && newPayments.length === 0 && <Typography variant="body2" color="text.secondary">Rien n’a changé.</Typography>}
            {changed.map(([key, label]) => <Box key={key}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                <Box component="span" sx={{ color: 'text.secondary', textDecoration: 'line-through' }}>{labelValue(key, initialValues[key])}</Box>
                {' → '}
                <Box component="span" fontWeight={800}>{labelValue(key, editReview.payload[key])}</Box>
              </Typography>
            </Box>)}
            {newPayments.length > 0 && <Typography variant="body2">
              {newPayments.length === 1 ? 'Nouveau paiement' : `${newPayments.length} nouveaux paiements`} :{' '}
              <Box component="span" fontWeight={800}>{money(newPayments.reduce((sum, p) => sum + Number(p.montant || 0), 0))}</Box>
            </Typography>}
            {totalChanged && <Typography variant="body2" sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
              Nouveau total : <Box component="span" fontWeight={800}>{money(newTotal)}</Box>
            </Typography>}
            {reviewError && <Alert severity="error">{shortServerError(reviewError)}</Alert>}
          </Stack>;
        })()}
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button color="inherit" disabled={reviewSaving || loading}
          onClick={() => { setEditReview(null); setReviewError(''); }}>Retour</Button>
        <Button variant="contained" disabled={reviewSaving || loading} onClick={confirmEditReview}>
          {reviewSaving || loading ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
}

// Server refusals are long and technical: keep only what the user needs to do.
function shortServerError(message) {
  if (/historique de paiement est immuable/i.test(message)) return 'Cette transaction a déjà un paiement : ce changement est impossible. Annulez-la et créez-en une nouvelle.';
  if (/livraison différée sont fixes/i.test(message)) return 'Livraison différée : ce changement est impossible. Annulez-la et créez-en une nouvelle.';
  if (/inférieure au stock déjà réservé/i.test(message)) return 'La quantité ne peut pas être inférieure aux œufs déjà réservés.';
  return message;
}

export default TransactionForm;
