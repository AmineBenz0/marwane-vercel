import React, { useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  MoreVert as MoreVertIcon,
  Restore as RestoreIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import fr from 'date-fns/locale/fr';
import PaymentStatusBadge from './PaymentStatusBadge';

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

const isClientTransaction = (transaction) => (
  transaction?.id_client !== null && transaction?.id_client !== undefined
);

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

export const getPaymentReglementSummary = (transaction, formatAmount = formatPaymentAmountForSummary) => {
  const reglements = (transaction.paiements || [])
    .map((payment) => getPaymentReglementLabel(payment, formatAmount))
    .filter(Boolean);

  return reglements.length > 0 ? reglements.join(' | ') : '-';
};

const getSignedAmount = (transaction, field = 'montant_total') => {
  const amount = Math.abs(Number(transaction[field] || 0));
  return isClientTransaction(transaction) ? amount : -amount;
};

const formatSignedAmount = (amount, formatMontant) => {
  if (!amount) return formatMontant(0);
  const sign = amount > 0 ? '+' : '-';
  return `${sign}${formatMontant(Math.abs(amount))}`;
};

function TransactionsExcelRegister({
  rows = [],
  loading = false,
  getClientOuFournisseur,
  produitsMap = new Map(),
  batimentsMap = new Map(),
  formatMontant,
  onView,
  onEdit,
  onDelete,
  onReactivate,
  dailySummaryMode = 'both',
  title = 'Registre type Excel',
  description = 'Les ventes et achats sont groupés par jour avec un total visible directement dans le tableau.',
  emptyTitle = 'Aucune transaction trouvée',
  emptyDescription = "Essayez d'élargir la période ou de supprimer certains filtres.",
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
      if (isClientTransaction(transaction)) {
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

  const formatAmount = formatMontant || ((value) => `${Number(value || 0).toLocaleString('fr-FR')} MAD`);

  const getDailySummaryLabel = (group) => {
    if (dailySummaryMode === 'entries') {
      return `Entrées ${formatAmount(group.entries)}`;
    }

    if (dailySummaryMode === 'exits') {
      return `Sorties ${formatAmount(group.exits)}`;
    }

    return `Entrées ${formatAmount(group.entries)} | Sorties ${formatAmount(group.exits)}`;
  };

  const getDailySummaryAmount = (group) => {
    if (dailySummaryMode === 'entries') return group.entries;
    if (dailySummaryMode === 'exits') return -group.exits;
    return group.entries - group.exits;
  };

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
            <Typography variant="h6" fontWeight={900}>{title}</Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {description}
            </Typography>
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
                    <Typography fontWeight={800}>{emptyTitle}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {emptyDescription}
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
                        formatMontant={formatAmount}
                        onView={onView}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onReactivate={onReactivate}
                      />
                    ))}

                    <TableRow>
                      <TableCell sx={stickyDateSummarySx}>Total jour</TableCell>
                      <TableCell colSpan={5} sx={summaryRowSx}>
                        {getDailySummaryLabel(group)}
                      </TableCell>
                      <TableCell align="right" sx={summaryRowSx}>
                        <Typography component="span" fontWeight={900} color={getDailySummaryAmount(group) >= 0 ? 'success.main' : 'error.main'}>
                          {formatSignedAmount(getDailySummaryAmount(group), formatAmount)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={summaryRowSx}>{formatAmount(group.paid)}</TableCell>
                      <TableCell align="right" sx={summaryRowSx}>{formatAmount(group.remaining)}</TableCell>
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
  const isSale = isClientTransaction(transaction);
  const paymentStatus = getPaymentStatus(transaction);
  const productName = produitsMap.get(transaction.id_produit) || `Produit #${transaction.id_produit || '-'}`;
  const partnerName = getClientOuFournisseur?.(transaction) || '-';
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

export default TransactionsExcelRegister;
