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
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  MoreVert as MoreVertIcon,
  Restore as RestoreIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { formatShortDate } from '../utils/dateFormatting';
import PaymentStatusBadge from './PaymentStatusBadge';
import DeferredSaleStatusBadge from '../pages/Transactions/DeferredSaleStatusBadge';
import { isPendingPayment, owedAmount } from '../pages/Transactions/pendingPayments';
import { transactionNetAmount } from '../utils/transactionAmounts';

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

const formatDateSafe = (value) => formatShortDate(value);

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
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
      .format(Number(value || 0))
      .replace(/\s/g, '\u00A0') + '\u00A0MAD'
  );
};

const COLUMN_COUNT = 8;

const getPaymentReglementLabel = (payment, formatAmount = formatPaymentAmountForSummary) => {
  if (!payment) return null;

  const label = payment.nature === 'remboursement'
    ? 'Remboursement · ' + getPaymentTypeLabel(payment)
    : payment.nature === 'credit_transfere'
      ? 'Crédit transféré' : payment.nature === 'credit_recu'
        ? 'Crédit utilisé' : getPaymentTypeLabel(payment);
  const reference = getPaymentReferenceValue(payment);
  const referenceText = reference
    ? ` ${reference}`
    : (REFERENCE_PAYMENT_TYPES.has(payment?.type_paiement) ? ' réf. manquante' : '');
  const amount = payment.montant !== null && payment.montant !== undefined
    ? formatAmount(payment.montant)
    : null;
  const signedAmount = payment.nature === 'remboursement' || payment.nature === 'credit_transfere'
    ? '− ' + amount : amount;

  return [amount ? `${label}${referenceText} · ${signedAmount}` : `${label}${referenceText}`]
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
  const value = field === 'montant_total' ? transactionNetAmount(transaction) : transaction[field];
  const amount = Math.abs(Number(value || 0));
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
  const theme = useTheme();
  // Below 'lg' (1200px) the 8-column table cannot fit next to the sidebar: use cards instead.
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
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

      // Cancelled (inactive) transactions stay visible but never count in the totals.
      if (transaction.est_actif !== false) {
        const total = Math.abs(transactionNetAmount(transaction));
        if (isClientTransaction(transaction)) {
          group.entries += total;
        } else {
          group.exits += total;
        }
        group.paid += Math.abs(Number(transaction.montant_paye || 0));
        // Uncashed cheques are on their way: they are not counted as still owed.
        group.remaining += owedAmount(transaction);

        const status = getPaymentStatus(transaction);
        if (status === 'impaye' || status === 'partiel' || status === 'en_retard') {
          group.followUpCount += 1;
        }
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

        {isMobile ? (
          <Stack spacing={1.5}>
            {loading ? (
              <Typography align="center" sx={{ py: 4 }}>Chargement des transactions...</Typography>
            ) : groupedRows.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography fontWeight={800}>{emptyTitle}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{emptyDescription}</Typography>
              </Box>
            ) : groupedRows.map((group) => (
              <Box key={group.dateKey}>
                <Box sx={{ ...groupRowSx, px: 1.5, py: 0.75, borderRadius: 2, mb: 1, fontSize: '0.8rem' }}>
                  {group.label} · {group.rows.length} opération{group.rows.length > 1 ? 's' : ''}
                </Box>
                <Stack spacing={1}>
                  {group.rows.map((transaction) => (
                    <TransactionMobileCard
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
                </Stack>
                <Box sx={{ ...summaryRowSx, px: 1.5, py: 0.75, borderRadius: 2, mt: 1, fontSize: '0.8rem' }}>
                  {getDailySummaryLabel(group)}
                  {' · '}
                  {group.followUpCount > 0
                    ? `${group.followUpCount} à suivre`
                    : 'Tout est réglé'}
                </Box>
              </Box>
            ))}
          </Stack>
        ) : (
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
              minWidth: 800,
              // Fixed column shares: long content wraps or is cut inside its column
              // instead of pushing the table wider than the screen.
              tableLayout: 'fixed',
              width: '100%',
              '& th': {
                py: 1.25,
                px: 1,
                bgcolor: '#edf5ef',
                color: '#263d3a',
                fontWeight: 900,
                whiteSpace: 'normal',
                lineHeight: 1.25,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontSize: { xs: '0.68rem', md: '0.76rem' },
                borderBottom: '1px solid',
                borderColor: 'divider',
              },
              '& td': {
                py: 1.15,
                px: 1,
                whiteSpace: 'nowrap',
                fontSize: { xs: '0.72rem', md: '0.8125rem' },
                borderBottom: '1px solid',
                borderColor: 'divider',
              },
            }}
          >
            <colgroup>
              <col style={{ width: 92 }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '19%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: 40 }} />
            </colgroup>
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>Client / Fournisseur</TableCell>
                <TableCell>Produit</TableCell>
                <TableCell align="right">Total net</TableCell>
                <TableCell align="right">Déjà payé</TableCell>
                <TableCell align="right">Reste</TableCell>
                <TableCell>Statut</TableCell>
                <TableCell align="center" sx={stickyActionHeaderSx} aria-label="Actions" />
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} align="center" sx={{ py: 5 }}>
                    Chargement des transactions...
                  </TableCell>
                </TableRow>
              ) : groupedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} align="center" sx={{ py: 5 }}>
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
                      <TableCell colSpan={COLUMN_COUNT} sx={groupRowSx}>
                        {group.label} · {group.rows.length} opération{group.rows.length > 1 ? 's' : ''}
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
                      <TableCell sx={summaryRowSx}>Total jour</TableCell>
                      <TableCell colSpan={2} sx={{ ...summaryRowSx, whiteSpace: 'normal', minWidth: 0 }}>
                        {getDailySummaryLabel(group)}
                      </TableCell>
                      <TableCell align="right" sx={summaryRowSx}>
                        <Typography component="span" fontWeight={900} color={getDailySummaryAmount(group) >= 0 ? 'success.main' : 'error.main'}>
                          {formatSignedAmount(getDailySummaryAmount(group), formatAmount)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={summaryRowSx}>{formatAmount(group.paid)}</TableCell>
                      <TableCell align="right" sx={summaryRowSx}>{formatAmount(group.remaining)}</TableCell>
                      <TableCell colSpan={2} sx={summaryRowSx}>
                        {group.followUpCount > 0
                          ? `${group.followUpCount} à suivre`
                          : 'Tout est réglé'}
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        )}

      </CardContent>
    </Card>
  );
}

const MAX_PAYMENT_LINES = 2;
const shorten = (value, max = 16) => (value && value.length > max ? `${value.slice(0, max - 1)}…` : value);

// One short line per payment: "Chèque n° 123 · 50 MAD" (orange when a reference is missing).
// Only the first lines are shown; the rest is summarised so a row never grows out of proportion.
// Cancelled payments no longer count, so they are not listed.
const getListedPayments = (transaction) => (transaction.paiements || [])
  .filter((payment) => payment && payment.statut !== 'annule');

const NATURE_LABELS = {
  remboursement: 'Remboursement',
  credit_transfere: 'Crédit transféré',
  credit_recu: 'Crédit utilisé',
};
const NEGATIVE_NATURES = new Set(['remboursement', 'credit_transfere']);

const hasMissingReference = (payment) => (
  REFERENCE_PAYMENT_TYPES.has(payment.type_paiement) && !getPaymentReferenceValue(payment)
);

function PaymentLines({ transaction, formatMontant }) {
  const payments = getListedPayments(transaction);
  if (payments.length === 0) return null;
  const visible = payments.slice(0, MAX_PAYMENT_LINES);
  const hidden = payments.length - visible.length;
  return (
    <Box sx={{ mt: 0.25 }}>
      {visible.map((payment, index) => {
        const reference = getPaymentReferenceValue(payment);
        const missingReference = hasMissingReference(payment);
        const natureLabel = NATURE_LABELS[payment.nature];
        const sign = NEGATIVE_NATURES.has(payment.nature) ? '−' : '';
        const amount = payment.montant !== null && payment.montant !== undefined
          ? ` · ${sign}${formatMontant(Math.abs(Number(payment.montant)))}` : '';
        const type = `${natureLabel ? `${natureLabel} · ` : ''}${getPaymentTypeLabel(payment)}`;
        const pending = isPendingPayment(payment);
        return (
          <Typography
            key={payment.id_paiement || index}
            variant="caption"
            display="block"
            title={`${type}${reference ? ` n° ${reference}` : ''}${amount}${pending ? ' · en attente' : ''}`}
            sx={{ color: missingReference || pending ? 'warning.dark' : 'text.secondary', fontWeight: missingReference || pending ? 700 : 400, lineHeight: 1.3, mb: 0.25, whiteSpace: 'normal', overflowWrap: 'anywhere' }}
          >
            {type}{reference ? ` n° ${shorten(reference)}` : ''}{missingReference ? ' · sans réf.' : ''}{amount}{pending ? ' · en attente' : ''}
          </Typography>
        );
      })}
      {hidden > 0 && (
        <Typography variant="caption" display="block" sx={{ color: 'text.secondary', fontStyle: 'italic', whiteSpace: 'normal' }}>
          + {hidden} autre{hidden > 1 ? 's' : ''} paiement{hidden > 1 ? 's' : ''}
        </Typography>
      )}
    </Box>
  );
}

// Deferred-delivery details (status, planned date, eggs still to produce).
function DeliveryInfo({ transaction, inactive }) {
  if (!transaction.est_promesse) return null;
  const waiting = Number(transaction.quantite_en_attente);
  return (
    <Stack
      spacing={0.5}
      alignItems="flex-start"
      sx={{ mt: 0.5, '& .MuiChip-root': { height: 'auto', maxWidth: '100%' }, '& .MuiChip-label': { whiteSpace: 'normal', py: 0.25 } }}
    >
      <DeferredSaleStatusBadge sale={transaction} />
      {/* Short on purpose: reserved-stock details live on the sale's own page. */}
      {transaction.date_livraison_prevue && (
        <Typography variant="caption">Livraison le {formatDateSafe(transaction.date_livraison_prevue)}</Typography>
      )}
      {!inactive && waiting > 0 && (
        <Typography variant="caption">{formatNumberValue(waiting)} œufs à produire</Typography>
      )}
    </Stack>
  );
}

function RowActionsMenu({ transaction, inactive, bg = 'transparent', onView, onEdit, onDelete, onReactivate }) {
  const [anchor, setAnchor] = useState(null);
  const hasRowActions = Boolean(onView || (onEdit && !inactive) || (inactive && onReactivate) || (!inactive && onDelete));
  if (!hasRowActions) return null;
  const run = (action) => { setAnchor(null); action(transaction); };

  return (
    <>
      <Tooltip title="Actions">
        <IconButton
          size="small"
          aria-label="Actions"
          onClick={(event) => { event.stopPropagation(); setAnchor(event.currentTarget); }}
          sx={{ width: 28, height: 28, p: 0.25, bgcolor: bg }}
        >
          <MoreVertIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        // The menu renders in a portal, but React still bubbles its clicks to
        // the parent card, whose own click opens the detail page. Stop them so
        // "Modifier" / "Annuler" (and closing the menu) stay on this page.
        onClick={(event) => event.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {onView && (
          <MenuItem onClick={() => run(onView)}>
            <VisibilityIcon fontSize="small" sx={{ mr: 1 }} />
            Voir
          </MenuItem>
        )}
        {onEdit && !inactive && (
          <MenuItem onClick={() => run(onEdit)}>
            <EditIcon fontSize="small" sx={{ mr: 1 }} />
            Modifier
          </MenuItem>
        )}
        {inactive && onReactivate ? (
          <MenuItem onClick={() => run(onReactivate)}>
            <RestoreIcon fontSize="small" sx={{ mr: 1 }} />
            Réactiver
          </MenuItem>
        ) : onDelete ? (
          <MenuItem onClick={() => run(onDelete)} sx={{ color: 'error.main' }}>
            <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
            {transaction?.id_client ? 'Annuler la vente' : 'Annuler l’achat'}
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
}

function TransactionMobileCard({
  transaction, getClientOuFournisseur, produitsMap, batimentsMap, formatMontant,
  onView, onEdit, onDelete, onReactivate,
}) {
  const isSale = isClientTransaction(transaction);
  const inactive = transaction.est_actif === false;
  const status = getPaymentStatus(transaction);
  const remaining = owedAmount(transaction);
  const partner = getClientOuFournisseur?.(transaction) || '-';
  const product = produitsMap.get(transaction.id_produit) || `Produit #${transaction.id_produit || '-'}`;
  const batiment = transaction.id_batiment
    ? (batimentsMap.get(transaction.id_batiment) || `Bâtiment #${transaction.id_batiment}`) : null;
  const total = getSignedAmount(transaction);

  return (
    <Box
      onClick={onView ? () => onView(transaction) : undefined}
      sx={{
        p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2.5,
        bgcolor: inactive ? 'grey.50' : 'background.paper', opacity: inactive ? 0.72 : 1,
        cursor: onView ? 'pointer' : 'default',
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              label={isSale ? 'Vente' : 'Achat'}
              sx={{
                fontWeight: 900,
                color: isSale ? 'success.main' : 'error.main',
                backgroundColor: isSale ? 'rgba(46, 125, 50, 0.09)' : 'rgba(211, 47, 47, 0.09)',
              }}
            />
            <Typography fontWeight={800} noWrap>{partner}</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} noWrap>
            {formatNumberValue(transaction.quantite)} × {product}{batiment ? ` · ${batiment}` : ''}
          </Typography>
        </Box>
        <Stack direction="row" alignItems="center" sx={{ flexShrink: 0 }}>
          <Typography fontWeight={900} color={isSale ? 'success.main' : 'error.main'}>
            {formatSignedAmount(total, formatMontant)}
          </Typography>
          <RowActionsMenu
            transaction={transaction}
            inactive={inactive}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
            onReactivate={onReactivate}
          />
        </Stack>
      </Stack>
      <DeliveryInfo transaction={transaction} inactive={inactive} />
      {!inactive && getListedPayments(transaction).some(hasMissingReference) && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'warning.dark', fontWeight: 700 }}>
          Référence de paiement manquante
        </Typography>
      )}
      {!inactive && (
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
          <PaymentStatusBadge statut={status} />
          {remaining > 0 && (
            <Typography variant="body2" color="warning.main" fontWeight={800}>
              Reste {formatMontant(remaining)}
            </Typography>
          )}
        </Stack>
      )}
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
  const remainingAmount = owedAmount(transaction);
  const totalAmount = getSignedAmount(transaction);
  const inactive = transaction.est_actif === false;
  const rowBackground = inactive ? 'grey.50' : 'background.paper';
  return (
    <TableRow
      hover={!inactive}
      sx={{
        opacity: inactive ? 0.72 : 1,
        '& td': { bgcolor: rowBackground },
      }}
    >
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
        <Typography fontWeight={850} title={partnerName} sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {partnerName}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography title={productName} sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {productName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatNumberValue(transaction.quantite)}{batimentName !== '-' ? ` · ${batimentName}` : ''}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Typography component="span" fontWeight={900} color={isSale ? 'success.main' : 'error.main'}>
          {formatSignedAmount(totalAmount, formatMontant)}
        </Typography>
      </TableCell>
      <TableCell align="right">
        {formatMontant(paidAmount)}
        <PaymentLines transaction={transaction} formatMontant={formatMontant} />
      </TableCell>
      <TableCell align="right">
        <Typography component="span" fontWeight={800} color={remainingAmount > 0 ? 'warning.main' : 'success.main'}>
          {formatMontant(remainingAmount)}
        </Typography>
      </TableCell>
      <TableCell sx={{ whiteSpace: 'normal' }}>
        {!inactive && <PaymentStatusBadge statut={paymentStatus} />}
        <DeliveryInfo transaction={transaction} inactive={inactive} />
      </TableCell>
      <TableCell align="right" sx={stickyActionBodySx}>
        <RowActionsMenu
          transaction={transaction}
          inactive={inactive}
          bg={rowBackground}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
          onReactivate={onReactivate}
        />
      </TableCell>
    </TableRow>
  );
}

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
