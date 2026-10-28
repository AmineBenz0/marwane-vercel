import React, { useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { ChevronRight as ChevronRightIcon } from '@mui/icons-material';
import { format } from 'date-fns';
import { formatShortDate } from '../utils/dateFormatting';
import PaymentStatusBadge from './PaymentStatusBadge';
import { deferredStockQuantities } from '../pages/Transactions/deferredStockQuantities';

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
const formatNumberValue = (value) => new Intl.NumberFormat('fr-FR').format(Number(value || 0));

const getDeferredStockSummary = (transaction) => {
  if (!transaction.est_promesse || transaction.est_actif === false) return '';
  const quantities = deferredStockQuantities(transaction);
  return [
    quantities.completed > 0 && `${formatNumberValue(quantities.completed)} complétés`,
    quantities.reserved > 0 && `${formatNumberValue(quantities.reserved)} prêts`,
    quantities.toProduce > 0 && `${formatNumberValue(quantities.toProduce)} à produire`,
  ].filter(Boolean).join(' · ');
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
  formatMontant,
  onView,
  title = 'Registre type Excel',
  description = 'Les ventes et achats sont groupés par jour avec un total visible directement dans le tableau.',
  emptyTitle = 'Aucune transaction trouvée',
  emptyDescription = "Essayez d'élargir la période ou de supprimer certains filtres.",
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
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
      };

      group.rows.push(transaction);
      groups.set(dateKey, group);
    });

    return Array.from(groups.values());
  }, [rows]);

  const formatAmount = formatMontant || ((value) => `${Number(value || 0).toLocaleString('fr-FR')} MAD`);

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
            {description && <Typography color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography>}
          </Box>
          <Chip
            label={loading ? 'Chargement…' : `${rows.length} opération${rows.length > 1 ? 's' : ''}`}
            sx={{ alignSelf: { xs: 'flex-start', md: 'center' }, fontWeight: 900 }}
          />
        </Stack>

        {isMobile ? (
          <Stack spacing={1.25}>
            {loading ? (
              <Typography role="status" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>Chargement des transactions…</Typography>
            ) : rows.length === 0 ? (
              <Box sx={{ py: 3, textAlign: 'center' }}>
                <Typography fontWeight={800}>{emptyTitle}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{emptyDescription}</Typography>
              </Box>
            ) : groupedRows.flatMap((group) => group.rows).map((transaction) => (
              <TransactionMobileCard
                key={transaction.id_transaction}
                transaction={transaction}
                partnerName={getClientOuFournisseur?.(transaction) || '-'}
                formatMontant={formatAmount}
                onView={onView}
              />
            ))}
          </Stack>
        ) : <TableContainer
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
              minWidth: 900,
              width: '100%',
              tableLayout: 'fixed',
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
            <colgroup>
              <col style={{ width: '10%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '32%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '17%' }} />
            </colgroup>
            <TableHead>
              <TableRow>
                <TableCell sx={stickyDateHeaderSx}>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Client / Fournisseur</TableCell>
                <TableCell align="right">Montant</TableCell>
                <TableCell align="right">Reste</TableCell>
                <TableCell>Statut</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" role="status" sx={{ py: 5 }}>
                    Chargement des transactions...
                  </TableCell>
                </TableRow>
              ) : groupedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
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
                      <TableCell colSpan={5} sx={groupRowSx}>
                        {group.rows.length} opération{group.rows.length > 1 ? 's' : ''}
                      </TableCell>
                    </TableRow>

                    {group.rows.map((transaction) => (
                      <TransactionExcelRow
                        key={transaction.id_transaction}
                        transaction={transaction}
                        getClientOuFournisseur={getClientOuFournisseur}
                        formatMontant={formatAmount}
                        onView={onView}
                      />
                    ))}

                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>}

      </CardContent>
    </Card>
  );
}

function TransactionMobileCard({ transaction, partnerName, formatMontant, onView }) {
  const isSale = isClientTransaction(transaction);
  const isCancelled = transaction.est_actif === false;
  const remainingAmount = Math.abs(Number(transaction.montant_restant || 0));
  const totalAmount = getSignedAmount(transaction);
  const stockSummary = getDeferredStockSummary(transaction);

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardActionArea component={onView ? 'a' : 'div'} href={onView ? `/transactions/${transaction.id_transaction}` : undefined}
        onClick={onView ? event => {
          if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onView(transaction); }
        } : undefined} aria-label={`Consulter la transaction n° ${transaction.id_transaction} · ${partnerName}`}>
      <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>{partnerName}</Typography>
            <Typography variant="caption" color="text.secondary">
              {isSale ? 'Vente' : 'Achat'} · {formatDateSafe(transaction.date_transaction)}
            </Typography>
          </Box>
          {isCancelled
            ? <Chip size="small" color="default" label={isSale ? 'Vente annulée' : 'Achat annulé'} />
            : <PaymentStatusBadge statut={getPaymentStatus(transaction)} />}
        </Stack>

        {stockSummary && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{stockSummary}</Typography>}

        <Stack direction="row" justifyContent="space-between" spacing={1.5} sx={{ mt: 1.5 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Montant</Typography>
            <Typography fontWeight={900} color={isSale ? 'success.main' : 'error.main'}>{formatSignedAmount(totalAmount, formatMontant)}</Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" color="text.secondary">Reste à payer</Typography>
            <Typography fontWeight={850} color={remainingAmount > 0 ? 'warning.main' : 'success.main'}>{formatMontant(remainingAmount)}</Typography>
          </Box>
        </Stack>

        {onView && <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}><ChevronRightIcon aria-hidden="true" color="action" /></Box>}
      </CardContent>
      </CardActionArea>
    </Card>
  );
}

function TransactionExcelRow({
  transaction,
  getClientOuFournisseur,
  formatMontant,
  onView,
}) {
  const isSale = isClientTransaction(transaction);
  const paymentStatus = getPaymentStatus(transaction);
  const partnerName = getClientOuFournisseur?.(transaction) || '-';
  const remainingAmount = Number(transaction.montant_restant || 0);
  const totalAmount = getSignedAmount(transaction);
  const stockSummary = getDeferredStockSummary(transaction);
  const inactive = transaction.est_actif === false;
  const rowBackground = inactive ? 'grey.50' : 'background.paper';
  return (
    <TableRow
      hover={Boolean(onView)}
      onClick={onView ? () => onView(transaction) : undefined}
      sx={{
        opacity: inactive ? 0.72 : 1,
        cursor: onView ? 'pointer' : 'default',
        '& td': { bgcolor: rowBackground },
        '&:hover td, &:focus-within td': { bgcolor: onView ? 'action.hover' : rowBackground },
        '&:focus-within': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
      }}
    >
      <TableCell sx={{ ...stickyDateBodySx, bgcolor: rowBackground }}>
        {formatDateSafe(transaction.date_transaction)}
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
        <Typography
          component={onView ? 'a' : 'span'}
          href={onView ? `/transactions/${transaction.id_transaction}` : undefined}
          onClick={onView ? event => {
            event.stopPropagation();
            if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              onView(transaction);
            }
          } : undefined}
          aria-label={onView ? `Consulter la transaction n° ${transaction.id_transaction} · ${partnerName}` : undefined}
          fontWeight={850}
          title={partnerName}
          sx={{
            display: 'block',
            color: 'inherit',
            textDecoration: 'none',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {partnerName}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Typography component="span" fontWeight={900} color={isSale ? 'success.main' : 'error.main'}>
          {formatSignedAmount(totalAmount, formatMontant)}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Typography component="span" fontWeight={800} color={remainingAmount > 0 ? 'warning.main' : 'success.main'}>
          {formatMontant(remainingAmount)}
        </Typography>
      </TableCell>
      <TableCell>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Stack spacing={0.5} alignItems="flex-start" sx={{ minWidth: 0 }}>
          {inactive
            ? <Chip size="small" color="default" label={isSale ? 'Vente annulée' : 'Achat annulé'} />
            : <PaymentStatusBadge statut={paymentStatus} />}
          {stockSummary && <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{stockSummary}</Typography>}
        </Stack>
        {onView && <ChevronRightIcon aria-hidden="true" sx={{ color: 'text.secondary', flexShrink: 0, fontSize: 20 }} />}
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

const groupRowSx = {
  bgcolor: '#e8f2fa',
  color: '#254c6d',
  fontWeight: 950,
};

export default TransactionsExcelRegister;


