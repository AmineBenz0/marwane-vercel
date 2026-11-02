import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import { get } from '../../services/api';
import { formatMontant } from '../../utils/formatNumber';
import { formatShortDate } from '../../utils/dateFormatting';
import useCorrectionRefresh from './useCorrectionRefresh';
import CreditOperationDialog from './CreditOperationDialog';

export default function PartyCreditPanel({ partyType, partyId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [action, setAction] = useState(null);
  useCorrectionRefresh(() => setReload(v => v + 1));
  useEffect(() => {
    let active = true;
    setError(''); setData(null);
    get('/credits/party', { params: { [partyType === 'client' ? 'id_client' : 'id_fournisseur']: Number(partyId) } })
      .then(rows => { if (active) setData(rows); }).catch(err => { if (active) setError(err.message || 'Les avances ne peuvent pas être chargées.'); });
    return () => { active = false; };
  }, [partyType, partyId, reload]);
  return <Card variant="outlined" sx={{ mb: 2.5, borderRadius: 3 }}><CardContent>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
      <Box><Typography component="h2" variant="h6">Avances et crédits</Typography>
        {data && <Typography>{Number(data.balance) < 0 ? 'Crédit net de ce contact' : partyType === 'client' ? 'Reste net à encaisser' : 'Reste net à payer'} : <strong>{formatMontant(Math.abs(Number(data.balance)))}</strong></Typography>}
        {data && <Typography>Avances encore disponibles : <strong>{formatMontant(data.available)}</strong></Typography>}
      </Box>
      <Button variant="outlined" onClick={() => setAction({ action: 'advance' })}>Enregistrer une avance</Button>
    </Stack>
    {error && <Alert severity="error" action={<Button onClick={() => setReload(v => v + 1)}>Réessayer</Button>}>{error}</Alert>}
    {!data && !error && <CircularProgress size={24} aria-label="Chargement des avances" />}
    {data?.advances?.map(a => <Box key={a.id_avance} sx={{ py: 1.5, borderTop: 1, borderColor: 'divider', mt: 1 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
        <Box><Typography fontWeight={700}>{a.nature === 'retour_avance' ? 'Restitution d’avance' : 'Avance'} du {formatShortDate(a.date_effet)} · {formatMontant(a.montant)}{a.statut === 'annule' ? ' · Annulée' : ''}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{a.reason}</Typography>
          {a.nature === 'avance' && a.statut === 'active' && <Typography variant="body2">Disponible : {formatMontant(a.available)}</Typography>}
        </Box>
        {a.statut === 'active' && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {a.nature === 'avance' && Number(a.available) > 0 && <>
            <Button onClick={() => setAction({ action: 'allocate', advance: a })}>Utiliser</Button>
            <Button onClick={() => setAction({ action: 'return_advance', advance: a })}>Restituer</Button>
          </>}
          {(a.nature === 'retour_avance' || Number(a.available) === Number(a.montant)) && <Button color="error" onClick={() => setAction({ action: 'cancel_advance', advance: a })}>Annuler l’enregistrement</Button>}
        </Stack>}
      </Stack>
    </Box>)}
    {data?.allocations?.map(a => <Stack key={a.id_affectation} direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" sx={{ py: 1, borderTop: 1, borderColor: 'divider' }}>
      <Typography variant="body2">{a.id_transaction_source ? `Crédit de la transaction n° ${a.id_transaction_source}` : 'Avance'} → transaction n° {a.id_transaction_cible} · {formatMontant(a.montant)} · {formatShortDate(a.date_effet)}{a.statut === 'annule' ? ' · Annulée' : ''}</Typography>
      {a.statut === 'active' && <Button onClick={() => setAction({ action: 'cancel_allocation', allocation: a })}>Annuler l’affectation</Button>}
    </Stack>)}
    {data && !data.advances.length && !data.allocations.length && <Typography color="text.secondary" sx={{ mt: 1.5 }}>Aucune avance ni affectation enregistrée.</Typography>}
    {action && <CreditOperationDialog {...action} partyType={partyType} partyId={partyId} onClose={() => setAction(null)} onSaved={() => { setAction(null); }} />}
  </CardContent></Card>;
}
