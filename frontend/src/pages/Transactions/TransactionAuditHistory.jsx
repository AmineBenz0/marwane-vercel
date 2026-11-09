import { useEffect, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button,
  CircularProgress, Divider, Stack, Typography,
} from '@mui/material';
import { ArrowForward, ExpandMore, HistoryOutlined } from '@mui/icons-material';
import { get } from '../../services/api';
import { formatShortDate, formatShortDateTime } from '../../utils/dateFormatting';
import { formatMontant } from '../../utils/formatNumber';

const PAGE_SIZE = 10;

const fieldLabels = {
  date_transaction: 'Date de transaction',
  montant_total: 'Montant total',
  est_actif: 'État de la transaction',
  id_client: 'Client',
  id_fournisseur: 'Fournisseur',
  id_utilisateur_creation: 'Créé par',
  id_utilisateur_modification: 'Modifié par',
};

const displayValue = (field, value) => {
  if (value == null || value === 'NULL' || value === '') return 'Non renseigné';
  if (field === 'date_transaction') return formatShortDate(value);
  if (field === 'montant_total' && Number.isFinite(Number(value))) {
    return formatMontant(Number(value), { useCompactNotation: false, minimumFractionDigits: 2 });
  }
  if (field === 'est_actif') {
    const normalized = String(value).toLowerCase();
    if (['true', 't', '1'].includes(normalized)) return 'Active';
    if (['false', 'f', '0'].includes(normalized)) return 'Annulée';
  }
  if (field === 'id_client') return `Client n° ${value}`;
  if (field === 'id_fournisseur') return `Fournisseur n° ${value}`;
  if (field === 'id_utilisateur_creation' || field === 'id_utilisateur_modification') {
    return `Utilisateur n° ${value}`;
  }
  return String(value);
};

/**
 * Read-only existing transaction audit. This is not the future correction
 * command history, and cannot modify or revert any business record.
 */
export default function TransactionAuditHistory({ transactionId }) {
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!expanded || loaded || !transactionId) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    get(`/transactions/${transactionId}/audit`, { params: { skip: 0, limit: PAGE_SIZE } })
      .then(rows => {
        if (!active) return;
        const result = Array.isArray(rows) ? rows : [];
        setEntries(result);
        setHasMore(result.length === PAGE_SIZE);
      })
      .catch(() => {
        if (!active) return;
        setError('Impossible de charger cet historique.');
      })
      .finally(() => {
        // Keep loading and loaded in sync. Setting loaded in .then/.catch
        // would run the effect cleanup before .finally, leaving loading true.
        if (active) {
          setLoading(false);
          setLoaded(true);
        }
      });
    return () => { active = false; };
  }, [expanded, loaded, transactionId]);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError('');
    try {
      const rows = await get(`/transactions/${transactionId}/audit`, {
        params: { skip: entries.length, limit: PAGE_SIZE },
      });
      const next = Array.isArray(rows) ? rows : [];
      setEntries(previous => [...previous, ...next]);
      setHasMore(next.length === PAGE_SIZE);
    } catch {
      setError('Impossible de charger les modifications précédentes.');
    } finally {
      setLoading(false);
    }
  };

  const retry = () => {
    if (entries.length > 0) {
      loadMore();
    } else {
      setError('');
      setLoaded(false);
    }
  };

  return (
    <Accordion disableGutters elevation={0} expanded={expanded}
      onChange={(_, next) => setExpanded(next)}
      sx={{
        border: '1px solid', borderColor: 'divider', borderRadius: '12px !important',
        bgcolor: 'background.paper', overflow: 'hidden',
        boxShadow: 'none', '&:before': { display: 'none' },
      }}>
      <AccordionSummary expandIcon={<ExpandMore />} aria-controls="transaction-audit-content"
        id="transaction-audit-header"
        sx={{
          px: { xs: 2, sm: 2.5 }, minHeight: 58,
          '& .MuiAccordionSummary-content': { gap: 1, alignItems: 'center' },
          '&.Mui-expanded': { minHeight: 58 },
        }}>
        <HistoryOutlined fontSize="small" color="primary" aria-hidden="true" />
        <Typography component="h2" variant="subtitle1" fontWeight={700}>
          Historique des modifications
        </Typography>
      </AccordionSummary>
      <AccordionDetails id="transaction-audit-content" sx={{ px: { xs: 2, sm: 2.5 }, pb: 2.5, pt: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Modifications de la transaction enregistrées par l’audit existant. Les paiements ne sont pas inclus.
        </Typography>
        {loading && entries.length === 0 && (
          <Stack direction="row" alignItems="center" spacing={1} role="status">
            <CircularProgress size={18} />
            <Typography variant="body2">Chargement de l’historique…</Typography>
          </Stack>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }}
            action={<Button size="small" color="inherit" onClick={retry}>Réessayer</Button>}>
            {error}
          </Alert>
        )}
        {loaded && !loading && !error && entries.length === 0 && (
          <Typography variant="body2" color="text.secondary">Aucune modification enregistrée.</Typography>
        )}
        <Stack spacing={0} divider={<Divider />}>
          {entries.map(entry => (
            <Box key={entry.id_audit} sx={{ py: 1.5, minWidth: 0 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={0.5} sx={{ mb: 1 }}>
                <Typography variant="body2" fontWeight={700}>
                  {fieldLabels[entry.champ_modifie] || 'Information modifiée'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatShortDateTime(entry.date_changement)} · {entry.nom_utilisateur || 'Auteur non identifié'}
                </Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">Avant</Typography>
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                    {displayValue(entry.champ_modifie, entry.ancienne_valeur)}
                  </Typography>
                </Box>
                <ArrowForward fontSize="small" color="disabled" aria-hidden="true" />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">Après</Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>
                    {displayValue(entry.champ_modifie, entry.nouvelle_valeur)}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          ))}
        </Stack>
        {hasMore && entries.length > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1.5 }}>
            <Button size="small" variant="outlined" onClick={loadMore} disabled={loading}>
              {loading ? 'Chargement…' : 'Afficher les modifications précédentes'}
            </Button>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
