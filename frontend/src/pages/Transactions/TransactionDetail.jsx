/**
 * Page Détail Transaction.
 * 
 * Affiche les détails complets d'une transaction :
 * - Informations transaction (date, montant, client/fournisseur, produit, quantité, prix unitaire, statut)
 * - Historique d'audit (qui a modifié quoi et quand)
 * - Bouton pour voir l'audit complet
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Card,
  CardContent,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Stack,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { get, post, put, del } from '../../services/api';
import { format } from 'date-fns';
import { formatShortDate } from '../../utils/dateFormatting';
import { formatMontant as formatMontantUtil } from '../../utils/formatNumber';
import PaymentStatusBadge from '../../components/PaymentStatusBadge';
import PaiementForm from '../../components/PaiementForm';
import useNotification from '../../hooks/useNotification';
import { useForm, useFieldArray } from 'react-hook-form';
import MultiPaiementForm from '../../components/PaiementForm/MultiPaiementForm';
import DeferredSaleHistory from './DeferredSaleHistory';
import DeferredSaleCancellationDialog from './DeferredSaleCancellationDialog';
import DeferredSaleFinancialSummary from './DeferredSaleFinancialSummary';
import ReactivationReviewDialog from './ReactivationReviewDialog';
import TransactionForm from './TransactionForm';
import { isPendingPayment, pendingPaymentAmount } from './pendingPayments';
import TransactionEditForm from './TransactionEditForm';
import { deferredCancellationEnabled } from './deferredCancellationAccess';
import TransactionAuditHistory from './TransactionAuditHistory';
import PaymentCorrectionDialog from '../../components/Corrections/PaymentCorrectionDialog';
import RefundDialog from '../../components/Corrections/RefundDialog';
import TransactionCreditPanel from '../../components/Corrections/TransactionCreditPanel';
import CorrectionHistory from '../../components/Corrections/CorrectionHistory';
import DeferredSaleStockSummary from './DeferredSaleStockSummary';
import ExpandableDetails from '../../components/ExpandableDetails';
import DetailRows from '../../components/DetailRows';
import DialogTitleWithClose from '../../components/DialogTitleWithClose';

const CORRECTION_WRITES_ENABLED = import.meta.env.VITE_ENABLE_CORRECTION_WRITES === 'true';
const CREDIT_REFUNDS_ENABLED = import.meta.env.VITE_ENABLE_CREDIT_REFUND_WRITES === 'true';

/**
 * Composant TransactionDetail.
 */
// Readable labels for payment and cheque statuses (the API returns codes such as 'en_attente').
const PAYMENT_STATUS_LABELS = { valide: 'Validé', en_attente: 'En attente', annule: 'Annulé', rejete: 'Rejeté' };
const CHEQUE_STATUS_LABELS = { a_encaisser: 'À encaisser', emis: 'Émis', en_attente: 'En attente', encaisse: 'Encaissé', rejete: 'Rejeté', annule: 'Annulé' };
const readableStatus = (code) => {
  if (!code) return '—';
  const text = String(code).replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

function TransactionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fromDeliveries = new URLSearchParams(location.search).get('from') === 'deliveries';
  const returnPath = fromDeliveries ? `/livraisons-a-suivre?vente=${id}` : '/transactions';
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const notification = useNotification();
  
  // États pour les données
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // États pour les paiements
  const [paiements, setPaiements] = useState([]);
  const [statutPaiement, setStatutPaiement] = useState(null);
  const [loadingPaiements, setLoadingPaiements] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [cancelRemainderOpen, setCancelRemainderOpen] = useState(false);
  const [reactivationOpen, setReactivationOpen] = useState(false);
  const [cancellationReceipt, setCancellationReceipt] = useState(null);

  // États pour les données de référence
  const [produits, setProduits] = useState([]);
  const [clients, setClients] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);

  // État pour la modal d'ajout/édition de paiement
  const [paiementDialogOpen, setPaiementDialogOpen] = useState(false);
  const [editingPaiement, setEditingPaiement] = useState(null);
  
  // État pour la confirmation de suppression de paiement
  const [deletePaiementDialogOpen, setDeletePaiementDialogOpen] = useState(false);
  const [paiementToDelete, setPaiementToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  /**
   * Crée des maps de lookup pour produits, clients et fournisseurs.
   */
  const produitsMap = useMemo(() => {
    const map = new Map();
    produits.forEach((produit) => {
      map.set(produit.id_produit, produit.nom_produit);
    });
    return map;
  }, [produits]);

  const clientsMap = useMemo(() => {
    const map = new Map();
    clients.forEach((client) => {
      map.set(client.id_client, client.nom_client);
    });
    return map;
  }, [clients]);

  const fournisseursMap = useMemo(() => {
    const map = new Map();
    fournisseurs.forEach((fournisseur) => {
      map.set(fournisseur.id_fournisseur, fournisseur.nom_fournisseur);
    });
    return map;
  }, [fournisseurs]);

  /**
   * Charge les données de référence (produits, clients, fournisseurs).
   */
  const fetchReferenceData = async () => {
    try {
      const [produitsData, clientsData, fournisseursData] = await Promise.all([
        get('/produits', { params: { limit: 1000, est_actif: true } }),
        get('/clients', { params: { limit: 1000, est_actif: true } }),
        get('/fournisseurs', { params: { limit: 1000 } }),
      ]);
      setProduits(produitsData || []);
      setClients(clientsData || []);
      setFournisseurs(fournisseursData || []);
    } catch (err) {
      console.error('Erreur lors du chargement des données de référence:', err);
    }
  };

  /**
   * Charge les détails de la transaction.
   */
  const fetchTransaction = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await get(`/transactions/${id}`);
      setTransaction(data);
    } catch (err) {
      console.error('Erreur lors du chargement de la transaction:', err);
      setError(err?.message || 'Une erreur est survenue lors du chargement de la transaction');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Charge les paiements de la transaction.
   */
  const fetchPaiements = async () => {
    setLoadingPaiements(true);
    try {
      const data = await get(`/paiements`, {
        params: { id_transaction: id },
      });
      setPaiements(data || []);
    } catch (err) {
      console.error('Erreur lors du chargement des paiements:', err);
    } finally {
      setLoadingPaiements(false);
    }
  };

  /**
   * Charge le statut de paiement de la transaction.
   */
  const fetchStatutPaiement = async () => {
    try {
      const data = await get(`/paiements/transaction/${id}/statut`);
      setStatutPaiement(data);
    } catch (err) {
      console.error('Erreur lors du chargement du statut de paiement:', err);
    }
  };

  /**
   * Rafraîchit les données de paiement.
   */
  const refreshPaiements = async () => {
    await Promise.all([
      fetchTransaction(),
      fetchPaiements(),
      fetchStatutPaiement(),
    ]);
  };





  useEffect(() => {
    if (id) {
      fetchReferenceData();
      fetchTransaction();
      fetchPaiements();
      fetchStatutPaiement();
    }
  }, [id]);



  /**
   * Formate le montant pour l'affichage (wrapper de l'utilitaire).
   */
  const formatMontant = (montant, options = {}) => {
    return formatMontantUtil(montant, { useCompactNotation: false, ...options });
  };

  /**
   * Formate une date pour l'affichage.
   */
  const formatDate = (dateValue) => {
    if (!dateValue) return '-';
    try {
    return formatShortDate(dateValue);
    } catch {
      return dateValue;
    }
  };

  /**
   * Formate une date/heure pour l'affichage.
   */
  /**
   * Obtient le nom du client ou fournisseur pour la transaction.
   */
  const getClientOuFournisseur = () => {
    if (!transaction) return '-';
    if (transaction.id_client) {
      return clientsMap.get(transaction.id_client) || `Client #${transaction.id_client}`;
    } else if (transaction.id_fournisseur) {
      return fournisseursMap.get(transaction.id_fournisseur) || `Fournisseur #${transaction.id_fournisseur}`;
    }
    return '-';
  };

  /**
   * Obtient le nom du produit pour la transaction.
   */
  const getProduitName = () => {
    if (!transaction || !transaction.id_produit) return '-';
    return produitsMap.get(transaction.id_produit) || `Produit #${transaction.id_produit}`;
  };



  /**
   * Configuration du formulaire de paiement avec react-hook-form.
   */
  const {
    register: registerPaiement,
    handleSubmit: handleSubmitPaiement,
    control: controlPaiement,
    formState: { errors: paiementErrors, isSubmitting: isPaiementSubmitting },
    watch: watchPaiement,
    reset: resetPaiement,
    setValue: setValuePaiement,
  } = useForm({
    defaultValues: {
      date_paiement: format(new Date(), 'yyyy-MM-dd'),
      montant: 0,
      type_paiement: 'cash',
      statut_cheque: 'a_encaisser',
      paiements: [], // Pour le mode multi-lignes
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: controlPaiement,
    name: "paiements",
  });

  // États pour les LC (nécessaires pour le multi-mode)
  const [availableLcs, setAvailableLcs] = useState([]);
  const [loadingLcs, setLoadingLcs] = useState(false);

  useEffect(() => {
    const fetchLcs = async () => {
      if (!paiementDialogOpen) return;
      setLoadingLcs(true);
      try {
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
  }, [paiementDialogOpen, editingPaiement, transaction]);

  /**
   * Ouvre le dialog pour éditer un paiement existant.
   */
  const handleEditPaiement = (paiement) => {
    // For ordinary payments use the staged atomic correction flow. Cheques
    // and LCs retain the existing notes-only editor until their later release.
    if (CORRECTION_WRITES_ENABLED && !['cheque', 'lc'].includes(paiement.type_paiement) && !paiement.id_lc) {
      setEditingPaiement(paiement);
      setPaiementDialogOpen(false);
      return;
    }
    setEditingPaiement(paiement);
    resetPaiement({
      date_paiement: format(new Date(paiement.date_paiement), 'yyyy-MM-dd'),
      montant: parseFloat(paiement.montant),
      type_paiement: paiement.type_paiement,
      numero_cheque: paiement.numero_cheque || '',
      banque: paiement.banque || '',
      date_encaissement_prevue: paiement.date_encaissement_prevue 
        ? format(new Date(paiement.date_encaissement_prevue), 'yyyy-MM-dd')
        : '',
      statut_cheque: paiement.statut_cheque || 'a_encaisser',
      reference_virement: paiement.reference_virement || '',
      id_lc: paiement.id_lc || null,
      notes: paiement.notes || '',
      paiements: [],
    });
    setPaiementDialogOpen(true);
  };

  /**
   * Ouvre le dialog de confirmation de suppression.
   */
  const handleDeletePaiementClick = (paiement) => {
    setPaiementToDelete(paiement);
    setDeletePaiementDialogOpen(true);
  };

  /**
   * Supprime un paiement.
   */
  const handleConfirmDeletePaiement = async () => {
    if (!paiementToDelete) return;

    setDeleteLoading(true);
    try {
      await del(`/paiements/${paiementToDelete.id_paiement}`);
      
      // Rafraîchir les données
      await refreshPaiements();
      
      // Fermer le dialog
      setDeletePaiementDialogOpen(false);
      setPaiementToDelete(null);
      
      notification.success('Paiement supprimé avec succès');
    } catch (err) {
      console.error('Erreur lors de la suppression du paiement:', err);
      notification.error(err?.message || 'Une erreur est survenue lors de la suppression du paiement');
    } finally {
      setDeleteLoading(false);
    }
  };

  /**
   * Gère la soumission du formulaire de paiement (création ou modification).
   */
  const onSubmitPaiement = async (data) => {
    try {
      // Préparer les données
      // Financial attributes are immutable; editing sends operational fields only.
      const paiementData = editingPaiement ? {
        notes: data.notes || null,
      } : {
        date_paiement: data.date_paiement,
        montant: parseFloat(data.montant),
        type_paiement: data.type_paiement,
        notes: data.notes || null,
      };

      // Ajouter les champs spécifiques selon le type
      if (data.type_paiement === 'cheque') {
        paiementData.numero_cheque = data.numero_cheque || null;
        paiementData.banque = data.banque || null;
        paiementData.date_encaissement_prevue = data.date_encaissement_prevue || null;
        paiementData.statut_cheque = data.statut_cheque || 'a_encaisser';
      } else if (data.type_paiement === 'virement') {
        paiementData.reference_virement = data.reference_virement || null;
      } else if (data.type_paiement === 'lc' && !editingPaiement) {
        paiementData.id_lc = data.id_lc || null;
      }

      // Mode édition ou création
      if (editingPaiement) {
        // Modification (toujours individuel)
        await put(`/paiements/${editingPaiement.id_paiement}`, paiementData);
        notification.success('Paiement modifié avec succès');
      } else {
        // Création (Multi-lignes)
        if (data.paiements && data.paiements.length > 0) {
          const batchData = {
            paiements: data.paiements.map(p => ({
              ...p,
              id_transaction: parseInt(id),
              montant: parseFloat(p.montant),
              // Nettoyer les champs optionnels
              numero_cheque: p.type_paiement === 'cheque' ? p.numero_cheque || null : null,
              banque: p.type_paiement === 'cheque' ? p.banque || null : null,
              date_encaissement_prevue: p.type_paiement === 'cheque' ? p.date_encaissement_prevue || null : null,
              statut_cheque: p.type_paiement === 'cheque' ? p.statut_cheque || 'a_encaisser' : null,
              reference_virement: p.type_paiement === 'virement' ? p.reference_virement || null : null,
              id_lc: p.type_paiement === 'lc' ? p.id_lc || null : null,
            }))
          };
          await post('/paiements/batch', batchData);
          notification.success(`${data.paiements.length} paiement(s) ajouté(s) avec succès`);
        } else {
          // Fallback au mode simple si jamais
          paiementData.id_transaction = parseInt(id);
          await post('/paiements', paiementData);
          notification.success('Paiement ajouté avec succès');
        }
      }

      // Rafraîchir les données
      await refreshPaiements();

      // Fermer la modal et réinitialiser le formulaire
      setPaiementDialogOpen(false);
      setEditingPaiement(null);
      resetPaiement();
    } catch (err) {
      console.error('Erreur lors de la soumission du paiement:', err);
      notification.error(err?.message || 'Une erreur est survenue lors de l\'enregistrement du paiement');
    }
  };

  /**
   * Gère la fermeture de la modal de paiement.
   */
  const handleClosePaiementDialog = () => {
    setPaiementDialogOpen(false);
    setEditingPaiement(null);
    resetPaiement();
  };

  /**
   * Gère l'ouverture de la modal d'ajout de paiement (nouveau).
   */
  const handleAddPaiement = () => {
    setEditingPaiement(null);
    resetPaiement({
      date_paiement: format(new Date(), 'yyyy-MM-dd'),
      montant: statutPaiement?.montant_restant || 0,
      type_paiement: 'cash',
      statut_cheque: 'a_encaisser',
      numero_cheque: '',
      banque: '',
      date_encaissement_prevue: '',
      reference_virement: '',
      notes: '',
      paiements: [],
    });
    setPaiementDialogOpen(true);
  };

  // Edit the sale/purchase itself, with the same forms as the register's "Modifier" action.
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(null);
  const closeEdit = () => { if (!editLoading) { setEditOpen(false); setEditError(null); } };
  const handleEditSubmit = async (data) => {
    setEditLoading(true);
    setEditError(null);
    try {
      const transactionData = { ...data };
      delete transactionData.paiement;
      const result = await put(`/transactions/${transaction.id_transaction}`, transactionData);
      if (data.paiements && data.paiements.length > 0) {
        try {
          await Promise.all(data.paiements.map((p) => {
            const pData = { ...p, id_transaction: transaction.id_transaction };
            return p.id_paiement ? put(`/paiements/${p.id_paiement}`, pData) : post('/paiements', pData);
          }));
        } catch (err) {
          console.error('Erreur lors de la gestion des paiements:', err);
          notification.warning('Transaction modifiée mais certains paiements ont échoué');
        }
      }
      notification.success('Transaction modifiée avec succès');
      setEditOpen(false);
      await refreshPaiements();
      return result;
    } catch (err) {
      setEditError(err?.message || 'Une erreur est survenue lors de l\'enregistrement');
      throw err;
    } finally {
      setEditLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(returnPath)}>
          {fromDeliveries ? 'Retour aux livraisons' : 'Retour à la liste'}
        </Button>
      </Box>
    );
  }

  if (!transaction) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Transaction introuvable
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(returnPath)}>
          {fromDeliveries ? 'Retour aux livraisons' : 'Retour à la liste'}
        </Button>
      </Box>
    );
  }

  const isSale = Boolean(transaction.id_client);
  const hasCredits = Number(transaction.montant_avoir || 0) > 0 || (transaction.avoirs_livraison_differee || []).length > 0;
  // The app font draws the French thousands separator (U+202F) almost zero-width: "1875,00".
  // A regular no-break space keeps "1 875,00 MAD" readable.
  const wide = (text) => String(text).replace(/\u202F/g, '\u00A0');
  const money = (value) => wide(formatMontant(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const unitPrice = (value) => wide(formatMontant(value, { minimumFractionDigits: 2, maximumFractionDigits: 3 }));
  const isEggSale = Boolean(transaction.id_production || transaction.est_promesse);
  const quantityText = transaction.quantite
    ? `${wide(Number(transaction.quantite).toLocaleString('fr-FR'))}${isEggSale ? ' œufs' : ''}`
    : '-';
  // Cheques not yet cashed are not counted as paid by the API: show them on their own line
  // so "Impayé" never hides money that is on its way.
  const pendingAmount = pendingPaymentAmount(paiements);
  const remaining = Number(statutPaiement?.montant_restant || 0);
  const stillOwed = Math.max(0, remaining - pendingAmount);
  const paymentLabel = (p) => {
    if (p.nature === 'remboursement') return 'Remboursement';
    if (p.est_affectation || ['credit_recu', 'credit_transfere'].includes(p.nature)) return 'Crédit affecté';
    const type = { cash: 'Espèces', cheque: 'Chèque', virement: 'Virement', carte: 'Carte', lc: 'LC', compensation: 'Compensation', autre: 'Autre' }[p.type_paiement] || readableStatus(p.type_paiement);
    const ref = p.numero_cheque || p.reference_virement || p.numero_reference_lc || (p.id_lc ? `LC #${p.id_lc}` : '');
    return ref ? `${type} n° ${ref}` : type;
  };
  const paymentStatusChip = (p) => {
    const pending = isPendingPayment(p);
    const label = p.type_paiement === 'cheque' && p.statut_cheque
      ? (CHEQUE_STATUS_LABELS[p.statut_cheque] || readableStatus(p.statut_cheque))
      : (PAYMENT_STATUS_LABELS[p.statut] || readableStatus(p.statut));
    const ok = p.statut_cheque === 'encaisse' || (!p.statut_cheque && p.statut === 'valide');
    return <Chip label={label} size="small" color={ok ? 'success' : pending ? 'warning' : 'default'} variant={ok ? 'outlined' : 'filled'} />;
  };
  const amountRow = (label, value, sx = {}) => (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={2}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ...sx }}>{value}</Typography>
    </Stack>
  );
  const cardSx = { height: '100%' };
  const cardContentSx = { p: { xs: 2, sm: 2.5 } };

  return (
    <Box sx={{ maxWidth: '100%', overflowX: 'hidden' }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(returnPath)}
        variant="outlined"
        size={isMobile ? 'small' : 'medium'}
        sx={{ mb: 2 }}
      >
        {fromDeliveries ? 'Retour aux livraisons' : 'Retour'}
      </Button>

      {/* Summary: who, how much, paid or not. */}
      <Card sx={{ mb: 2.5 }}>
        <CardContent sx={cardContentSx}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'flex-start' }} spacing={2}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                {isSale ? 'Vente' : 'Achat'} n° {transaction.id_transaction}
              </Typography>
              <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.35rem', sm: '1.75rem' }, fontWeight: 800, overflowWrap: 'anywhere' }}>
                {getClientOuFournisseur()}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {[formatDate(transaction.date_transaction), transaction.nom_batiment_source].filter(Boolean).join(' · ')}
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1.5 }}>
                {transaction.est_actif === false && <Chip size="small" label={isSale ? 'Vente annulée' : 'Achat annulé'} />}
                {statutPaiement && <PaymentStatusBadge statut={statutPaiement.est_en_retard ? 'en_retard' : statutPaiement.statut_paiement} />}
                {pendingAmount > 0 && <Chip size="small" color="warning" label={`Chèque en attente : ${money(pendingAmount)}`} />}
                {transaction.est_promesse && transaction.date_livraison_prevue && <Chip size="small" variant="outlined" label={`Livraison le ${formatShortDate(transaction.date_livraison_prevue)}`} />}
              </Stack>
            </Box>
            <Stack alignItems={{ xs: 'flex-start', md: 'flex-end' }} spacing={1.5} sx={{ flexShrink: 0 }}>
              <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                <Typography variant="caption" color="text.secondary">{hasCredits ? 'Montant initial' : 'Montant total'}</Typography>
                <Typography sx={{ fontSize: { xs: '1.5rem', sm: '1.85rem' }, fontWeight: 800, color: 'primary.main', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {money(transaction.montant_total)}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {statutPaiement && remaining > 0 && transaction.est_actif !== false && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddPaiement}>Ajouter un paiement</Button>
                )}
                {transaction.est_actif !== false && (
                  <Button variant="outlined" startIcon={<EditIcon />} onClick={() => { setEditError(null); setEditOpen(true); }}>
                    {isSale ? 'Modifier la vente' : 'Modifier l’achat'}
                  </Button>
                )}
                {transaction.est_actif === false && <Button variant="outlined" onClick={() => setReactivationOpen(true)}>
                  {isSale ? 'Réactiver la vente' : 'Réactiver l’achat'}
                </Button>}
              </Stack>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        {/* What was sold / bought. On phones it comes after the payment block. */}
        <Grid item xs={12} md={7} sx={{ order: { xs: 2, md: 1 } }}>
          <Card sx={cardSx}>
            <CardContent sx={cardContentSx}>
              <Typography component="h2" variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
                {isSale ? 'Ce qui a été vendu' : 'Ce qui a été acheté'}
              </Typography>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.default' }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{getProduitName()}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {quantityText}{transaction.prix_unitaire ? ` × ${unitPrice(transaction.prix_unitaire)}` : ''}
                  </Typography>
                </Box>
                <Typography fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(transaction.montant_total)}</Typography>
              </Stack>

              {transaction.est_promesse ? (
                <Box sx={{ mt: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                  <Typography component="h3" variant="subtitle1" fontWeight={700}>Livraison différée</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                    {[transaction.nom_batiment_source, transaction.date_livraison_prevue ? `Prévue le ${formatShortDate(transaction.date_livraison_prevue)}` : null].filter(Boolean).join(' · ')}
                  </Typography>
                  <DeferredSaleStockSummary sale={transaction} />
                  <ExpandableDetails label="Voir les productions affectées">
                    <DeferredSaleHistory embedded transactionId={transaction.id_transaction} refreshKey={`${transaction.quantite_couverte}:${transaction.quantite_annulee || 0}:${transaction.row_version}`} />
                  </ExpandableDetails>
                  {deferredCancellationEnabled() && transaction.est_actif &&
                    Number(transaction.quantite_en_attente) > 0 && <Button
                      variant="outlined" color="error" size="small" sx={{ mt: 1 }}
                      onClick={() => setCancelRemainderOpen(true)}>
                      Annuler les œufs restants
                    </Button>}
                  {cancellationReceipt && <Alert severity="success" sx={{ mt: 2 }}>
                    {Number(cancellationReceipt.quantite_annulee).toLocaleString('fr-FR')} œufs annulés.
                    Avoir de {formatMontant(cancellationReceipt.montant_avoir)} enregistré.
                    {Number(cancellationReceipt.credit_client) > 0
                      ? ` Crédit client : ${formatMontant(cancellationReceipt.credit_client)}.`
                      : ' Aucun remboursement automatique.'}
                  </Alert>}
                </Box>
              ) : transaction.id_production ? (
                <ExpandableDetails label="Voir l’origine du stock" sx={{ mt: 1 }}>
                  {transaction.repartition_stock?.length
                    ? <DetailRows ariaLabel="Origine du stock" rows={transaction.repartition_stock.map(source => ({
                      key: source.id_production,
                      label: `Production du ${formatShortDate(source.date_production)}`,
                      value: `${Number(source.quantite).toLocaleString('fr-FR')} œufs`,
                    }))} />
                    : <Typography variant="body2">Production du {formatShortDate(transaction.date_production)}</Typography>}
                </ExpandableDetails>
              ) : null}
            </CardContent>
          </Card>
        </Grid>

        {/* Money: always lists the payments themselves, with their state. */}
        {statutPaiement && <Grid item xs={12} md={5} sx={{ order: { xs: 1, md: 2 } }}>
          <Card sx={cardSx}>
            <CardContent sx={cardContentSx}>
              <Typography component="h2" variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>Paiement</Typography>
              {transaction.est_promesse && hasCredits
                ? <DeferredSaleFinancialSummary sale={transaction} />
                : <Stack spacing={1}>
                  {amountRow(isSale ? 'Encaissé' : 'Payé', money(statutPaiement.montant_paye))}
                  {pendingAmount > 0 && amountRow('Chèque en attente', money(pendingAmount), { color: 'warning.dark' })}
                  {remaining > 0 && amountRow(isSale ? 'Reste à encaisser' : 'Reste à payer', money(stillOwed), { color: stillOwed > 0 ? 'warning.dark' : 'text.primary' })}
                </Stack>}
              {transaction.date_echeance && remaining > 0 && (
                <Typography variant="body2" sx={{ mt: 1 }} color={statutPaiement.est_en_retard ? 'error.main' : 'text.secondary'}>
                  Échéance : {formatDate(transaction.date_echeance)}
                </Typography>
              )}
              {CREDIT_REFUNDS_ENABLED && transaction.est_actif && remaining < -0.009 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Crédit disponible : {formatMontant(-remaining)}
                  </Typography>
                  <Button variant="outlined" onClick={() => setRefundOpen(true)}>
                    {isSale ? 'Rembourser le client' : 'Enregistrer un remboursement fournisseur'}
                  </Button>
                </Box>
              )}
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Règlements</Typography>
              {loadingPaiements ? (
                <CircularProgress size={24} />
              ) : paiements && paiements.length > 0 ? (
                <Stack spacing={1.25}>
                  {paiements.map((paiement) => (
                    <Box key={paiement.id_paiement} sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{paymentLabel(paiement)}</Typography>
                          <Typography variant="caption" color="text.secondary">{formatDate(paiement.date_paiement)}</Typography>
                        </Box>
                        <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
                          <Typography variant="body2" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }} color={paiement.nature === 'remboursement' ? 'error.main' : 'text.primary'}>
                            {paiement.nature === 'remboursement' ? '− ' : ''}{money(paiement.montant)}
                          </Typography>
                          {paymentStatusChip(paiement)}
                        </Stack>
                      </Stack>
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, ml: -0.75 }}>
                        {!['remboursement', 'credit_recu', 'credit_transfere'].includes(paiement.nature) && (
                          <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={() => handleEditPaiement(paiement)}>
                            Modifier
                          </Button>
                        )}
                        {!['credit_recu', 'credit_transfere'].includes(paiement.nature) && (
                          <Button size="small" color="error" startIcon={<DeleteIcon fontSize="small" />} onClick={() => handleDeletePaiementClick(paiement)} aria-label="Annuler ce règlement">
                            Annuler
                          </Button>
                        )}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">Aucun paiement enregistré pour le moment.</Typography>
              )}
              {CREDIT_REFUNDS_ENABLED && <TransactionCreditPanel transaction={transaction} />}
            </CardContent>
          </Card>
        </Grid>}
      </Grid>

      <Box sx={{ mb: { xs: 2, sm: 3 } }}>
        <TransactionAuditHistory key={transaction.id_transaction} transactionId={transaction.id_transaction} />
        {CORRECTION_WRITES_ENABLED && (
          <CorrectionHistory transactionId={transaction.id_transaction} readOnly revision={transaction.row_version} />
        )}
      </Box>
      {editOpen && (CORRECTION_WRITES_ENABLED ? (
        <TransactionEditForm
          open
          initialValues={transaction}
          onClose={closeEdit}
          onCorrected={async () => {
            setEditOpen(false);
            await refreshPaiements();
            notification.success('Correction enregistrée');
          }}
        />
      ) : (
        <TransactionForm
          open
          onClose={closeEdit}
          onSubmit={handleEditSubmit}
          initialValues={transaction}
          loading={editLoading}
          errorMessage={editError}
        />
      ))}
      {reactivationOpen && <ReactivationReviewDialog
        transaction={transaction}
        onClose={() => setReactivationOpen(false)}
        onSaved={() => {
          setReactivationOpen(false);
          refreshPaiements();
          notification.success('Transaction réactivée avec succès');
        }}
      />}
      {deferredCancellationEnabled() && transaction.est_promesse && (
        <DeferredSaleCancellationDialog
          open={cancelRemainderOpen}
          transactionId={transaction.id_transaction}
          onClose={() => setCancelRemainderOpen(false)}
          onCompleted={async receipt => {
            await refreshPaiements();
            setCancellationReceipt(receipt);
          }}
          onStale={fetchTransaction}
        />
      )}
      {CREDIT_REFUNDS_ENABLED && refundOpen && statutPaiement && (
        <RefundDialog transaction={transaction} credit={-Number(statutPaiement.montant_restant)}
          onClose={() => setRefundOpen(false)}
          onSaved={async () => {
            setRefundOpen(false);
            await refreshPaiements();
            notification.success('Remboursement enregistré');
          }} />
      )}
      {CORRECTION_WRITES_ENABLED && editingPaiement && !paiementDialogOpen && (
        <PaymentCorrectionDialog
          payment={editingPaiement}
          transaction={transaction}
          onClose={() => setEditingPaiement(null)}
          onSaved={async () => {
            await refreshPaiements();
            setEditingPaiement(null);
            notification.success('Correction enregistrée');
          }}
        />
      )}

      {/* Modal d'ajout/édition de paiement */}
      <Dialog
        open={paiementDialogOpen}
        onClose={handleClosePaiementDialog}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <form noValidate onSubmit={handleSubmitPaiement(onSubmitPaiement)}>
          <DialogTitleWithClose
            onClose={handleClosePaiementDialog}
            subtitle={editingPaiement
              ? `Paiement n° ${editingPaiement.id_paiement}`
              : statutPaiement ? `Transaction n° ${id} · reste à payer ${formatMontant(statutPaiement.montant_restant)}` : null}
          >
            {editingPaiement ? 'Modifier le paiement' : 'Ajouter un paiement'}
          </DialogTitleWithClose>
          <DialogContent>
            <Box sx={{ pt: 1 }}>
              {editingPaiement ? (
                <PaiementForm
                  defaultValues={editingPaiement}
                  isEditing
                  transaction={{ ...transaction, ...statutPaiement }}
                  register={registerPaiement}
                  errors={paiementErrors}
                  watch={watchPaiement}
                  setValue={setValuePaiement}
                  availableLcs={availableLcs}
                  loadingLcs={loadingLcs}
                />
              ) : (
                <MultiPaiementForm
                  supplierSource={fournisseurs.find((item) => item.id_fournisseur === transaction?.id_fournisseur)?.mode_reglement_prefere || null}
                  transaction={{ ...transaction, ...statutPaiement }}
                  fields={fields}
                  append={append}
                  remove={remove}
                  register={registerPaiement}
                  errors={paiementErrors}
                  watch={watchPaiement}
                  setValue={setValuePaiement}
                  availableLcs={availableLcs}
                  loadingLcs={loadingLcs}
                />
              )}
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2, gap: 1 }}>
            <Button 
              onClick={handleClosePaiementDialog}
              disabled={isPaiementSubmitting}
            >
              Annuler
            </Button>
            <Button 
              type="submit"
              variant="contained"
              disabled={isPaiementSubmitting}
            >
              {isPaiementSubmitting ? 'Enregistrement...' : (editingPaiement ? 'Modifier' : 'Enregistrer')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Dialog de confirmation de suppression de paiement */}
      <Dialog
        open={deletePaiementDialogOpen}
        onClose={() => !deleteLoading && setDeletePaiementDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Confirmer la suppression</DialogTitle>
        <DialogContent>
          <Typography>
            Êtes-vous sûr de vouloir supprimer ce paiement ?
          </Typography>
          {paiementToDelete && (
            <Box sx={{ mt: 2, p: 1.5, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="body2">
                <strong>Montant :</strong> {formatMontant(paiementToDelete.montant)}
              </Typography>
              <Typography variant="body2">
                <strong>Date :</strong> {formatDate(paiementToDelete.date_paiement)}
              </Typography>
              <Typography variant="body2">
                <strong>Type :</strong> {paiementToDelete.type_paiement}
              </Typography>
            </Box>
          )}
          <Alert severity="warning" sx={{ mt: 2 }}>
            Cette action est irréversible. Le montant restant sera recalculé automatiquement.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setDeletePaiementDialogOpen(false)}
            disabled={deleteLoading}
          >
            Annuler
          </Button>
          <Button
            onClick={handleConfirmDeletePaiement}
            color="error"
            variant="contained"
            disabled={deleteLoading}
          >
            {deleteLoading ? 'Suppression...' : 'Supprimer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default TransactionDetail;
