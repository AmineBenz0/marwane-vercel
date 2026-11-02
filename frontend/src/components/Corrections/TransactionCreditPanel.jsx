import { useEffect, useState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { get } from '../../services/api';
import { formatMontant } from '../../utils/formatNumber';
import { formatShortDate } from '../../utils/dateFormatting';
import useCorrectionRefresh from './useCorrectionRefresh';
import CreditOperationDialog from './CreditOperationDialog';

export default function TransactionCreditPanel({ transaction, canAllocate }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [action, setAction] = useState(null);
  useCorrectionRefresh(() => setReload(v => v + 1));
  useEffect(() => {
    let active = true;
    setRows([]); setError('');
    get('/credits/allocations', { params: { transaction_id: transaction.id_transaction } })
      .then(data => { if (active) setRows(data); })
      .catch(err => { if (active) setError(err.message || 'Les affectations ne peuvent pas être chargées.'); });
    return () => { active = false; };
  }, [transaction.id_transaction, reload]);
  return <Box sx={{ mt: 2 }}>
    {canAllocate && <Button variant="outlined" fullWidth onClick={() => setAction({ action: 'allocate' })}>Utiliser un crédit</Button>}
    {error && <Alert severity="error" sx={{ mt: 1 }} action={<Button onClick={() => setReload(v => v + 1)}>Réessayer</Button>}>{error}</Alert>}
    {rows.map(row => <Stack key={row.id_affectation} spacing={0.5} sx={{ mt: 1.5, borderTop: 1, borderColor: 'divider', pt: 1 }}>
      <Typography variant="body2">{row.id_transaction_cible === transaction.id_transaction
        ? row.id_transaction_source ? `Crédit reçu de la transaction n° ${row.id_transaction_source}` : 'Avance utilisée'
        : `Crédit utilisé sur la transaction n° ${row.id_transaction_cible}`} · {formatMontant(row.montant)} · {formatShortDate(row.date_effet)}{row.statut === 'annule' ? ' · Annulée' : ''}</Typography>
      {row.statut === 'active' && transaction.est_actif && <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => setAction({ action: 'cancel_allocation', allocation: row })}>Annuler l’affectation</Button>}
    </Stack>)}
    {action && <CreditOperationDialog {...action} transaction={transaction} onClose={() => setAction(null)} onSaved={() => setAction(null)} />}
  </Box>;
}
