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
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  Menu,
  MenuItem,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { IconButton, Tooltip } from '@mui/material';
import { get, post, put, patch, del } from '../../services/api';
import { format } from 'date-fns';
import { formatShortDate } from '../../utils/dateFormatting';
import { formatMontant as formatMontantUtil } from '../../utils/formatNumber';
import PaymentStatusBadge from '../../components/PaymentStatusBadge';
import PaiementForm from '../../components/PaiementForm';
import useNotification from '../../hooks/useNotification';
import { useForm, useFieldArray } from 'react-hook-form';
import MultiPaiementForm from '../../components/PaiementForm/MultiPaiementForm';
import DeferredSaleHistory from './DeferredSaleHistory';
import TransactionQuantitySummary from './TransactionQuantitySummary';
import { HistoryOutlined, LayersOutlined } from '@mui/icons-material';
import ExpandableDetails from '../../components/ExpandableDetails';

/**
 * Composant TransactionDetail.
 */
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
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [actionsAnchor, setActionsAnchor] = useState(null);
  const [statutPaiement, setStatutPaiement] = useState(null);
  const [loadingPaiements, setLoadingPaiements] = useState(false);

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
  const [promiseActionLoading, setPromiseActionLoading] = useState(false);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completionPreview, setCompletionPreview] = useState(null);
  const [completionQuantity, setCompletionQuantity] = useState('');
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [newDeliveryDate, setNewDeliveryDate] = useState('');
  const [cancelRemainderDialogOpen, setCancelRemainderDialogOpen] = useState(false);
  const [cancelTransactionDialogOpen, setCancelTransactionDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('Annulation demandée depuis le détail de la vente');

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
      fetchPaiements(),
      fetchStatutPaiement(),
    ]);
  };

  const openCompletion = async () => {
    setPromiseActionLoading(true);
    try {
      const proposal = await get(`/transactions/${id}/completion`);
      setCompletionPreview(proposal);
      setCompletionQuantity(String(proposal.quantite_proposee || ''));
      setCompletionDialogOpen(true);
    } catch (err) {
      notification.error(err?.message || 'Le stock disponible ne peut pas être chargé.');
    } finally { setPromiseActionLoading(false); }
  };

  const submitCompletion = async () => {
    const quantity = Number(completionQuantity);
    if (!completionPreview || !Number.isInteger(quantity) || quantity < 1 || quantity > completionPreview.quantite_proposee) return;
    setPromiseActionLoading(true);
    try {
      await post(`/transactions/${id}/completion`, {
        quantite: quantity,
        quantite_couverte_attendue: completionPreview.quantite_couverte,
        empreinte_stock: completionPreview.empreinte_stock,
      });
      setCompletionDialogOpen(false);
      await fetchTransaction();
      notification.success('La quantité disponible a été ajoutée à la vente.');
    } catch (err) {
      notification.error(err?.message || 'La livraison n’a pas pu être complétée. Rechargez la proposition.');
    } finally { setPromiseActionLoading(false); }
  };

  const submitReschedule = async () => {
    setPromiseActionLoading(true);
    try {
      await patch(`/transactions/${id}/delivery-date`, { date_livraison_prevue: newDeliveryDate });
      setRescheduleDialogOpen(false);
      await fetchTransaction();
      notification.success('La date prévue a été mise à jour.');
    } catch (err) { notification.error(err?.message || 'La date n’a pas pu être modifiée.'); }
    finally { setPromiseActionLoading(false); }
  };

  const submitCancelRemainder = async () => {
    setPromiseActionLoading(true);
    try {
      await post(`/transactions/${id}/cancel-remainder`);
      setCancelRemainderDialogOpen(false);
      await fetchTransaction();
      notification.success('Le reste à fournir a été clôturé.');
    } catch (err) { notification.error(err?.message || 'Le reste n’a pas pu être clôturé.'); }
    finally { setPromiseActionLoading(false); }
  };

  const submitCancelTransaction = async () => {
    setPromiseActionLoading(true);
    try {
      await del(transaction.est_promesse ? `/transactions/${id}?raison=${encodeURIComponent(cancelReason)}` : `/transactions/${id}`);
      setCancelTransactionDialogOpen(false);
      await Promise.all([fetchTransaction(), refreshPaiements()]);
      notification.success(transaction.est_promesse ? 'La vente et ses paiements ont été annulés et conservés dans l’historique.' : 'La transaction a été retirée du registre actif.');
    } catch (err) { notification.error(err?.message || 'La transaction n’a pas pu être annulée.'); }
    finally { setPromiseActionLoading(false); }
  };

  const reactivateTransaction = async () => {
    setPromiseActionLoading(true);
    try {
      await patch(`/transactions/${id}/reactivate`, {});
      await Promise.all([fetchTransaction(), refreshPaiements()]);
      notification.success(transaction.est_promesse ? 'La vente est réactivée. Les paiements annulés ne sont pas réactivés automatiquement.' : 'La transaction est réactivée.');
    } catch (err) { notification.error(err?.message || 'La transaction n’a pas pu être réactivée.'); }
    finally { setPromiseActionLoading(false); }
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
    return formatMontantUtil(montant, { useCompactNotation: false, minimumFractionDigits: 2, ...options });
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

  const inactiveTransaction = transaction.est_actif === false;

  const isSale = Boolean(transaction.id_client);
  const operationName = isSale ? 'Vente' : transaction.id_fournisseur ? 'Achat' : 'Transaction';
  const pendingQuantity = Math.max(0, Number(transaction.quantite_en_attente || 0));
  const reservedQuantity = Math.min(pendingQuantity, Math.max(0, Number(transaction.quantite_reservee || 0)));
  const recentPayments = [...paiements].sort((a, b) =>
    String(b.date_paiement).localeCompare(String(a.date_paiement)) || Number(b.id_paiement) - Number(a.id_paiement)
  );
  const visiblePayments = showAllPayments ? recentPayments : recentPayments.slice(0, 3);
  const number = value => value === null || value === undefined ? '—' : Number(value).toLocaleString('fr-FR');
  const paymentLabels = {
    a_encaisser: 'À encaisser', encaisse: 'Encaissé', emis: 'Émis',
    valide: 'Validé', annule: 'Annulé', rejete: 'Rejeté', en_attente: 'En attente',
  };
  const paymentTypeLabels = { cash: 'Espèces', cheque: 'Chèque', virement: 'Virement bancaire', carte: 'Carte bancaire', compensation: 'Compensation', lc: 'Lettre de crédit', autre: 'Autre' };
  const readableStatus = value => paymentLabels[value] || (value ? String(value).replace(/_/g, ' ') : 'Statut non renseigné');
  const cardSx = { borderRadius: 2, minWidth: 0, height: 'fit-content' };
  const moneySx = { fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' };

  return (
    <Box sx={{ maxWidth: 1120, mx: 'auto', minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(returnPath)} color="inherit">
          {fromDeliveries ? 'Retour aux livraisons' : 'Ventes et achats'}
        </Button>
        <>
          <Button endIcon={<MoreVertIcon />} color="inherit" onClick={event => setActionsAnchor(event.currentTarget)}
            aria-haspopup="menu" aria-expanded={Boolean(actionsAnchor)} aria-controls={actionsAnchor ? 'transaction-actions' : undefined}
            disabled={promiseActionLoading}>Autres actions</Button>
          <Menu id="transaction-actions" anchorEl={actionsAnchor} open={Boolean(actionsAnchor)} onClose={() => setActionsAnchor(null)}>
            {transaction.est_actif !== false && <MenuItem onClick={() => {
              setActionsAnchor(null);
              navigate('/transactions', { state: { editTransactionId: transaction.id_transaction } });
            }}>Modifier la transaction</MenuItem>}
            {transaction.est_promesse && transaction.est_actif !== false && pendingQuantity > 0 && <MenuItem onClick={() => {
              setActionsAnchor(null); setNewDeliveryDate(transaction.date_livraison_prevue || ''); setRescheduleDialogOpen(true);
            }}>Changer la date prévue</MenuItem>}
            {transaction.est_promesse && transaction.est_actif !== false && pendingQuantity > 0 && <MenuItem onClick={() => {
              setActionsAnchor(null); setCancelRemainderDialogOpen(true);
            }}>Clôturer le reste à fournir</MenuItem>}
            {transaction.est_actif !== false && <MenuItem sx={{ color: 'error.main' }} onClick={() => {
              setActionsAnchor(null); setCancelTransactionDialogOpen(true);
            }}>{transaction.est_promesse ? 'Annuler la vente' : 'Retirer du registre'}</MenuItem>}
            {transaction.est_actif === false && <MenuItem onClick={() => {
              setActionsAnchor(null); reactivateTransaction();
            }}>{isSale ? 'Réactiver la vente' : 'Réactiver l’achat'}</MenuItem>}
          </Menu>
        </>
      </Stack>
      <Typography component="h1" variant="h4" sx={{ fontSize: { xs: '1.4rem', md: '1.85rem' }, overflowWrap: 'anywhere', fontWeight: 700 }}>
        {operationName} n° {transaction.id_transaction} · {getClientOuFournisseur()}
      </Typography>
      <Typography color="text.secondary" variant="body2" sx={{ mt: 0.75, mb: 2.5 }}>
        {isSale ? 'Vendue' : 'Acheté'} le {formatDate(transaction.date_transaction)}
        {transaction.nom_batiment_source && ` · ${transaction.nom_batiment_source}`}
      </Typography>

      {inactiveTransaction && <Alert severity="error" sx={{ mb: 2.5 }}>
        <Typography fontWeight={700}>{isSale ? 'Vente annulée' : 'Achat annulé'}</Typography>
        Les montants et paiements restent consultables dans l’historique.
      </Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.4fr) minmax(0, 1fr)' }, gap: 2.5, alignItems: 'start' }}>
        <Stack spacing={2.5} sx={{ minWidth: 0, order: { xs: 2, md: 1 } }}>
          <Card variant="outlined" sx={cardSx}><CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Typography component="h2" variant="h6" sx={{ mb: 2 }}>{isSale ? 'La vente' : 'L’achat'}</Typography>
            <Typography fontWeight={700}>{getProduitName()}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ mt: 1 }}>
              <Typography color="text.secondary">
                {number(transaction.quantite)}{transaction.id_production || transaction.est_promesse ? ' œufs' : ''}
                {' × '}{formatMontant(transaction.prix_unitaire)}
              </Typography>
              <Typography fontWeight={700} sx={moneySx}>{formatMontant(transaction.montant_total)}</Typography>
            </Stack>
            {!transaction.est_promesse && transaction.id_production && <ExpandableDetails label="Voir l’origine du stock" icon={<LayersOutlined />} sx={{ mt: 2 }}>
              {transaction.repartition_stock?.length ? transaction.repartition_stock.map(source =>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" key={source.id_production} sx={{ py: 0.75 }}>
                  <Typography variant="body2" color="text.secondary">Production du {formatDate(source.date_production)}</Typography>
                  <Typography variant="body2" fontWeight={700}>{number(source.quantite)} œufs</Typography>
                </Stack>) : <Typography variant="body2">Production du {formatDate(transaction.date_production)}</Typography>}
            </ExpandableDetails>}
          </CardContent></Card>

          {transaction.est_promesse && <Card variant="outlined" sx={cardSx}><CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Typography component="h2" variant="h6" sx={{ mb: 2 }}>Quantités à fournir</Typography>
            <TransactionQuantitySummary sale={transaction} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {transaction.date_livraison_prevue ? `Date prévue : ${formatDate(transaction.date_livraison_prevue)}` : 'Date prévue non renseignée'}
            </Typography>
            {!inactiveTransaction && transaction.est_actif && pendingQuantity > 0 && <Box sx={{ mt: 2 }}>
              <Button variant="contained" fullWidth onClick={openCompletion} disabled={promiseActionLoading || reservedQuantity < 1}>
                Compléter avec le stock disponible
              </Button>
              {reservedQuantity < 1 && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Aucun stock réservé disponible pour compléter cette vente.
              </Typography>}
            </Box>}
          </CardContent></Card>}
        </Stack>

        <Card variant="outlined" sx={{ ...cardSx, order: { xs: 1, md: 2 } }}><CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <Typography component="h2" variant="h6">Paiement</Typography>
            {statutPaiement && !inactiveTransaction && <PaymentStatusBadge statut={statutPaiement.est_en_retard ? 'en_retard' : statutPaiement.statut_paiement} />}
          </Stack>
          <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography color="text.secondary">{isSale ? 'Total de la vente' : 'Total de l’achat'}</Typography>
            <Typography fontWeight={700} sx={moneySx}>{formatMontant(transaction.montant_total)}</Typography>
          </Stack>
          {statutPaiement ? <>
            <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 0.5 }}>
              <Typography color="text.secondary">{inactiveTransaction ? 'Réglé (historique)' : 'Déjà réglé'}</Typography>
              <Typography fontWeight={700} sx={moneySx}>{formatMontant(statutPaiement.montant_paye)}</Typography>
            </Stack>
            <Box sx={{ mt: 2, p: 2, borderRadius: 1.5, bgcolor: 'action.hover' }}>
              <Typography variant="body2" color="text.secondary">{inactiveTransaction ? 'Solde (historique)' : isSale ? 'Reste à encaisser' : 'Reste à payer'}</Typography>
              <Typography variant="h5" fontWeight={700} sx={{ ...moneySx, mt: 0.5 }}>{formatMontant(statutPaiement.montant_restant)}</Typography>
              {transaction.date_echeance && <Typography variant="body2" color={statutPaiement.est_en_retard && !inactiveTransaction ? 'error.main' : 'text.secondary'} sx={{ mt: 1 }}>
                Échéance : {formatDate(transaction.date_echeance)}
              </Typography>}
            </Box>
            {!inactiveTransaction && Number(statutPaiement.montant_restant) > 0 && <Button variant="contained" fullWidth startIcon={<AddIcon />} onClick={handleAddPaiement} sx={{ mt: 2 }}>
              Ajouter un paiement
            </Button>}
          </> : <Alert severity="warning" sx={{ mt: 2 }} action={<Button onClick={fetchStatutPaiement}>Réessayer</Button>}>
            Le solde du paiement est indisponible.
          </Alert>}
        </CardContent></Card>
      </Box>

      <Card variant="outlined" sx={{ ...cardSx, mt: 2.5 }}><CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Typography component="h2" variant="h6" sx={{ mb: 1 }}>Paiements enregistrés</Typography>
        {loadingPaiements ? <CircularProgress size={24} aria-label="Chargement des paiements" /> : visiblePayments.length ? <>
          {visiblePayments.map(paiement => {
            const status = paiement.type_paiement === 'cheque' && paiement.statut_cheque && paiement.statut !== 'annule' ? paiement.statut_cheque : paiement.statut;
            const reference = paiement.numero_cheque || paiement.reference_virement || paiement.numero_reference_lc || (paiement.id_lc ? `LC n° ${paiement.id_lc}` : null);
            return <Box component="article" aria-label={`Paiement du ${formatDate(paiement.date_paiement)}`} key={paiement.id_paiement}
              sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1.5, py: 2, '& + &': { borderTop: '1px solid', borderColor: 'divider' } }}>
              <Box sx={{ minWidth: 0, flex: '1 1 180px' }}>
                <Typography variant="body2" fontWeight={700}>{paymentTypeLabels[paiement.type_paiement] || 'Autre'}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{formatDate(paiement.date_paiement)} · {readableStatus(status)}</Typography>
                {reference && <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere', mt: 0.5 }}>Référence : {reference}</Typography>}
              </Box>
              <Stack alignItems="flex-end" spacing={0.5} sx={{ minWidth: 0, maxWidth: '100%', ml: 'auto' }}>
                <Typography fontWeight={700} sx={moneySx}>{formatMontant(paiement.montant)}</Typography>
                {!inactiveTransaction && paiement.statut !== 'annule' && <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Modifier le paiement"><IconButton aria-label="Modifier le paiement" size="small" sx={{ width: { xs: 44, sm: 36 }, height: { xs: 44, sm: 36 } }} onClick={() => handleEditPaiement(paiement)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Supprimer le paiement"><IconButton aria-label="Supprimer le paiement" size="small" sx={{ width: { xs: 44, sm: 36 }, height: { xs: 44, sm: 36 } }} color="error" onClick={() => handleDeletePaiementClick(paiement)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                </Stack>}
              </Stack>
            </Box>;
          })}
          {recentPayments.length > 3 && <Button onClick={() => setShowAllPayments(value => !value)} sx={{ mt: 1 }} aria-expanded={showAllPayments}>
            {showAllPayments ? 'Voir les 3 derniers paiements' : `Voir tous les paiements (${recentPayments.length})`}
          </Button>}
        </> : <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>Aucun paiement enregistré pour cette transaction.</Typography>}
      </CardContent></Card>

      {transaction.est_promesse && <Box sx={{ mt: 2.5 }}>
        <ExpandableDetails label="Historique du stock et des modifications" icon={<HistoryOutlined />}>
          <DeferredSaleHistory transactionId={transaction.id_transaction} refreshKey={`${transaction.quantite_couverte}-${transaction.quantite_annulee}-${transaction.date_livraison_prevue}-${transaction.est_actif}`} embedded />
        </ExpandableDetails>
      </Box>}

      <Dialog open={completionDialogOpen} onClose={() => !promiseActionLoading && setCompletionDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Compléter la livraison</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">Stock réservé pour cette vente, par date de production :</Typography>
            {completionPreview?.repartition_stock?.map(source => <Stack key={source.id_production} direction="row" justifyContent="space-between"><Typography variant="body2">Production du {formatShortDate(source.date_production)}</Typography><Typography variant="body2" fontWeight={700}>{Number(source.quantite).toLocaleString('fr-FR')} œufs</Typography></Stack>)}
            <TextField label="Quantité à compléter" type="number" value={completionQuantity} onChange={event => setCompletionQuantity(event.target.value)} inputProps={{ min: 1, max: completionPreview?.quantite_proposee || 1, step: 1 }} helperText={`Maximum disponible : ${Number(completionPreview?.quantite_proposee || 0).toLocaleString('fr-FR')} œufs`} />
            <Alert severity="info">Cette action rattache le stock à la vente existante. Elle ne crée ni nouvelle vente ni nouveau paiement.</Alert>
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setCompletionDialogOpen(false)} disabled={promiseActionLoading}>Retour</Button><Button variant="contained" onClick={submitCompletion} disabled={promiseActionLoading || !Number(completionQuantity) || Number(completionQuantity) > Number(completionPreview?.quantite_proposee)}>Confirmer</Button></DialogActions>
      </Dialog>
      <Dialog open={rescheduleDialogOpen} onClose={() => setRescheduleDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Changer la date prévue</DialogTitle>
        <DialogContent><TextField fullWidth type="date" label="Nouvelle date" value={newDeliveryDate} onChange={event => setNewDeliveryDate(event.target.value)} InputLabelProps={{ shrink: true }} sx={{ mt: 1 }} /></DialogContent>
        <DialogActions><Button onClick={() => setRescheduleDialogOpen(false)}>Annuler</Button><Button variant="contained" onClick={submitReschedule} disabled={promiseActionLoading || !newDeliveryDate}>Enregistrer</Button></DialogActions>
      </Dialog>
      <Dialog open={cancelRemainderDialogOpen} onClose={() => setCancelRemainderDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Clôturer le reste à fournir ?</DialogTitle>
        <DialogContent><Typography>Les {Number(transaction.quantite_en_attente || 0).toLocaleString('fr-FR')} œufs non complétés seront clôturés. Le stock réservé qui n’est plus nécessaire sera libéré pour les autres ventes. Le montant de la vente et ses paiements restent inchangés ; cette action ne crée pas de remboursement.</Typography></DialogContent>
        <DialogActions><Button onClick={() => setCancelRemainderDialogOpen(false)}>Retour</Button><Button color="warning" variant="contained" onClick={submitCancelRemainder} disabled={promiseActionLoading}>Clôturer</Button></DialogActions>
      </Dialog>
      <Dialog open={cancelTransactionDialogOpen} onClose={() => setCancelTransactionDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{transaction.est_promesse ? 'Annuler la vente entière ?' : 'Retirer cette transaction du registre actif ?'}</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="warning">{transaction.est_promesse ? <>La vente sera retirée du registre actif. Ses paiements seront annulés et conservés dans l’historique. Une réactivation ultérieure ne réactive pas les paiements.</> : <>Elle restera consultable dans l’historique et pourra être réactivée plus tard.</>}</Alert>
          {transaction.est_promesse && <TextField label="Motif" value={cancelReason} onChange={event => setCancelReason(event.target.value)} required inputProps={{ maxLength: 1000 }} />}
        </Stack></DialogContent>
        <DialogActions><Button onClick={() => setCancelTransactionDialogOpen(false)}>Retour</Button><Button color="error" variant="contained" onClick={submitCancelTransaction} disabled={promiseActionLoading || (transaction.est_promesse && cancelReason.trim().length < 3)}>{transaction.est_promesse ? 'Annuler la vente' : 'Retirer du registre'}</Button></DialogActions>
      </Dialog>

      {/* Modal d'ajout/édition de paiement */}
      <Dialog
        open={paiementDialogOpen}
        onClose={handleClosePaiementDialog}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <form noValidate onSubmit={handleSubmitPaiement(onSubmitPaiement)}>
          <DialogTitle>
            <Typography variant="h6" component="span">
              {editingPaiement ? 'Modifier le paiement' : (fields.length > 1 ? 'Ajouter des paiements' : 'Ajouter un paiement')}
            </Typography>
            {statutPaiement && !editingPaiement && (
              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                Transaction n° {id} · Reste à régler : {formatMontant(statutPaiement.montant_restant)}
              </Typography>
            )}
            {editingPaiement && (
              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                Paiement #{editingPaiement.id_paiement}
              </Typography>
            )}
          </DialogTitle>
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
              {isPaiementSubmitting ? 'Enregistrement...' : (editingPaiement ? 'Modifier' : (fields.length > 1 ? 'Enregistrer les paiements' : 'Enregistrer le paiement'))}
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


