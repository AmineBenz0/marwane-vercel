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

const money = (value) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'MAD', maximumFractionDigits: 2,
}).format(Number(value || 0));

const statusLabel = {
  impaye: 'Impayé', partiel: 'Partiel', paye: 'Payé', surpaye: 'Surpayé', en_retard: 'En retard',
};

const createIdempotencyKey = () => window.crypto?.randomUUID?.() || `payment-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function PaymentDialog({ item, open, onClose, onSaved }) {
  const [amount, setAmount] = useState(Number(item?.montant_restant || 0).toFixed(2));
  const [type, setType] = useState('cash');
  const [date, setDate] = useState(getBusinessDateInput);
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setAmount(Number(item?.montant_restant || 0).toFixed(2));
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
            Transaction #{item?.id_transaction} · reste {money(item?.montant_restant)}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
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
        <Button onClick={submit} variant="contained" disabled={saving}>{saving ? 'Enregistrement…' : Number(amount) >= Number(item?.montant_restant || 0) - 0.01 ? 'Marquer comme payé' : 'Enregistrer le paiement'}</Button>
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
    overdue_count: PropTypes.number,
  }),
};

function FinancialLedgerPage({ direction }) {
  const navigate = useNavigate();
  const isReceivable = direction === 'receivable';
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [data, setData] = useState({ items: [], summary: {} });
  const [filters, setFilters] = useState({ id_tiers: '', recherche: '', statut: '', echeance_debut: '', echeance_fin: '', overdue_only: false, sort_by: 'date_echeance', sort_order: 'asc' });
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [parties, setParties] = useState([]);
  const [partiesLoading, setPartiesLoading] = useState(false);

  const endpoint = isReceivable ? '/transactions/creances' : '/transactions/dettes';
  const title = isReceivable ? 'Créances clients' : 'Dettes fournisseurs';
  const partyLabel = isReceivable ? 'Client' : 'Fournisseur';
  const partyEndpoint = isReceivable ? '/clients' : '/fournisseurs';

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
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>{title}</Typography>
          <Typography color="text.secondary">Suivi centralisé des soldes et échéances.</Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Actualiser</Button>
      </Stack>

      <SummaryCards summary={data.summary} />
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField label="Rechercher" value={filters.recherche} onChange={(event) => updateFilter('recherche', event.target.value)} size="small" fullWidth />
          <TextField label={partyLabel} select value={filters.id_tiers} onChange={(event) => updateFilter('id_tiers', event.target.value)} size="small" sx={{ minWidth: { md: 220 } }} disabled={partiesLoading}>
            <MenuItem value="">Tous</MenuItem>
            {parties.map((party) => <MenuItem key={isReceivable ? party.id_client : party.id_fournisseur} value={isReceivable ? party.id_client : party.id_fournisseur}>{isReceivable ? party.nom_client : party.nom_fournisseur}</MenuItem>)}
          </TextField>
          <TextField label="Statut" select value={filters.statut} onChange={(event) => updateFilter('statut', event.target.value)} size="small" sx={{ minWidth: { md: 180 } }}>
            <MenuItem value="">Tous</MenuItem>
            {Object.entries(statusLabel).map(([value, label]) => <MenuItem value={value} key={value}>{label}</MenuItem>)}
          </TextField>
          <TextField label="Échéance à partir du" type="date" value={filters.echeance_debut} onChange={(event) => updateFilter('echeance_debut', event.target.value)} size="small" InputLabelProps={{ shrink: true }} />
          <TextField label="Échéance jusqu’au" type="date" value={filters.echeance_fin} onChange={(event) => updateFilter('echeance_fin', event.target.value)} size="small" InputLabelProps={{ shrink: true }} />
          <TextField label="Trier par" select value={filters.sort_by} onChange={(event) => updateFilter('sort_by', event.target.value)} size="small" sx={{ minWidth: { md: 170 } }}>
            <MenuItem value="date_echeance">Échéance</MenuItem>
            <MenuItem value="date_transaction">Date</MenuItem>
            <MenuItem value="montant_total">Montant total</MenuItem>
            <MenuItem value="montant_restant">Montant restant</MenuItem>
          </TextField>
          <TextField label="Ordre" select value={filters.sort_order} onChange={(event) => updateFilter('sort_order', event.target.value)} size="small" sx={{ minWidth: { md: 120 } }}>
            <MenuItem value="asc">Croissant</MenuItem>
            <MenuItem value="desc">Décroissant</MenuItem>
          </TextField>
          <Button variant={filters.overdue_only ? 'contained' : 'outlined'} color="error" onClick={() => updateFilter('overdue_only', !filters.overdue_only)} sx={{ whiteSpace: 'nowrap' }}>En retard uniquement</Button>
        </Stack>
      </Paper>

      {error && <Alert severity="error" action={<Button color="inherit" size="small" onClick={load}>Réessayer</Button>} sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box> : rows.length === 0 ? <Alert severity="info">Aucune {isReceivable ? 'créance' : 'dette'} ne correspond aux filtres.</Alert> : mobile ? (
        <Stack spacing={1.5}>{rows.map((item) => <LedgerCard key={item.id_transaction} item={item} partyLabel={partyLabel} onPay={() => setSelected(item)} onParty={() => goToParty(item)} />)}</Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead><TableRow><TableCell>{partyLabel}</TableCell><TableCell>Produit</TableCell><TableCell>Échéance</TableCell><TableCell align="right">Total</TableCell><TableCell align="right">Reste</TableCell><TableCell>Statut</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead>
            <TableBody>{rows.map((item) => <TableRow key={item.id_transaction} hover sx={item.est_en_retard ? { backgroundColor: 'rgba(211, 47, 47, 0.06)' } : undefined}>
              <TableCell>{partyPath(item) ? <Button variant="text" size="small" onClick={() => goToParty(item)} sx={{ textTransform: 'none', fontWeight: 700, p: 0, minWidth: 0 }}>{item.client_nom || item.fournisseur_nom || '—'}</Button> : item.client_nom || item.fournisseur_nom || '—'}</TableCell><TableCell>{item.produit_nom || '—'}</TableCell><TableCell>{item.date_echeance || '—'}</TableCell><TableCell align="right">{money(item.montant_total)}</TableCell><TableCell align="right">{money(item.montant_restant)}</TableCell><TableCell><Chip size="small" color={item.est_en_retard ? 'error' : item.statut_paiement === 'paye' ? 'success' : 'warning'} label={statusLabel[item.statut_paiement] || item.statut_paiement} /></TableCell><TableCell align="right"><Button size="small" startIcon={<AddIcon />} onClick={() => setSelected(item)} disabled={Number(item.montant_restant) <= 0}>Paiement</Button></TableCell>
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
  return <Card variant="outlined" sx={item.est_en_retard ? { borderColor: 'error.main' } : undefined}><CardContent><Stack spacing={1}><Stack direction="row" justifyContent="space-between"><Button variant="text" onClick={onParty} disabled={!onParty} sx={{ textTransform: 'none', fontWeight: 700, p: 0, minWidth: 0 }}>{item.client_nom || item.fournisseur_nom || '—'}</Button><Chip size="small" color={item.est_en_retard ? 'error' : item.statut_paiement === 'paye' ? 'success' : 'warning'} label={statusLabel[item.statut_paiement] || item.statut_paiement} /></Stack><Typography variant="body2" color="text.secondary">{partyLabel} · {item.produit_nom || 'Produit'} · échéance {item.date_echeance || 'non définie'}</Typography><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="caption" color="text.secondary">Reste</Typography><Typography fontWeight={700}>{money(item.montant_restant)}</Typography></Box><Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onPay} disabled={Number(item.montant_restant) <= 0}>Ajouter</Button></Stack></Stack></CardContent></Card>;
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
