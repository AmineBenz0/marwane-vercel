/**
 * Page Liste Transactions.
 * 
 * Affiche la liste des transactions avec :
 * - Registre Excel lisible
 * - Filtres avancÃ©s : date (range), client, fournisseur, produit, montant (min/max), statut
 * - Actions : crÃ©er, voir dÃ©tails, Ã©diter, supprimer (soft delete)
 * - Pagination
 * 
 * Chaque transaction reprÃ©sente une ligne de vente/achat avec un seul produit.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Chip,
  Tooltip,
  Stack,
  IconButton,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  Add as AddIcon,
  FileDownload as FileDownloadIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Visibility as VisibilityIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Restore as RestoreIcon,
  MoreVert as MoreVertIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Payments as PaymentsIcon,
  ReceiptLong as ReceiptLongIcon,
} from '@mui/icons-material';
import TransactionForm from './TransactionForm';
import SmartFilterPanel from '../../components/Filters/SmartFilterPanel';
import PaymentStatusBadge from '../../components/PaymentStatusBadge';
import { get, post, put, patch, del } from '../../services/api';
import { format } from 'date-fns';
import fr from 'date-fns/locale/fr';
import { exportToExcelAdvanced } from '../../utils/exportToExcel';
import { exportToPDF } from '../../utils/exportToPDF';
import useNotification from '../../hooks/useNotification';
import { formatMontant as formatMontantUtil } from '../../utils/formatNumber';

/**
 * Composant TransactionsList.
 */
function TransactionsList() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Hook pour les notifications
  const notification = useNotification();

  // Ã‰tat pour les transactions
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Ã‰tat pour les clients, fournisseurs et produits (pour les filtres et l'affichage)
  const [clients, setClients] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [produits, setProduits] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [loadingReferenceData, setLoadingReferenceData] = useState(false);

  // Ã‰tat pour la modal de crÃ©ation/Ã©dition
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [prefillBatimentId, setPrefillBatimentId] = useState(null);

  // Ã‰tat pour la confirmation de suppression
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Ã‰tat pour les filtres (objet unique)
  const [filters, setFilters] = useState({
    dateDebut: '',
    dateFin: '',
    client: '',
    fournisseur: '',
    produit: '',
    montantMin: '',
    montantMax: '',
    estActif: '',
  });
  const [quickFilter, setQuickFilter] = useState('all');

  /**
   * Gestion des filtres.
   */
  const handleFilterChange = (filterId, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterId]: value,
    }));
  };

  const handleClearAllFilters = () => {
    setFilters({
      dateDebut: '',
      dateFin: '',
      client: '',
      fournisseur: '',
      produit: '',
      montantMin: '',
      montantMax: '',
      estActif: '',
    });
  };

  /**
   * CrÃ©e des maps de lookup pour clients, fournisseurs et produits.
   */
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

  const produitsMap = useMemo(() => {
    const map = new Map();
    produits.forEach((produit) => {
      map.set(produit.id_produit, produit.nom_produit);
    });
    return map;
  }, [produits]);

  const batimentsMap = useMemo(() => {
    const map = new Map();
    batiments.forEach((batiment) => {
      map.set(batiment.id_batiment, batiment.nom);
    });
    return map;
  }, [batiments]);

  /**
   * DÃ©finitions des filtres pour SmartFilterPanel.
   */
  const filterDefinitions = useMemo(() => [
    {
      id: 'dateDebut',
      label: 'Date début',
      type: 'date',
      alwaysInline: true, // Toujours visible
      formatChipValue: (value) => {
        try {
          return new Date(value).toLocaleDateString('fr-FR');
        } catch {
          return value;
        }
      },
    },
    {
      id: 'dateFin',
      label: 'Date fin',
      type: 'date',
      alwaysInline: true, // Toujours visible
      formatChipValue: (value) => {
        try {
          return new Date(value).toLocaleDateString('fr-FR');
        } catch {
          return value;
        }
      },
    },
    {
      id: 'client',
      label: 'Client',
      type: 'select',
      options: clients.map((c) => ({
        value: c.id_client.toString(),
        label: c.nom_client,
      })),
      formatChipValue: (value) => {
        const client = clients.find((c) => c.id_client.toString() === value);
        return client ? client.nom_client : value;
      },
    },
    {
      id: 'fournisseur',
      label: 'Fournisseur',
      type: 'select',
      options: fournisseurs.map((f) => ({
        value: f.id_fournisseur.toString(),
        label: f.nom_fournisseur,
      })),
      formatChipValue: (value) => {
        const fournisseur = fournisseurs.find((f) => f.id_fournisseur.toString() === value);
        return fournisseur ? fournisseur.nom_fournisseur : value;
      },
    },
    {
      id: 'produit',
      label: 'Produit vendu / acheté',
      type: 'select',
      options: produits.map((p) => ({
        value: p.id_produit.toString(),
        label: p.nom_produit,
      })),
      formatChipValue: (value) => {
        const produit = produits.find((p) => p.id_produit.toString() === value);
        return produit ? produit.nom_produit : value;
      },
    },
    {
      id: 'montantMin',
      label: 'Montant min',
      type: 'number',
      min: 0,
      step: 0.01,
      formatChipValue: (value) => `${value} MAD`,
    },
    {
      id: 'montantMax',
      label: 'Montant max',
      type: 'number',
      min: 0,
      step: 0.01,
      formatChipValue: (value) => `${value} MAD`,
    },
  ], [clients, fournisseurs, produits]);

  /**
   * Charge la liste des clients, fournisseurs et produits.
   */
  const fetchReferenceData = async () => {
    setLoadingReferenceData(true);
    try {
      const [clientsData, fournisseursData, produitsData, batimentsData] = await Promise.all([
        get('/clients', { params: { limit: 1000, est_actif: true } }),
        get('/fournisseurs', { params: { limit: 1000, est_actif: true } }),
        get('/produits', { params: { limit: 1000, est_actif: true } }),
        get('/batiments'),
      ]);
      setClients(clientsData || []);
      setFournisseurs(fournisseursData || []);
      setProduits(produitsData || []);
      setBatiments(batimentsData || []);
    } catch (err) {
      console.error('Erreur lors du chargement des donnÃ©es de rÃ©fÃ©rence:', err);
    } finally {
      setLoadingReferenceData(false);
    }
  };

  /**
   * Charge la liste des transactions depuis l'API.
   */
  const fetchTransactions = async () => {
    setLoading(true);
    setError(null);

    try {
      // Construire les paramÃ¨tres de requÃªte
      const params = {};
      
      if (filters.dateDebut) {
        params.date_debut = filters.dateDebut;
      }
      if (filters.dateFin) {
        params.date_fin = filters.dateFin;
      }
      if (filters.client !== '') {
        params.id_client = parseInt(filters.client);
      }
      if (filters.fournisseur !== '') {
        params.id_fournisseur = parseInt(filters.fournisseur);
      }
      if (filters.produit !== '') {
        params.id_produit = parseInt(filters.produit);
      }
      if (filters.montantMin !== '') {
        params.montant_min = parseFloat(filters.montantMin);
      }
      if (filters.montantMax !== '') {
        params.montant_max = parseFloat(filters.montantMax);
      }
      if (filters.estActif !== '') {
        params.est_actif = filters.estActif === 'true';
      }

      // Récupérer les transactions
      const data = await get('/transactions', {
        params: {
          ...params,
          limit: 1000, // Limite élevée pour récupérer toutes les transactions
        },
      });

      setTransactions(data || []);
    } catch (err) {
      console.error('Erreur lors du chargement des transactions:', err);
      setError(
        err?.message || 'Une erreur est survenue lors du chargement des transactions'
      );
    } finally {
      setLoading(false);
    }
  };

  // Charger les donnÃ©es de rÃ©fÃ©rence au montage
  useEffect(() => {
    fetchReferenceData();
  }, []);

  // Charger les transactions au montage et lorsque les filtres changent
  useEffect(() => {
    fetchTransactions();
  }, [filters]);

  useEffect(() => {
    const sourceBatimentId = location.state?.sourceBatimentId;
    if (!sourceBatimentId) return;

    setPrefillBatimentId(sourceBatimentId);
    setEditingTransaction(null);
    setFormError(null);
    setModalOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  /**
   * GÃ¨re l'ouverture de la modal pour crÃ©er une nouvelle transaction.
   */
  const handleCreate = () => {
    setEditingTransaction(null);
    setPrefillBatimentId(null);
    setFormError(null);
    setModalOpen(true);
  };

  /**
   * GÃ¨re l'ouverture de la page de dÃ©tails d'une transaction.
   */
  const handleViewDetails = (transaction) => {
    navigate(`/transactions/${transaction.id_transaction}`);
  };

  /**
   * GÃ¨re l'ouverture de la modal pour Ã©diter une transaction existante.
   */
  const handleEdit = async (transaction) => {
    try {
      // RÃ©cupÃ©rer les dÃ©tails complets de la transaction
      const details = await get(`/transactions/${transaction.id_transaction}`);
      setEditingTransaction(details);
      setPrefillBatimentId(null);
      setFormError(null);
      setModalOpen(true);
    } catch (err) {
      console.error('Erreur lors de la rÃ©cupÃ©ration des dÃ©tails:', err);
      setError(err?.message || 'Erreur lors de la rÃ©cupÃ©ration des dÃ©tails');
    }
  };

  /**
   * GÃ¨re la soumission du formulaire (crÃ©ation ou Ã©dition).
   */
  const handleSubmit = async (data) => {
    setFormLoading(true);
    setFormError(null);

    try {
      let result = null;
      
      if (editingTransaction) {
        // Mode Ã©dition : PUT (une seule transaction)
        // Extraire les donnÃ©es de paiement si prÃ©sentes
        const { paiement, ...transactionData } = data;
        
        result = await put(`/transactions/${editingTransaction.id_transaction}`, transactionData);
        
        // GÃ©rer les paiements si prÃ©sents
        if (data.paiements && data.paiements.length > 0) {
          const paymentsPromises = data.paiements.map(async (p) => {
            const pData = {
              ...p,
              id_transaction: editingTransaction.id_transaction,
            };
            if (p.id_paiement) {
              return put(`/paiements/${p.id_paiement}`, pData);
            } else {
              return post('/paiements', pData);
            }
          });
          try {
            await Promise.all(paymentsPromises);
          } catch (err) {
            console.error('Erreur lors de la gestion des paiements:', err);
            notification.warning('Transaction modifiÃ©e mais certains paiements ont Ã©chouÃ©');
          }
        }
        
        notification.success('Transaction modifiÃ©e avec succÃ¨s');
      } else {
        // Mode crÃ©ation : vÃ©rifier si c'est un batch ou une transaction simple
        if (data.batch && data.transactions) {
          // CrÃ©ation batch : POST /transactions/batch
          result = await post('/transactions/batch', data.transactions);
          
          // CrÃ©er les paiements pour les lignes qui ont ajouter_paiement = true
          if (result && Array.isArray(result) && data.lignesData) {
            const allPaiementsInBatch = [];
            
            result.forEach((transaction, index) => {
              const ligneData = data.lignesData[index];
              if (ligneData?.ajouter_paiement && ligneData.paiements?.length > 0) {
                ligneData.paiements.forEach(p => {
                  allPaiementsInBatch.push({
                    id_transaction: transaction.id_transaction,
                    date_paiement: p.date,
                    montant: parseFloat(p.montant),
                    type_paiement: p.type,
                    numero_cheque: p.numero_cheque || null,
                    banque: p.banque || null,
                    reference_virement: p.reference || null,
                    id_lc: p.id_lc || null,
                    notes: p.notes || null,
                  });
                });
              }
            });
            
            if (allPaiementsInBatch.length > 0) {
              try {
                await post('/paiements/batch', { paiements: allPaiementsInBatch });
                notification.success(`${result.length} transactions crÃ©Ã©es avec ${allPaiementsInBatch.length} paiements.`);
              } catch (err) {
                console.error('Erreur lors de la crÃ©ation du batch de paiements:', err);
                notification.warning(`${result.length} transactions crÃ©Ã©es mais Ã©chec de crÃ©ation des paiements.`);
              }
            } else {
              notification.success(`${result.length} transaction(s) crÃ©Ã©e(s)`);
            }
          }
        } else {
          // CrÃ©ation simple : POST /transactions
          result = await post('/transactions', data);
        }
      }

      // Fermer la modal et rafraÃ®chir la liste
      setModalOpen(false);
      setEditingTransaction(null);
      setPrefillBatimentId(null);
      await fetchTransactions();
      
      return result;
    } catch (err) {
      console.error('Erreur lors de la soumission:', err);
      setFormError(
        err?.message || 'Une erreur est survenue lors de l\'enregistrement'
      );
      throw err; // Re-throw pour que le formulaire puisse gÃ©rer les erreurs de validation
    } finally {
      setFormLoading(false);
    }
  };

  /**
   * GÃ¨re la fermeture de la modal.
   */
  const handleCloseModal = () => {
    if (!formLoading) {
      setModalOpen(false);
      setEditingTransaction(null);
      setPrefillBatimentId(null);
      setFormError(null);
    }
  };

  /**
   * GÃ¨re le clic sur le bouton de suppression.
   */
  const handleDeleteClick = (transaction) => {
    setTransactionToDelete(transaction);
    setDeleteDialogOpen(true);
  };

  /**
   * GÃ¨re la confirmation de suppression.
   */
  const handleDeleteConfirm = async () => {
    if (!transactionToDelete) return;

    setDeleteLoading(true);

    try {
      // Appeler l'API pour supprimer (soft delete)
      await del(`/transactions/${transactionToDelete.id_transaction}`);

      // Fermer le dialogue et rafraÃ®chir la liste
      setDeleteDialogOpen(false);
      setTransactionToDelete(null);
      await fetchTransactions();
    } catch (err) {
      console.error('Erreur lors de la suppression:', err);
      setError(
        err?.message || 'Une erreur est survenue lors de la suppression'
      );
      setDeleteDialogOpen(false);
      setTransactionToDelete(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  /**
   * GÃ¨re l'annulation de la suppression.
   */
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setTransactionToDelete(null);
  };

  /**
   * GÃ¨re la rÃ©activation d'une transaction.
   */
  const handleReactivate = async (transaction) => {
    try {
      // Appeler l'API pour rÃ©activer (PATCH)
      await patch(`/transactions/${transaction.id_transaction}/reactivate`, {});
      
      // RafraÃ®chir la liste
      await fetchTransactions();
      
      // Notification de succÃ¨s
      notification.success('Transaction rÃ©activÃ©e avec succÃ¨s');
    } catch (err) {
      console.error('Erreur lors de la rÃ©activation:', err);
      setError(
        err?.message || 'Une erreur est survenue lors de la rÃ©activation'
      );
    }
  };

  /**
   * Formate le montant pour l'affichage (wrapper de l'utilitaire).
   */
  const formatMontant = (montant, options = {}) => {
    return formatMontantUtil(montant, { useCompactNotation: false, ...options });
  };

  /**
   * GÃ¨re l'export Excel des transactions filtrÃ©es.
   */
  const handleExportExcel = () => {
    try {
      const columnsForExport = columns.filter((col) => col.id !== 'est_actif');
      const totalMontant = rowsForExport.reduce(
        (acc, row) => acc + (row?.montant_total ? Number(row.montant_total) : 0),
        0
      );

      const createEmptyRow = () =>
        columnsForExport.reduce((acc, col) => {
          acc[col.id] = '';
          return acc;
        }, {});

      const spacerRow = { ...createEmptyRow(), __summaryType: 'spacer' };

      const montantColumnIndex = columnsForExport.findIndex(
        (col) => col.id === 'montant_total'
      );
      const totalLabelColumnId =
        montantColumnIndex > 0
          ? columnsForExport[montantColumnIndex - 1]?.id
          : null;

      const totalRow = {
        ...createEmptyRow(),
        __summaryType: 'total',
        montant_total: totalMontant,
      };

      if (totalLabelColumnId) {
        totalRow[totalLabelColumnId] = 'Total :';
      }

      const dataForExcel = [...rowsForExport, spacerRow, totalRow];

      // Utiliser des formatters personnalisÃ©s pour l'export
      const customFormatters = {
        date_transaction: (value, row) => {
          if (row?.__summaryType) return '';
          if (!value) return '-';
          try {
            return format(new Date(value), 'dd/MM/yyyy', { locale: fr });
          } catch {
            return value;
          }
        },
        produit: (value, row) => {
          if (row?.__summaryType) return '';
          return produitsMap.get(row.id_produit) || `Produit #${row.id_produit}`;
        },
        batiment: (value, row) => {
          if (row?.__summaryType) return '';
          return row.id_batiment
            ? (batimentsMap.get(row.id_batiment) || `Bâtiment #${row.id_batiment}`)
            : '-';
        },
        reglement: (value, row) => {
          if (row?.__summaryType) return '';
          return getPaymentReglementSummary(row);
        },
        montant_total: (value, row) => {
          if (row?.__summaryType === 'spacer') return '';
          if (row?.__summaryType === 'total') {
            return new Intl.NumberFormat('fr-FR', {
              style: 'currency',
              currency: 'MAD',
            }).format(value || 0);
          }
          if (value === null || value === undefined) return '-';
          return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'MAD',
          }).format(value);
        },
        montant_paye: (value, row) => {
          if (row?.__summaryType) return '';
          if (value === null || value === undefined) return '-';
          return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'MAD',
          }).format(value);
        },
        montant_restant: (value, row) => {
          if (row?.__summaryType) return '';
          if (value === null || value === undefined) return '-';
          return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'MAD',
          }).format(value);
        },
      };

      exportToExcelAdvanced(
        dataForExcel,
        columnsForExport,
        `transactions_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}`,
        'Transactions',
        customFormatters
      );
    } catch (error) {
      console.error('Erreur lors de l\'export Excel:', error);
      setError('Une erreur est survenue lors de l\'export Excel');
    }
  };

  /**
   * GÃ¨re l'export PDF des transactions filtrÃ©es.
   */
  const handleExportPDF = () => {
    try {
      const columnsForExport = columns.filter((col) => col.id !== 'est_actif');
      const totalMontant = rowsForExport.reduce(
        (acc, row) => acc + (row?.montant_total ? Number(row.montant_total) : 0),
        0
      );
      const totalMontantFormatted =
        new Intl.NumberFormat('fr-FR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
          .format(totalMontant)
          .replace(/\s/g, '\u00A0') + '\u00A0MAD';

      const customFormatters = {
        date_transaction: (value) => {
          if (!value) return '-';
          try {
            return format(new Date(value), 'dd/MM/yyyy', { locale: fr });
          } catch {
            return value;
          }
        },
        produit: (value, row) => {
          return produitsMap.get(row.id_produit) || `Produit #${row.id_produit}`;
        },
        batiment: (value, row) => {
          return row.id_batiment
            ? (batimentsMap.get(row.id_batiment) || `Bâtiment #${row.id_batiment}`)
            : '-';
        },
        reglement: (value, row) => getPaymentReglementSummary(row),
        montant_total: (value) => {
          if (value === null || value === undefined) return '-';
          // Conserver les sÃ©parateurs de milliers et empÃªcher les retours Ã  la ligne
          return (
            new Intl.NumberFormat('fr-FR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
              .format(value)
              .replace(/\s/g, '\u00A0') + '\u00A0MAD'
          );
        },
        montant_paye: (value) => {
          if (value === null || value === undefined) return '-';
          return (
            new Intl.NumberFormat('fr-FR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
              .format(value)
              .replace(/\s/g, '\u00A0') + '\u00A0MAD'
          );
        },
        montant_restant: (value) => {
          if (value === null || value === undefined) return '-';
          return (
            new Intl.NumberFormat('fr-FR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
              .format(value)
              .replace(/\s/g, '\u00A0') + '\u00A0MAD'
          );
        },
      };

      exportToPDF(
        rowsForExport,
        columnsForExport,
        'Rapport des Transactions',
        'rapport_transactions',
        { 
          customFormatters,
          colorByType: (rowIndex, tableData) => {
            // Retourne true si c'est une entrÃ©e (client), false si sortie (fournisseur)
            const transaction = rowsForExport[rowIndex];
            if (!transaction) return null;
            return transaction.id_client !== null;
          },
          footerTotals: {
            label: 'Total :',
            value: totalMontantFormatted,
            columnId: 'montant_total',
          },
        }
      );
    } catch (error) {
      console.error('Erreur lors de l\'export PDF:', error);
      setError('Une erreur est survenue lors de l\'export PDF');
    }
  };

  /**
   * Obtient le nom du client ou fournisseur pour une transaction.
   */
  const getClientOuFournisseur = (transaction) => {
    if (transaction.id_client) {
      return clientsMap.get(transaction.id_client) || `Client #${transaction.id_client}`;
    } else if (transaction.id_fournisseur) {
      return fournisseursMap.get(transaction.id_fournisseur) || `Fournisseur #${transaction.id_fournisseur}`;
    }
    return '-';
  };

  /**
   * Configuration des colonnes utilisées pour les exports.
   * Ordre : ID, Date, Client/Fournisseur, Produit, Bâtiment, Quantité, montants, règlement, statut.
   * mobilePriority: true pour les colonnes Ã  afficher en prioritÃ© sur mobile
   */
  const columns = [
    {
      id: 'id_transaction',
      label: 'ID',
      sortable: true,
      filterable: false,
      align: 'right',
      mobilePriority: false,
    },
    {
      id: 'date_transaction',
      label: 'Date',
      sortable: true,
      filterable: false,
      mobilePriority: true,
      format: (value) => {
        if (!value) return '-';
        try {
          return format(new Date(value), 'dd/MM/yyyy', { locale: fr });
        } catch {
          return value;
        }
      },
    },
    {
      id: 'client_ou_fournisseur',
      label: 'Client / Fournisseur',
      sortable: false,
      filterable: false,
      mobilePriority: true,
      format: (value, row) => {
        const isClient = row.id_client !== null;
        const name = getClientOuFournisseur(row);
        
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: isClient ? 'success.main' : 'error.main',
                flexShrink: 0,
              }}
            />
            <Typography variant="body2">{name}</Typography>
          </Box>
        );
      },
    },
    {
      id: 'produit',
      label: 'Produit vendu / acheté',
      sortable: false,
      filterable: false,
      mobilePriority: false,
      format: (value, row) => {
        return produitsMap.get(row.id_produit) || `Produit #${row.id_produit}`;
      },
    },
    {
      id: 'batiment',
      label: 'Bâtiment',
      sortable: false,
      filterable: false,
      mobilePriority: false,
      format: (value, row) => {
        return row.id_batiment
          ? (batimentsMap.get(row.id_batiment) || `Bâtiment #${row.id_batiment}`)
          : '-';
      },
    },
    {
      id: 'quantite',
      label: 'Quantité',
      sortable: true,
      filterable: false,
      align: 'right',
      mobilePriority: false,
    },
    {
      id: 'montant_total',
      label: 'Montant total',
      sortable: true,
      filterable: false,
      align: 'right',
      mobilePriority: true,
      format: (value, row) => {
        // Vert pour les entrÃ©es d'argent (transactions clients)
        // Rouge pour les sorties d'argent (transactions fournisseurs)
        const isEntree = row.id_client !== null;
        const color = isEntree ? 'success.main' : 'error.main';
        
        const formatted = formatMontant(value);
        return (
          <Typography
            component="span"
            variant="body2"
            fontWeight="bold"
            sx={{
              color,
              display: 'inline-flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {formatted}
          </Typography>
        );
      },
    },
    {
      id: 'montant_paye',
      label: 'Payé',
      sortable: true,
      filterable: false,
      align: 'right',
      mobilePriority: false,
      format: (value) => formatMontant(value || 0),
    },
    {
      id: 'montant_restant',
      label: 'Reste',
      sortable: true,
      filterable: false,
      align: 'right',
      mobilePriority: false,
      format: (value) => formatMontant(value || 0),
    },
    {
      id: 'reglement',
      label: 'Règlement',
      sortable: false,
      filterable: false,
      mobilePriority: false,
      format: (value, row) => getPaymentReglementSummary(row),
    },
    {
      id: 'statut_paiement',
      label: 'Paiement',
      sortable: false,
      filterable: false,
      mobilePriority: false,
      format: (value, row) => {
        // DÃ©terminer le statut : si en retard, afficher "en_retard", sinon le statut normal
        const statut = row.est_en_retard ? 'en_retard' : (row.statut_paiement || 'impaye');
        return <PaymentStatusBadge statut={statut} />;
      },
    },
    {
      id: 'est_actif',
      label: 'Statut',
      sortable: true,
      filterable: false,
      mobilePriority: false,
      format: (value) => (
        <Chip
          label={value ? 'Actif' : 'Inactif'}
          color={value ? 'success' : 'default'}
          size="small"
        />
      ),
    },
  ];

  // Préparer les données pour le registre
  const transactionsForGrid = useMemo(() => {
    return transactions.map((transaction) => ({
      ...transaction,
      client_ou_fournisseur: getClientOuFournisseur(transaction),
      id: transaction.id_transaction, // ID pour React key
    }));
  }, [transactions, clientsMap, fournisseursMap, produitsMap]);

  const transactionSummary = useMemo(() => {
    const ventes = transactionsForGrid.filter((transaction) => transaction.id_client !== null);
    const achats = transactionsForGrid.filter((transaction) => transaction.id_fournisseur !== null);
    const nonPayees = transactionsForGrid.filter((transaction) => {
      const statut = transaction.est_en_retard ? 'en_retard' : (transaction.statut_paiement || 'impaye');
      return statut === 'impaye' || statut === 'partiel' || statut === 'en_retard';
    });

    return {
      total: transactionsForGrid.length,
      ventes: ventes.length,
      achats: achats.length,
      nonPayees: nonPayees.length,
      totalVentes: ventes.reduce((sum, transaction) => sum + parseFloat(transaction.montant_total || 0), 0),
      totalAchats: achats.reduce((sum, transaction) => sum + parseFloat(transaction.montant_total || 0), 0),
    };
  }, [transactionsForGrid]);

  const quickFilterOptions = useMemo(() => [
    { id: 'all', label: 'Tout', count: transactionSummary.total },
    { id: 'ventes', label: 'Ventes', count: transactionSummary.ventes },
    { id: 'achats', label: 'Achats', count: transactionSummary.achats },
    { id: 'non_payees', label: 'Non payées', count: transactionSummary.nonPayees },
  ], [transactionSummary]);

  const displayedTransactions = useMemo(() => {
    return transactionsForGrid.filter((transaction) => {
      if (quickFilter === 'ventes') return transaction.id_client !== null;
      if (quickFilter === 'achats') return transaction.id_fournisseur !== null;
      if (quickFilter === 'non_payees') {
        const statut = transaction.est_en_retard ? 'en_retard' : (transaction.statut_paiement || 'impaye');
        return statut === 'impaye' || statut === 'partiel' || statut === 'en_retard';
      }
      return true;
    });
  }, [quickFilter, transactionsForGrid]);

  /**
   * Lignes actuellement affichées dans le registre, utilisées pour les exports.
   */
  const rowsForExport = displayedTransactions;

  return (
    <Box sx={{ maxWidth: 1480, mx: 'auto', overflowX: 'hidden' }}>
      <Box
        sx={{
          p: { xs: 2, md: 3 },
          mb: 3,
          borderRadius: 4,
          border: '1px solid',
          borderColor: 'divider',
          background:
            'linear-gradient(135deg, rgba(240,253,250,0.92), rgba(255,251,235,0.82)), #fff',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'flex-start' }}
          spacing={2}
        >
          <Box>
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: '1.8rem', md: '2.45rem' },
                fontWeight: 900,
                letterSpacing: 0,
                color: '#17211D',
              }}
            >
              Ventes & achats
            </Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
            <Button
              variant="outlined"
              startIcon={<FileDownloadIcon />}
              onClick={handleExportExcel}
              disabled={loading || rowsForExport.length === 0}
            >
              Export Excel
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<PictureAsPdfIcon />}
              onClick={handleExportPDF}
              disabled={loading || rowsForExport.length === 0}
            >
              Export PDF
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
              Nouvelle transaction
            </Button>
          </Stack>
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <TransactionMetric
            label="Toutes les opérations"
            value={transactionSummary.total}
            helper="Dans le résultat actuel"
            icon={<ReceiptLongIcon />}
            color="#315F85"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <TransactionMetric
            label="Ventes"
            value={formatMontant(transactionSummary.totalVentes)}
            helper={`${transactionSummary.ventes} transaction(s) client`}
            icon={<TrendingUpIcon />}
            color="#1D6F50"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <TransactionMetric
            label="Achats"
            value={formatMontant(transactionSummary.totalAchats)}
            helper={`${transactionSummary.achats} transaction(s) fournisseur`}
            icon={<TrendingDownIcon />}
            color="#A84435"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <TransactionMetric
            label="À suivre"
            value={transactionSummary.nonPayees}
            helper="Impayées, partielles ou en retard"
            icon={<PaymentsIcon />}
            color="#A96522"
          />
        </Grid>
      </Grid>

      <Card sx={{ mb: 2.5, borderRadius: 2 }}>
        <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {quickFilterOptions.map((option) => (
                <Button
                  key={option.id}
                  variant={quickFilter === option.id ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => setQuickFilter(option.id)}
                  sx={{ borderRadius: 999 }}
                >
                  {option.label} ({option.count})
                </Button>
              ))}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <SmartFilterPanel
        pageKey="transactions"
        filterDefinitions={filterDefinitions}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearAll={handleClearAllFilters}
        maxInlineFilters={2}
        resultCount={displayedTransactions.length}
        totalCount={transactions.length}
      />

      <TransactionsExcelRegister
        rows={displayedTransactions}
        loading={loading}
        getClientOuFournisseur={getClientOuFournisseur}
        produitsMap={produitsMap}
        batimentsMap={batimentsMap}
        formatMontant={formatMontant}
        onView={handleViewDetails}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
        onReactivate={handleReactivate}
      />

      <TransactionForm
        open={modalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        initialValues={editingTransaction || {}}
        loading={formLoading}
        errorMessage={formError}
        prefillBatimentId={prefillBatimentId}
      />

      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">Confirmer la suppression</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Retirer cette transaction du registre actif ?
            <br />
            <br />
            Elle restera dans l'historique et pourra être réactivée plus tard.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deleteLoading} color="inherit">
            Annuler
          </Button>
          <Button onClick={handleDeleteConfirm} disabled={deleteLoading} color="error" variant="contained">
            {deleteLoading ? 'Suppression...' : 'Supprimer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

}

function TransactionMetric({ label, value, helper, icon, color }) {
  return (
    <Card sx={{ height: '100%', borderRadius: 2 }}>
      <CardContent sx={{ p: 2.25 }}>
        <Stack direction="row" spacing={1.5} justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography
              variant="overline"
              sx={{ color: 'text.secondary', fontWeight: 800, letterSpacing: '0.08em' }}
            >
              {label}
            </Typography>
            <Typography sx={{ mt: 0.5, fontWeight: 900, fontSize: '1.5rem', letterSpacing: 0 }}>
              {value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {helper}
            </Typography>
          </Box>
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color,
              backgroundColor: `${color}1F`,
              flexShrink: 0,
              '& .MuiSvgIcon-root': { fontSize: 22 },
            }}
          >
            {icon}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

const PAYMENT_TYPE_LABELS = {
  cash: 'Espèce',
  cheque: 'Chèque',
  virement: 'Virement',
  carte: 'Carte',
  compensation: 'Compensation',
  lc: 'LC',
  autre: 'Autre',
};

const REFERENCE_PAYMENT_TYPES = new Set(['cheque', 'virement', 'lc']);

const formatDateSafe = (value, pattern = 'dd/MM/yyyy') => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return format(date, pattern, { locale: fr });
};

const getDateKey = (value) => {
  if (!value) return 'sans-date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'sans-date';
  return format(date, 'yyyy-MM-dd');
};

const getDateTimestamp = (value) => {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getTime();
};

const formatNumberValue = (value) => {
  const number = Number(value || 0);
  return new Intl.NumberFormat('fr-FR').format(number);
};

const getPaymentStatus = (transaction) => (
  transaction.est_en_retard ? 'en_retard' : (transaction.statut_paiement || 'impaye')
);

const getPaymentTypeLabel = (payment) => (
  PAYMENT_TYPE_LABELS[payment?.type_paiement] || payment?.type_paiement || 'Paiement'
);

const getPaymentReferenceValue = (payment) => {
  if (!payment) return null;

  if (payment.type_paiement === 'cheque') {
    return payment.numero_cheque || null;
  }

  if (payment.type_paiement === 'virement') {
    return payment.reference_virement || null;
  }

  if (payment.type_paiement === 'lc') {
    return payment.numero_reference_lc || (payment.id_lc ? `LC ${payment.id_lc}` : null);
  }

  return payment.reference_virement
    || payment.numero_cheque
    || payment.numero_reference_lc
    || (payment.id_lc ? `LC ${payment.id_lc}` : null);
};

const formatPaymentAmountForSummary = (value) => {
  if (value === null || value === undefined) return null;
  return (
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
      .format(Number(value || 0))
      .replace(/\s/g, '\u00A0') + '\u00A0MAD'
  );
};

const getPaymentReglementLabel = (payment, formatAmount = formatPaymentAmountForSummary) => {
  if (!payment) return null;

  const label = getPaymentTypeLabel(payment);
  const reference = getPaymentReferenceValue(payment);
  const referenceText = reference
    ? ` ${reference}`
    : (REFERENCE_PAYMENT_TYPES.has(payment?.type_paiement) ? ' réf. manquante' : '');
  const amount = payment.montant !== null && payment.montant !== undefined
    ? formatAmount(payment.montant)
    : null;

  return [amount ? `${label}${referenceText} · ${amount}` : `${label}${referenceText}`]
    .filter(Boolean)
    .join('');
};

const getPaymentReglementSummary = (transaction, formatAmount = formatPaymentAmountForSummary) => {
  const reglements = (transaction.paiements || [])
    .map((payment) => getPaymentReglementLabel(payment, formatAmount))
    .filter(Boolean);

  return reglements.length > 0 ? reglements.join(' | ') : '-';
};

const getSignedAmount = (transaction, field = 'montant_total') => {
  const amount = Math.abs(Number(transaction[field] || 0));
  return transaction.id_client !== null ? amount : -amount;
};

const formatSignedAmount = (amount, formatMontant) => {
  if (!amount) return formatMontant(0);
  const sign = amount > 0 ? '+' : '-';
  return `${sign}${formatMontant(Math.abs(amount))}`;
};

function TransactionsExcelRegister({
  rows,
  loading,
  getClientOuFournisseur,
  produitsMap,
  batimentsMap,
  formatMontant,
  onView,
  onEdit,
  onDelete,
  onReactivate,
}) {
  const groupedRows = useMemo(() => {
    const sortedRows = [...rows].sort((a, b) => {
      const dateDiff = getDateTimestamp(b.date_transaction) - getDateTimestamp(a.date_transaction);
      if (dateDiff !== 0) return dateDiff;
      return Number(b.id_transaction || 0) - Number(a.id_transaction || 0);
    });

    const groups = new Map();

    sortedRows.forEach((transaction) => {
      const dateKey = getDateKey(transaction.date_transaction);
      const existingGroup = groups.get(dateKey);
      const group = existingGroup || {
        dateKey,
        label: dateKey === 'sans-date' ? 'Sans date' : formatDateSafe(transaction.date_transaction),
        rows: [],
        entries: 0,
        exits: 0,
        paid: 0,
        remaining: 0,
        followUpCount: 0,
      };

      const total = Math.abs(Number(transaction.montant_total || 0));
      if (transaction.id_client !== null) {
        group.entries += total;
      } else {
        group.exits += total;
      }
      group.paid += Math.abs(Number(transaction.montant_paye || 0));
      group.remaining += Math.abs(Number(transaction.montant_restant || 0));

      const status = getPaymentStatus(transaction);
      if (status === 'impaye' || status === 'partiel' || status === 'en_retard') {
        group.followUpCount += 1;
      }

      group.rows.push(transaction);
      groups.set(dateKey, group);
    });

    return Array.from(groups.values());
  }, [rows]);

  return (
    <Card variant="outlined" sx={{ borderRadius: 4, overflow: 'hidden', minWidth: 0 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 }, minWidth: 0 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'flex-start' }}
          spacing={1.5}
          sx={{ mb: 2 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={900}>Registre des transactions</Typography>
          </Box>
          <Chip
            label={`${rows.length} opération${rows.length > 1 ? 's' : ''}`}
            sx={{ alignSelf: { xs: 'flex-start', md: 'center' }, fontWeight: 900 }}
          />
        </Stack>

        <TableContainer
          sx={{
            width: '100%',
            maxWidth: '100%',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 3,
            backgroundColor: 'background.paper',
          }}
        >
          <Table
            size="small"
            sx={{
              minWidth: { xs: 1120, md: 1240 },
              '& th': {
                py: 1.25,
                px: 1.5,
                bgcolor: '#edf5ef',
                color: '#263d3a',
                fontWeight: 900,
                whiteSpace: 'nowrap',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontSize: { xs: '0.68rem', md: '0.76rem' },
                borderBottom: '1px solid',
                borderColor: 'divider',
              },
              '& td': {
                py: 1.15,
                px: 1.5,
                whiteSpace: 'nowrap',
                fontSize: { xs: '0.72rem', md: '0.8125rem' },
                borderBottom: '1px solid',
                borderColor: 'divider',
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={stickyDateHeaderSx}>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Client / Fournisseur</TableCell>
                <TableCell>Produit</TableCell>
                <TableCell>Bâtiment</TableCell>
                <TableCell align="right">Quantité</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right">Payé</TableCell>
                <TableCell align="right">Reste</TableCell>
                <TableCell>Règlement</TableCell>
                <TableCell>Statut</TableCell>
                <TableCell align="center" sx={stickyActionHeaderSx} aria-label="Actions" />
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 5 }}>
                    Chargement des transactions...
                  </TableCell>
                </TableRow>
              ) : groupedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 5 }}>
                    <Typography fontWeight={800}>Aucune transaction trouvée</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Essayez d'élargir la période ou de supprimer certains filtres.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                groupedRows.map((group) => (
                  <React.Fragment key={group.dateKey}>
                    <TableRow>
                      <TableCell sx={stickyDateGroupSx}>{group.label}</TableCell>
                      <TableCell colSpan={11} sx={groupRowSx}>
                        Journée du {group.label} - {group.rows.length} opération{group.rows.length > 1 ? 's' : ''}
                      </TableCell>
                    </TableRow>

                    {group.rows.map((transaction) => (
                      <TransactionExcelRow
                        key={transaction.id_transaction}
                        transaction={transaction}
                        getClientOuFournisseur={getClientOuFournisseur}
                        produitsMap={produitsMap}
                        batimentsMap={batimentsMap}
                        formatMontant={formatMontant}
                        onView={onView}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onReactivate={onReactivate}
                      />
                    ))}

                    <TableRow>
                      <TableCell sx={stickyDateSummarySx}>Total jour</TableCell>
                      <TableCell colSpan={5} sx={summaryRowSx}>
                        Entrées {formatMontant(group.entries)} | Sorties {formatMontant(group.exits)}
                      </TableCell>
                      <TableCell align="right" sx={summaryRowSx}>
                        <Typography component="span" fontWeight={900} color={group.entries - group.exits >= 0 ? 'success.main' : 'error.main'}>
                          {formatSignedAmount(group.entries - group.exits, formatMontant)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={summaryRowSx}>{formatMontant(group.paid)}</TableCell>
                      <TableCell align="right" sx={summaryRowSx}>{formatMontant(group.remaining)}</TableCell>
                      <TableCell colSpan={3} sx={summaryRowSx}>
                        {group.followUpCount > 0
                          ? `${group.followUpCount} opération${group.followUpCount > 1 ? 's' : ''} à suivre`
                          : 'Tout est réglé'}
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

      </CardContent>
    </Card>
  );
}

function PaymentReglementsCell({ payments, formatMontant }) {
  if (!payments || payments.length === 0) {
    return <Typography color="text.secondary">Aucun règlement</Typography>;
  }

  return (
    <Box sx={{ display: 'flex', gap: 0.65, flexWrap: 'wrap', maxWidth: 380 }}>
      {payments.map((payment, index) => {
        const label = getPaymentReglementLabel(payment, formatMontant);
        const reference = getPaymentReferenceValue(payment);
        const missingReference = REFERENCE_PAYMENT_TYPES.has(payment?.type_paiement) && !reference;
        const isLc = payment?.type_paiement === 'lc';
        const isCash = payment?.type_paiement === 'cash';
        const color = missingReference ? '#9a5b00' : (isLc ? '#315f85' : '#0f5f4b');
        const backgroundColor = missingReference
          ? 'rgba(237, 108, 2, 0.12)'
          : (isLc ? 'rgba(49, 95, 133, 0.12)' : 'rgba(16, 114, 90, 0.10)');

        return (
          <Tooltip
            key={payment.id_paiement || `${payment.type_paiement}-${index}`}
            title={label}
          >
            <Chip
              size="small"
              label={label}
              sx={{
                maxWidth: isCash ? 140 : 270,
                height: 24,
                fontWeight: 850,
                color,
                backgroundColor,
                '& .MuiChip-label': {
                  px: 0.9,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                },
              }}
            />
          </Tooltip>
        );
      })}
    </Box>
  );
}

function TransactionExcelRow({
  transaction,
  getClientOuFournisseur,
  produitsMap,
  batimentsMap,
  formatMontant,
  onView,
  onEdit,
  onDelete,
  onReactivate,
}) {
  const isSale = transaction.id_client !== null;
  const paymentStatus = getPaymentStatus(transaction);
  const productName = produitsMap.get(transaction.id_produit) || `Produit #${transaction.id_produit}`;
  const partnerName = getClientOuFournisseur(transaction);
  const batimentName = transaction.id_batiment
    ? (batimentsMap.get(transaction.id_batiment) || `Bâtiment #${transaction.id_batiment}`)
    : '-';
  const paidAmount = Number(transaction.montant_paye || 0);
  const remainingAmount = Number(transaction.montant_restant || 0);
  const totalAmount = getSignedAmount(transaction);
  const inactive = transaction.est_actif === false;
  const rowBackground = inactive ? 'grey.50' : 'background.paper';
  const [actionMenuAnchor, setActionMenuAnchor] = useState(null);
  const actionMenuOpen = Boolean(actionMenuAnchor);
  const hasRowActions = Boolean(onView || (onEdit && !inactive) || (inactive && onReactivate) || (!inactive && onDelete));

  const handleOpenActionMenu = (event) => {
    setActionMenuAnchor(event.currentTarget);
  };

  const handleCloseActionMenu = () => {
    setActionMenuAnchor(null);
  };

  const handleMenuAction = (action) => {
    handleCloseActionMenu();
    action(transaction);
  };

  return (
    <TableRow
      hover={!inactive}
      sx={{
        opacity: inactive ? 0.72 : 1,
        '& td': { bgcolor: rowBackground },
      }}
    >
      <TableCell sx={{ ...stickyDateBodySx, bgcolor: rowBackground }}>
        {formatDateSafe(transaction.date_transaction, 'dd/MM')}
      </TableCell>
      <TableCell>
        <Chip
          size="small"
          label={isSale ? 'Vente' : 'Achat'}
          sx={{
            fontWeight: 900,
            color: isSale ? 'success.main' : 'error.main',
            backgroundColor: isSale ? 'rgba(46, 125, 50, 0.09)' : 'rgba(211, 47, 47, 0.09)',
          }}
        />
      </TableCell>
      <TableCell>
        <Typography fontWeight={850} sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {partnerName}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {productName}
        </Typography>
      </TableCell>
      <TableCell>{batimentName}</TableCell>
      <TableCell align="right">{formatNumberValue(transaction.quantite)}</TableCell>
      <TableCell align="right">
        <Typography component="span" fontWeight={900} color={isSale ? 'success.main' : 'error.main'}>
          {formatSignedAmount(totalAmount, formatMontant)}
        </Typography>
      </TableCell>
      <TableCell align="right">{formatMontant(paidAmount)}</TableCell>
      <TableCell align="right">
        <Typography component="span" fontWeight={800} color={remainingAmount > 0 ? 'warning.main' : 'success.main'}>
          {formatMontant(remainingAmount)}
        </Typography>
      </TableCell>
      <TableCell sx={{ whiteSpace: 'normal', minWidth: 250 }}>
        <PaymentReglementsCell payments={transaction.paiements || []} formatMontant={formatMontant} />
      </TableCell>
      <TableCell>
        {inactive ? (
          <Chip size="small" label="Inactive" sx={{ fontWeight: 800 }} />
        ) : (
          <PaymentStatusBadge statut={paymentStatus} />
        )}
      </TableCell>
      <TableCell align="right" sx={stickyActionBodySx}>
        <Stack direction="row" spacing={0} justifyContent="center" alignItems="center" sx={{ minWidth: 28 }}>
          {hasRowActions && (
            <>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 1,
                  bgcolor: rowBackground,
                }}
              >
                <Tooltip title="Actions">
                  <IconButton size="small" onClick={handleOpenActionMenu} sx={{ width: 26, height: 26, p: 0.25 }}>
                    <MoreVertIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Box>
              <Menu
                anchorEl={actionMenuAnchor}
                open={actionMenuOpen}
                onClose={handleCloseActionMenu}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              >
                {onView && (
                  <MenuItem onClick={() => handleMenuAction(onView)}>
                    <VisibilityIcon fontSize="small" sx={{ mr: 1 }} />
                    Voir
                  </MenuItem>
                )}
                {onEdit && !inactive && (
                  <MenuItem onClick={() => handleMenuAction(onEdit)}>
                    <EditIcon fontSize="small" sx={{ mr: 1 }} />
                    Modifier
                  </MenuItem>
                )}
                {inactive && onReactivate ? (
                  <MenuItem onClick={() => handleMenuAction(onReactivate)}>
                    <RestoreIcon fontSize="small" sx={{ mr: 1 }} />
                    Réactiver
                  </MenuItem>
                ) : onDelete ? (
                  <MenuItem onClick={() => handleMenuAction(onDelete)} sx={{ color: 'error.main' }}>
                    <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
                    Désactiver
                  </MenuItem>
                ) : null}
              </Menu>
            </>
          )}
        </Stack>
      </TableCell>
    </TableRow>
  );
}

const stickyDateHeaderSx = {
  position: 'sticky',
  left: 0,
  zIndex: 4,
  boxShadow: '1px 0 0 rgba(15, 23, 42, 0.08)',
};

const stickyDateBodySx = {
  position: 'sticky',
  left: 0,
  zIndex: 2,
  fontWeight: 850,
  boxShadow: '1px 0 0 rgba(15, 23, 42, 0.08)',
};

const stickyDateGroupSx = {
  ...stickyDateBodySx,
  bgcolor: '#e8f2fa',
  color: '#254c6d',
  fontWeight: 950,
};

const stickyDateSummarySx = {
  ...stickyDateBodySx,
  bgcolor: '#e5f4ed',
  color: '#0f5f4b',
  fontWeight: 950,
};

const stickyActionHeaderSx = {
  position: 'sticky',
  right: 0,
  zIndex: 4,
  width: 28,
  minWidth: 28,
  maxWidth: 28,
  p: '0 !important',
  backgroundColor: 'transparent !important',
};

const stickyActionBodySx = {
  position: 'sticky',
  right: 0,
  zIndex: 2,
  width: 28,
  minWidth: 28,
  maxWidth: 28,
  p: '0 !important',
  backgroundColor: 'transparent !important',
};

const groupRowSx = {
  bgcolor: '#e8f2fa',
  color: '#254c6d',
  fontWeight: 950,
};

const summaryRowSx = {
  bgcolor: '#e5f4ed',
  color: '#0f5f4b',
  fontWeight: 900,
  borderBottom: '2px solid rgba(16, 114, 90, 0.28)',
};

export default TransactionsList;
