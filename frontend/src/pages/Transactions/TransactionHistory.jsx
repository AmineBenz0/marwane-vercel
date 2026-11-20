import { useEffect, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button,
  CircularProgress, Divider, Stack, Typography,
} from '@mui/material';
import { ExpandMore, HistoryOutlined } from '@mui/icons-material';
import { get } from '../../services/api';
import { formatShortDateTime } from '../../utils/dateFormatting';
import { displayValue, fieldLabels } from '../../components/Corrections/correctionValues';

const AUDIT_LIMIT = 50; // API maximum
const MAX_CORRECTION_PAGES = 5;
const DEFAULT_REASON = 'Correction des informations enregistrées';
// Technical fields that mean nothing to the user.
const HIDDEN_FIELDS = new Set(['id_utilisateur_creation', 'id_utilisateur_modification', 'id_utilisateur_annulation',
  'row_version', 'stock_revision', 'date_modification', 'date_creation', 'allocation_automatique',
  'date_annulation', 'motif_annulation', 'id_cycle', 'quantite_annulee']);
const SHOWN_CORRECTION_FIELDS = ['date_transaction', 'id_client', 'id_fournisseur', 'id_produit', 'id_batiment',
  'quantite', 'prix_unitaire', 'montant_total', 'date_echeance', 'date_livraison_prevue',
  'montant', 'type_paiement', 'date_paiement', 'statut', 'statut_cheque', 'notes'];

const isTrue = (value) => ['true', 't', '1'].includes(String(value).toLowerCase());
const sameValue = (a, b) => {
  if (a == null || a === '' || a === 'NULL') return b == null || b === '' || b === 'NULL';
  const na = Number(a); const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) ? na === nb : String(a) === String(b);
};
const secondKey = (date) => String(date || '').slice(0, 19);

/**
 * Builds one readable timeline from the transaction audit and the correction history.
 * A correction writes audit rows with the same timestamp: they are merged into one entry.
 */
export function buildHistory({ audit = [], corrections = [], names = {}, isSale, createdAt }) {
  const noun = isSale ? 'Vente' : 'Achat';
  const events = new Map();
  const eventAt = (date, author) => {
    const key = secondKey(date);
    if (!events.has(key)) events.set(key, { key, date, author, titles: [], lines: [], reason: '' });
    const event = events.get(key);
    if (!event.author && author) event.author = author;
    return event;
  };
  const label = (field) => fieldLabels[field] || 'Information';
  const value = (field, raw) => displayValue(field, raw === 'NULL' ? null : raw, names);

  corrections.forEach((item) => {
    const event = eventAt(item.recorded_at, item.actor_name);
    const payment = item.target?.entity_type === 'paiement';
    event.titles.push(payment ? `Paiement n° ${item.target.entity_id} corrigé` : `${noun} corrigé${isSale ? 'e' : ''}`);
    if (item.reason && item.reason !== DEFAULT_REASON) event.reason = item.reason;
    SHOWN_CORRECTION_FIELDS.forEach((field) => {
      if (!(field in (item.before || {})) || !(field in (item.after || {}))) return;
      if (sameValue(item.before[field], item.after[field])) return;
      event.lines.push({ field, text: `${label(field)} : ${value(field, item.before[field])} → ${value(field, item.after[field])}` });
    });
  });

  audit.forEach((entry) => {
    if (HIDDEN_FIELDS.has(entry.champ_modifie)) return;
    const event = eventAt(entry.date_changement, entry.nom_utilisateur);
    if (entry.champ_modifie === 'est_actif') {
      event.titles.push(isTrue(entry.nouvelle_valeur) ? `${noun} réactivé${isSale ? 'e' : ''}` : `${noun} annulé${isSale ? 'e' : ''}`);
      return;
    }
    // Already described by the correction recorded at the same moment.
    if (event.lines.some((line) => line.field === entry.champ_modifie)) return;
    event.lines.push({
      field: entry.champ_modifie,
      text: `${label(entry.champ_modifie)} : ${value(entry.champ_modifie, entry.ancienne_valeur)} → ${value(entry.champ_modifie, entry.nouvelle_valeur)}`,
    });
  });

  const list = [...events.values()]
    .filter((event) => event.titles.length || event.lines.length)
    .map((event) => ({ ...event, title: event.titles.length ? [...new Set(event.titles)].join(' · ') : `${noun} modifié${isSale ? 'e' : ''}` }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (createdAt) list.push({ key: 'creation', date: createdAt, title: `${noun} enregistré${isSale ? 'e' : ''}`, lines: [] });
  return list;
}

export default function TransactionHistory({ transaction, includeCorrections }) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState({ loading: false, loaded: false, error: '', audit: [], corrections: [], names: {} });
  const [reload, setReload] = useState(0);
  const transactionId = transaction?.id_transaction;
  const revision = `${transaction?.row_version}:${transaction?.est_actif}`;

  useEffect(() => {
    if (!expanded || !transactionId) return undefined;
    let active = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    const loadCorrections = async () => {
      if (!includeCorrections) return { items: [], names: {} };
      let items = []; let names = {}; let offset = 0;
      for (let page = 0; page < MAX_CORRECTION_PAGES; page += 1) {
        const data = await get('/corrections/history', { params: { transaction_id: transactionId, ...(offset ? { offset } : {}) } });
        items = [...items, ...(data.items || [])];
        names = Object.fromEntries(Object.keys({ ...names, ...data.names }).map((key) => [key, { ...names[key], ...data.names?.[key] }]));
        if (!data.has_more) break;
        offset = data.next_offset;
      }
      return { items, names };
    };
    Promise.all([
      get(`/transactions/${transactionId}/audit`, { params: { skip: 0, limit: AUDIT_LIMIT } }),
      loadCorrections().catch(() => ({ items: [], names: {} })),
    ]).then(([audit, corrections]) => {
      if (active) setState({ loading: false, loaded: true, error: '', audit: Array.isArray(audit) ? audit : [], corrections: corrections.items, names: corrections.names });
    }).catch(() => {
      if (active) setState((s) => ({ ...s, loading: false, loaded: true, error: 'Impossible de charger l’historique.' }));
    });
    return () => { active = false; };
  }, [expanded, transactionId, includeCorrections, revision, reload]);

  const isSale = Boolean(transaction?.id_client);
  const events = state.loaded ? buildHistory({
    audit: state.audit, corrections: state.corrections, names: state.names, isSale, createdAt: transaction?.date_creation,
  }) : [];

  return (
    <Accordion disableGutters elevation={0} expanded={expanded} onChange={(_, next) => setExpanded(next)}
      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px !important', bgcolor: 'background.paper',
        overflow: 'hidden', boxShadow: 'none', '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMore />} aria-controls="transaction-history-content" id="transaction-history-header"
        sx={{ px: { xs: 2, sm: 2.5 }, minHeight: 58, '& .MuiAccordionSummary-content': { gap: 1, alignItems: 'center' }, '&.Mui-expanded': { minHeight: 58 } }}>
        <HistoryOutlined fontSize="small" color="primary" aria-hidden="true" />
        <Typography component="h2" variant="subtitle1" fontWeight={700}>Historique</Typography>
      </AccordionSummary>
      <AccordionDetails id="transaction-history-content" sx={{ px: { xs: 2, sm: 2.5 }, pb: 2, pt: 0 }}>
        {state.loading && !state.loaded && <Stack direction="row" alignItems="center" spacing={1} role="status">
          <CircularProgress size={18} /><Typography variant="body2">Chargement…</Typography>
        </Stack>}
        {state.error && <Alert severity="error" action={<Button size="small" color="inherit" onClick={() => setReload((v) => v + 1)}>Réessayer</Button>}>{state.error}</Alert>}
        {state.loaded && !state.error && <Stack component="ol" aria-label="Historique de la transaction" divider={<Divider component="li" aria-hidden="true" />} sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {events.map((event) => <Box component="li" key={event.key}
            sx={{ py: 1.25, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '150px 1fr' }, columnGap: 2, rowGap: 0.25 }}>
            <Typography variant="caption" color="text.secondary" sx={{ pt: { sm: 0.25 } }}>
              {formatShortDateTime(event.date)}{event.author ? ` · ${event.author}` : ''}
            </Typography>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={700}>{event.title}</Typography>
              {event.reason && <Typography variant="body2" color="text.secondary">« {event.reason} »</Typography>}
              {event.lines.map((line) => <Typography key={line.field} variant="body2" sx={{ overflowWrap: 'anywhere' }}>{line.text}</Typography>)}
            </Box>
          </Box>)}
        </Stack>}
      </AccordionDetails>
    </Accordion>
  );
}
