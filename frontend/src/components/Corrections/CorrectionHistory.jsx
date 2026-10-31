import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import ExpandableDetails from '../ExpandableDetails';
import { get } from '../../services/api';
import { changedValues, displayValue, fieldLabels } from './correctionValues';

export default function CorrectionHistory({ transactionId, revision, names = {}, onReuse, readOnly }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState({ has_more: false, next_offset: 0 });
  const [reload, setReload] = useState(0);
  const [historyNames, setHistoryNames] = useState({});
  const generation = useRef(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    generation.current += 1;
    setBusy(true); setError('');
    get('/corrections/history', { params: { transaction_id: transactionId } }).then(data => {
      if (active) { setItems(data.items || []); setPage(data); setHistoryNames(data.names || {}); }
    }).catch(err => { if (active) setError(err.message || 'L’historique ne peut pas être chargé.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; generation.current += 1; };
  }, [open, transactionId, revision, reload]);
  const more = async () => {
    const current = generation.current;
    setBusy(true); setError('');
    try { const data = await get('/corrections/history', { params: { transaction_id: transactionId, offset: page.next_offset } });
      if (current === generation.current) {
        setItems(items => [...items, ...data.items]); setPage(data);
        setHistoryNames(previous => Object.fromEntries(Object.keys({ ...previous, ...data.names }).map(key => [key, { ...previous[key], ...data.names?.[key] }])));
      }
    } catch (err) { if (current === generation.current) setError(err.message); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const labels = Object.fromEntries(Object.keys({ ...names, ...historyNames }).map(key => [key, { ...names[key], ...historyNames[key] }]));
  return <ExpandableDetails label="Historique des corrections" expanded={open} onChange={(_, value) => setOpen(value)}>
    <Stack spacing={2}>
      {error && <Alert severity="error" action={<Button onClick={() => setReload(v => v + 1)}>Réessayer</Button>}>{error}</Alert>}
      {!busy && !error && !items.length && <Typography variant="body2">Aucune correction enregistrée.</Typography>}
      {items.map(item => <Box key={item.operation_id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
        <Typography fontWeight={700}>{item.target.entity_type === 'transaction' ? 'Transaction' : 'Paiement'} n° {item.target.entity_id}</Typography>
        <Typography variant="caption" color="text.secondary">{new Date(item.recorded_at).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })} · {item.actor_name}</Typography>
        <Typography variant="body2" sx={{ my: 1 }}>{item.reason}</Typography>
        {Object.keys(changedValues(item.after, item.before)).filter(key => key in fieldLabels && key in item.before).map(key => <Typography variant="body2" key={key} sx={{ overflowWrap: 'anywhere' }}>
          {fieldLabels[key]} : {displayValue(key, item.before[key], labels)} → {displayValue(key, item.after[key], labels)}
        </Typography>)}
        {item.impact?.stock?.kind === 'eggs' && Object.entries(item.impact.stock.after).map(([id, allocations]) => <Box key={id} sx={{ mt: 1 }}>
          <Typography variant="body2" fontWeight={600}>Vente n° {id} · répartition après correction</Typography>
          {allocations.map(row => <Typography variant="body2" key={row.id_production}>{displayValue('id_production', row.id_production, labels)} : {row.quantite} œufs</Typography>)}
        </Box>)}
        {!readOnly && Object.keys(item.reuse_changes || {}).length > 0 && (item.target.entity_type === 'paiement' || item.target.entity_id === Number(transactionId)) && <Button sx={{ mt: 1 }} onClick={() => onReuse(item)}>Reprendre les valeurs précédentes</Button>}
      </Box>)}
      {busy && <CircularProgress size={24} aria-label="Chargement des corrections" />}
      {!busy && page.has_more && <Button onClick={more}>Voir les corrections précédentes</Button>}
      <Typography variant="caption" color="text.secondary">Reprendre des valeurs prépare une nouvelle correction, à vérifier avant de l’enregistrer.</Typography>
    </Stack>
  </ExpandableDetails>;
}
