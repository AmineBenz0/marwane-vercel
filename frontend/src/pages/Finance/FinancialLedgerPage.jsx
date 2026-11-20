import DateField from '../../utils/DateField';
import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Add as AddIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../../services/api';
import { getBusinessDateInput } from '../../utils/businessDate';
import SmartFilterPanel from '../../components/Filters/SmartFilterPanel';
import PageHeader from '../../components/Layout/PageHeader';
import CellText from '../../components/CellText';

const money = (value) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'MAD', maximumFractionDigits: 2,
}).format(Number(value || 0));

const statusLabel = {
  impaye: 'Impayé', partiel: 'Partiel', cheque_en_attente: 'Chèque en attente', paye: 'Payé', surpaye: 'Surpayé', en_retard: 'En retard',
};

// Owed: a cheque handed over but not cashed yet is no longer owed.
const owed = (item) => Number(item?.montant_du ?? item?.montant_restant ?? 0);
const pendingAmount = (item) => Number(item?.montant_en_attente || 0);
const statusColor = (item) => {
  if (item.est_en_retard) return 'error';
  if (item.statut_paiement === 'paye' || item.statut_paiement === 'surpaye') return 'success';
  if (item.statut_paiement === 'cheque_en_attente') return 'info';
  return 'warning';
};
const PendingNote = ({ item }) => (pendingAmount(item) > 0
  ? <Typography variant="caption" color="info.main" display="block">Chèque en attente {money(pendingAmount(item))}</Typography>
  : null);
PendingNote.propTypes = { item: PropTypes.object.isRequired };

const createIdempotencyKey = () => window.crypto?.randomUUID?.() || `payment-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function PaymentDialog({ item, open, onClose, onSaved }) {
  const [amount, setAmount] = useState(Math.max(0, owed(item)).toFixed(2));
  const [type, setType] = useState('cash');
  const [date, setDate] = useState(getBusinessDateInput);
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setAmount(Math.max(0, owed(item)).toFixed(2));
      setType('cash');
      setDate(getBusinessDateInput());
      setNotes('');
      setIdempotencyKey(createIdempotencyKey());
      setError(null);
    }
  }, [open, item]);

  const submit = async () => {
    if (!amount || Number(amount) <= 0) {
      setError('Le montant doit être supérieur à zéro.');
      return;
    }
    if (!window.confirm(`Confirmer le paiement de ${money(amount)} pour la transaction #${item.id_transaction} ?`)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await post('/paiements', {
        id_transaction: item.id_transaction,
        date_paiement: date,
        montant: Number(amount),
        type_paiement: type,
        notes: notes || null,
        cle_idempotence: idempotencyKey,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Le paiement n’a pas pu être enregistré.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Ajouter un paiement</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Transaction #{item?.id_transaction} · reste {money(owed(item))}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <DateField label="Date"  value={date} onChange={(event) => setDate(event.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField label="Montant (MAD)" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} inputProps={{ min: 0.01, step: 0.01 }} fullWidth />
          <TextField label="Mode de paiement" select value={type} onChange={(event) => setType(event.target.value)} fullWidth>
            <MenuItem value="cash">Espèces</MenuItem>
            <MenuItem value="virement">Virement</MenuItem>
            <MenuItem value="carte">Carte bancaire</MenuItem>
            <MenuItem value="cheque">Chèque</MenuItem>
            <MenuItem value="autre">Autre</MenuItem>
          </TextField>
          <TextField label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={2} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Annuler</Button>
        <Button onClick={submit} variant="contained" disabled={saving}>{saving ? 'Enregistrement…' : Math.round(Number(amount) * 100) >= Math.round(owed(item) * 100) ? 'Marquer comme payé' : 'Enregistrer le paiement'}</Button>
      </DialogActions>
    </Dialog>
  );
}

const financialItemPropType = PropTypes.shape({
  id_transaction: PropTypes.number,
  id_client: PropTypes.number,
  id_fournisseur: PropTypes.number,
  client_nom: PropTypes.string,
  fournisseur_nom: PropTypes.string,
  produit_nom: PropTypes.string,
  date_echeance: PropTypes.string,
  montant_restant: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  est_en_retard: PropTypes.bool,
  statut_paiement: PropTypes.string,
});

PaymentDialog.propTypes = {
  item: financialItemPropType,
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};

function SummaryCards({ summary }) {
  const cards = [
    ['Total', summary?.total, 'text.primary'],
    ['Payé', summary?.paye, 'success.main'],
    ['Reste', summary?.reste, 'warning.main'],
    ['En retard', summary?.overdue_count || 0, 'error.main', true],
  ];
  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {cards.map(([label, value, color, count]) => (
        <Grid item xs={6} md={3} key={label}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="h6" sx={{ color, fontWeight: 700, mt: 0.5 }}>{count ? Number(value || 0).toLocaleString('fr-FR') : money(value)}</Typography>
              {label === 'Reste' && Number(summary?.en_attente || 0) > 0 && (
                <Typography variant="caption" color="info.main">+ {money(summary.en_attente)} en chèques non encaissés</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

SummaryCards.propTypes = {
  summary: PropTypes.shape({
    total: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    paye: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    reste: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    en_attente: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    overdue_count: PropTypes.number,
  }),
};

function FinancialLedgerPage({ direction }) {
  const navigate = useNavigate();
  const isReceivable = direction === 'receivable';
  const theme = useTheme();
  // Cards below 1200px: next to the sidebar the 7-column table cannot fit.
  const mobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [data, setData] = useState({ items: [], summary: {} });
  const [filters, setFilters] = useState({ id_tiers: '', recherche: '', statut: '', echeance_debut: '', echeance_fin: '', overdue_only: false });
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [parties, setParties] = useState([]);
  const [partiesLoading, setPartiesLoading] = useState(false);

  const endpoint = isReceivable ? '/transactions/creances' : '/transactions/dettes';
  const title = isReceivable ? 'À encaisser' : 'À payer';
  const description = isReceivable
    ? 'Ce que les clients doivent encore payer, avec les échéances.'
    : 'Ce qui reste à payer aux fournisseurs, avec les échéances.';
  const partyLabel = isReceivable ? 'Client' : 'Fournisseur';
  const partyEndpoint = isReceivable ? '/clients' : '/fournisseurs';

  const filterDefinitions = useMemo(() => [
    {
      id: 'recherche',
      label: 'Rechercher',
      placeholder: 'Client, produit…',
      type: 'search',
      alwaysInline: true,
    },
    {
      id: 'id_tiers',
      label: partyLabel,
      type: 'select',
      alwaysInline: true,
      disabled: partiesLoading,
      options: parties.map((party) => ({
        value: isReceivable ? party.id_client : party.id_fournisseur,
        label: isReceivable ? party.nom_client : party.nom_fournisseur,
      })),
    },
    {
      id: 'statut',
      label: 'Statut',
      type: 'select',
      alwaysInline: true,
      options: Object.entries(statusLabel).map(([value, label]) => ({ value, label })),
    },
    { id: 'echeance_debut', label: 'Échéance à partir du', type: 'date' },
    { id: 'echeance_fin', label: 'Échéance jusqu’au', type: 'date' },
    {
      id: 'sort_by',
      label: 'Trier par',
      type: 'select',
      defaultValue: 'date_echeance',
      options: [
        { value: 'date_echeance', label: 'Échéance' },
        { value: 'date_transaction', label: 'Date' },
        { value: 'montant_total', label: 'Montant total' },
        { value: 'montant_restant', label: 'Montant restant' },
      ],
    },
    {
      id: 'sort_order',
      label: 'Ordre',
      type: 'select',
      defaultValue: 'asc',
      options: [
        { value: 'asc', label: 'Croissant' },
        { value: 'desc', label: 'Décroissant' },
      ],
    },
    {
      id: 'overdue_only',
      label: 'En retard uniquement',
      type: 'custom',
      defaultValue: false,
      formatChipValue: () => 'Oui',
      renderComponent: ({ value, onChange, filter }) => (
        <Button
          fullWidth
          variant={value ? 'contained' : 'outlined'}
          color="error"
          disabled={filter.disabled}
          onClick={() => onChange(!value)}
          sx={{ minHeight: 40, whiteSpace: 'nowrap' }}
        >
          En retard uniquement
        </Button>
      ),
    },
  ], [isReceivable, parties, partiesLoading, partyLabel]);

  useEffect(() => {
    let cancelled = false;
    setPartiesLoading(true);
    get(partyEndpoint, { params: { limit: 1000, est_actif: true } })
      .then((result) => {
        if (cancelled) return;
        setParties(Array.isArray(result) ? result : result?.items || []);
      })
      .catch(() => {
        if (!cancelled) setParties([]);
      })
      .finally(() => {
        if (!cancelled) setPartiesLoading(false);
      });
    return () => { cancelled = true; };
  }, [partyEndpoint]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tierParam = isReceivable ? 'id_client' : 'id_fournisseur';
      const { id_tiers: selectedParty, ...queryFilters } = filters;
      const params = Object.fromEntries(
        Object.entries(queryFilters).filter(([, value]) => value !== '' && value !== false && value !== null && value !== undefined),
      );
      params.sort_by = filters.sort_by || 'date_echeance';
      params.sort_order = filters.sort_order || 'asc';
      const result = await get(endpoint, { params: { ...params, [tierParam]: selectedParty || undefined, skip: page * pageSize, limit: pageSize } });
      setData(result || { items: [], summary: {} });
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Impossible de charger les données.');
    } finally {
      setLoading(false);
    }
  }, [endpoint, filters, isReceivable, page]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => data.items || [], [data.items]);
  const updateFilter = (field, value) => {
    setPage(0);
    setFilters((current) => ({ ...current, [field]: value }));
  };
  const clearFilters = () => {
    setPage(0);
    setFilters({ id_tiers: '', recherche: '', statut: '', echeance_debut: '', echeance_fin: '', overdue_only: false });
  };
  const partyPath = (item) => {
    const partyId = isReceivable ? item.id_client : item.id_fournisseur;
    return partyId ? `/${isReceivable ? 'clients' : 'fournisseurs'}/${partyId}/profile` : null;
  };
  const goToParty = (item) => {
    const path = partyPath(item);
    if (path) navigate(path);
  };

  return (
    <Box>
      <PageHeader
        title={title}
        description={description}
        actions={<Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Actualiser</Button>}
      />

      <SummaryCards summary={data.summary} />
      <SmartFilterPanel
        pageKey={`financial-ledger-${direction}`}
        filterDefinitions={filterDefinitions}
        filters={filters}
        onFilterChange={updateFilter}
        onClearAll={clearFilters}
        maxInlineFilters={3}
      />

      {error && <Alert severity="error" action={<Button color="inherit" size="small" onClick={load}>Réessayer</Button>} sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box> : rows.length === 0 ? <Alert severity="info">Aucune {isReceivable ? 'créance' : 'dette'} ne correspond aux filtres.</Alert> : mobile ? (
        <Stack spacing={1.5}>{rows.map((item) => <LedgerCard key={item.id_transaction} item={item} partyLabel={partyLabel} onPay={() => setSelected(item)} onParty={() => goToParty(item)} />)}</Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: 136 }} />
            </colgroup>
            <TableHead><TableRow><TableCell>{partyLabel}</TableCell><TableCell>Produit</TableCell><TableCell>Échéance</TableCell><TableCell align="right">Total</TableCell><TableCell align="right">Reste</TableCell><TableCell>Statut</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead>
            <TableBody>{rows.map((item) => <TableRow key={item.id_transaction} hover sx={item.est_en_retard ? { backgroundColor: 'rgba(211, 47, 47, 0.06)' } : undefined}>
              <TableCell>{partyPath(item) ? <Button variant="text" size="small" onClick={() => goToParty(item)} title={item.client_nom || item.fournisseur_nom || ''} sx={{ textTransform: 'none', fontWeight: 700, p: 0, minWidth: 0, maxWidth: '100%', justifyContent: 'flex-start', textAlign: 'left' }}><CellText component="span" variant="body2" fontWeight={700} lines={2}>{item.client_nom || item.fournisseur_nom || '—'}</CellText></Button> : <CellText variant="body2" lines={2}>{item.client_nom || item.fournisseur_nom || '—'}</CellText>}</TableCell><TableCell><CellText variant="body2" lines={2}>{item.produit_nom || '—'}</CellText></TableCell><TableCell>{item.date_echeance || '—'}</TableCell><TableCell align="right">{money(item.montant_total)}</TableCell><TableCell align="right">{money(owed(item))}<PendingNote item={item} /></TableCell><TableCell><Chip size="small" color={statusColor(item)} label={statusLabel[item.statut_paiement] || item.statut_paiement} /></TableCell><TableCell align="right"><Button size="small" startIcon={<AddIcon />} onClick={() => setSelected(item)} disabled={owed(item) <= 0}>Paiement</Button></TableCell>
            </TableRow>)}</TableBody>
          </Table>
          <TablePagination component="div" count={data.summary?.count || 0} page={page} onPageChange={(_, nextPage) => setPage(nextPage)} rowsPerPage={pageSize} rowsPerPageOptions={[pageSize]} labelDisplayedRows={({ from, to, count }) => `${from}–${to} sur ${count}`} />
        </TableContainer>
      )}
      <PaymentDialog item={selected} open={Boolean(selected)} onClose={() => setSelected(null)} onSaved={load} />
    </Box>
  );
}

function LedgerCard({ item, partyLabel, onPay, onParty }) {
  return <Card variant="outlined" sx={item.est_en_retard ? { borderColor: 'error.main' } : undefined}><CardContent><Stack spacing={1}><Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}><Button variant="text" onClick={onParty} disabled={!onParty} title={item.client_nom || item.fournisseur_nom || ''} sx={{ textTransform: 'none', fontWeight: 700, p: 0, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left' }}><CellText component="span" variant="body1" fontWeight={700} lines={2}>{item.client_nom || item.fournisseur_nom || '—'}</CellText></Button><Chip size="small" color={statusColor(item)} label={statusLabel[item.statut_paiement] || item.statut_paiement} /></Stack><Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{partyLabel} · {item.produit_nom || 'Produit'} · échéance {item.date_echeance || 'non définie'}</Typography><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="caption" color="text.secondary">Reste</Typography><Typography fontWeight={700}>{money(owed(item))}</Typography><PendingNote item={item} /></Box><Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onPay} disabled={owed(item) <= 0}>Ajouter</Button></Stack></Stack></CardContent></Card>;
}

LedgerCard.propTypes = {
  item: financialItemPropType.isRequired,
  partyLabel: PropTypes.string.isRequired,
  onPay: PropTypes.func.isRequired,
  onParty: PropTypes.func,
};

export function ReceivablesPage() { return <FinancialLedgerPage direction="receivable" />; }
export function PayablesPage() { return <FinancialLedgerPage direction="payable" />; }
FinancialLedgerPage.propTypes = { direction: PropTypes.oneOf(['receivable', 'payable']).isRequired };
export default FinancialLedgerPage;
