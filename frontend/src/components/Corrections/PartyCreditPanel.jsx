import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, Stack, Typography } from '@mui/material';
import { AccountBalanceWalletOutlined, ReceiptLongOutlined, HistoryOutlined, ExpandMore } from '@mui/icons-material';
import { get } from '../../services/api';
import { formatMontant } from '../../utils/formatNumber';
import { formatShortDate } from '../../utils/dateFormatting';
import StatCard from '../StatCard/StatCard';
import useCorrectionRefresh from './useCorrectionRefresh';
import CreditOperationDialog from './CreditOperationDialog';
import AdvanceSettlementDialog from './AdvanceSettlementDialog';

const money = amount => formatMontant(amount, { useCompactNotation: false, minimumFractionDigits: 2 });

export default function PartyCreditPanel({ partyType, partyId, totalActivity = null, totalTransactions = null }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [action, setAction] = useState(null);
  const [settlement, setSettlement] = useState(null);
  const client = partyType === 'client';
  useCorrectionRefresh(() => setReload(v => v + 1));
  useEffect(() => {
    let active = true;
    setError(''); setData(null);
    get('/credits/party', { params: { [client ? 'id_client' : 'id_fournisseur']: Number(partyId) } })
      .then(rows => { if (active) setData(rows); }).catch(err => { if (active) setError(err.message || 'Les avances ne peuvent pas être chargées.'); });
    return () => { active = false; };
  }, [client, partyId, reload]);
  const advances = data?.advances || [];
  const allocations = data?.allocations || [];
  const roots = advances.filter(a => a.nature === 'avance');
  const active = roots.filter(a => a.statut === 'active' && Number(a.available) > 0);
  const archived = roots.filter(a => a.statut !== 'active' || Number(a.available) === 0);
  const rootIds = new Set(roots.map(a => a.id_avance));
  const ungrouped = allocations.filter(a => !rootIds.has(a.id_avance));
  const balanceLabel = data && Number(data.balance) < 0 ? client ? 'Crédit du client' : 'Crédit chez le fournisseur'
    : client ? 'Reste net à encaisser' : 'Reste net à payer';
  const allocationRow = a => <Stack key={a.id_affectation} direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" sx={{ borderTop: 1, borderColor: 'divider', pt: 1.25, mt: 1.25 }}>
    <Box><Typography variant="body2">{a.id_transaction_source ? `Crédit ${client ? 'de la vente' : 'de l’achat'} n°${a.id_transaction_source} → ` : 'Utilisation sur '}{client ? 'vente' : 'achat'} n°{a.id_transaction_cible}</Typography>
      <Typography variant="caption" color="text.secondary">{formatShortDate(a.date_effet)}{a.statut === 'annule' ? ' · Annulée' : ''}</Typography></Box>
    <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
      <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{money(a.montant)}</Typography>
      {a.statut === 'active' && <Button size="small" onClick={() => setAction({ action: 'cancel_allocation', allocation: a })}>Annuler l’affectation</Button>}
    </Stack>
  </Stack>;
  const advanceCard = (a, history = false) => {
    const uses = allocations.filter(v => v.id_avance === a.id_avance);
    const returns = advances.filter(v => v.id_origine === a.id_avance);
    const used = uses.filter(v => v.statut === 'active').reduce((n, v) => n + Number(v.montant), 0);
    return <Box key={a.id_avance} component="article" sx={{ p: 2, mb: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: history ? 'action.hover' : 'background.paper' }}>
      <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="flex-start">
        <Box><Typography fontWeight={600}>Avance du {formatShortDate(a.date_effet)}</Typography>
          <Typography variant="caption" color="text.secondary">{a.type_paiement === 'cash' ? 'Espèces' : 'Virement bancaire'}</Typography>
          {history && <Box sx={{ mt: 0.5 }}><Chip size="small" label={a.statut === 'annule' ? 'Annulée' : 'Utilisée ou restituée'} /></Box>}</Box>
        <Box sx={{ textAlign: 'right' }}><Typography variant={history ? 'body1' : 'h6'} sx={{ whiteSpace: 'nowrap', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(history ? a.montant : a.available)}</Typography>
          {!history && <Typography variant="caption" color="text.secondary">encore disponibles</Typography>}</Box>
      </Stack>
      {a.reason && <Typography variant="body2" color="text.secondary" sx={{ mt: 1, overflowWrap: 'anywhere' }}>{a.reason}</Typography>}
      {!history && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" sx={{ mt: 1.5 }}>
        <Typography variant="body2" color="text.secondary">{client ? 'Reçue' : 'Versée'} : {money(a.montant)} · Utilisée : {money(used)}</Typography>
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button size="small" variant="outlined" onClick={() => setSettlement({ advance: a })}>Utiliser</Button>
          <Button size="small" onClick={() => setAction({ action: 'return_advance', advance: a })}>Restituer</Button>
          {Number(a.available) === Number(a.montant) && <Button size="small" color="error" onClick={() => setAction({ action: 'cancel_advance', advance: a })}>Annuler l’enregistrement</Button>}
        </Stack>
      </Stack>}
      {(uses.length > 0 || returns.length > 0) && <Box component="details" open={history || undefined} sx={{ mt: 1.5 }}>
        <Box component="summary" sx={{ color: 'primary.main', cursor: 'pointer', fontSize: '0.8125rem' }}>Voir les utilisations et restitutions</Box>
        {uses.map(allocationRow)}
        {returns.map(r => <Stack key={r.id_avance} direction="row" spacing={1} justifyContent="space-between" sx={{ borderTop: 1, borderColor: 'divider', pt: 1, mt: 1 }}>
          <Typography variant="body2">Restitution du {formatShortDate(r.date_effet)} · {money(r.montant)}{r.statut === 'annule' ? ' · Annulée' : ''}</Typography>
          {r.statut === 'active' && <Button size="small" onClick={() => setAction({ action: 'cancel_advance', advance: r })}>Annuler l’enregistrement</Button>}
        </Stack>)}
      </Box>}
    </Box>;
  };
  return <Box sx={{ mb: 3 }}>
    <Grid container spacing={2} sx={{ mb: 2.5 }}>
      <Grid item xs={12} sm={4}><StatCard title={client ? 'Total ventes' : 'Total achats'} value={totalActivity} icon={<ReceiptLongOutlined />} valueFormat="currency" useCompactNotation={false}
        subtitle={totalTransactions === null ? 'Depuis le début' : `Depuis le début · ${totalTransactions} transactions`} /></Grid>
      <Grid item xs={12} sm={4}><StatCard title={balanceLabel} value={data ? Math.abs(Number(data.balance)) : null} icon={<AccountBalanceWalletOutlined />} valueFormat="currency" color="primary" useCompactNotation={false} subtitle="Avances disponibles prises en compte" /></Grid>
      <Grid item xs={12} sm={4}><StatCard title={client ? 'Avances reçues disponibles' : 'Avances versées disponibles'} value={data ? Number(data.available) : null} icon={<AccountBalanceWalletOutlined />} valueFormat="currency" color="primary" useCompactNotation={false} subtitle={client ? 'À utiliser sur une vente' : 'À utiliser sur un achat'} /></Grid>
    </Grid>
    <Card variant="outlined" sx={{ borderRadius: 3 }}><CardContent>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
        <Box><Typography component="h2" variant="h6">Avances et crédits</Typography><Typography variant="body2" color="text.secondary">{client ? 'Sommes reçues avant leur affectation à une vente.' : 'Sommes versées avant leur affectation à un achat.'}</Typography></Box>
        <Button variant="contained" onClick={() => setAction({ action: 'advance' })}>{client ? 'Enregistrer une avance reçue' : 'Enregistrer une avance versée'}</Button>
      </Stack>
      {error && <Alert severity="error" action={<Button onClick={() => setReload(v => v + 1)}>Réessayer</Button>}>{error}</Alert>}
      {!data && !error && <CircularProgress size={24} aria-label="Chargement des avances" />}
      {data && <>
        {Number(data.available) > 0 && Number(data.debt_total ?? Number(data.balance) + Number(data.available)) > 0 && <Button variant="outlined" sx={{ mb: 2 }} onClick={() => setSettlement({})}>Utiliser les avances disponibles</Button>}
        {active.map(a => advanceCard(a))}
        {!active.length && <Typography color="text.secondary" sx={{ py: 2 }}>Aucune avance disponible actuellement.</Typography>}
        {ungrouped.filter(a => a.statut === 'active').length > 0 && <Box sx={{ mt: 1, mb: 2 }}><Typography variant="subtitle2">Crédits entre transactions</Typography>{ungrouped.filter(a => a.statut === 'active').map(allocationRow)}</Box>}
        <Box component="details" sx={{ borderTop: 1, borderColor: 'divider', pt: 2, mt: 1 }}>
          <Box component="summary" sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', listStyle: 'none' }}><HistoryOutlined fontSize="small" /><Typography fontWeight={600}>Historique</Typography><Typography variant="caption" color="text.secondary">{archived.length} avance(s) terminée(s)</Typography><ExpandMore sx={{ ml: 'auto' }} /></Box>
          <Box sx={{ mt: 2 }}>{archived.map(a => advanceCard(a, true))}{ungrouped.filter(a => a.statut === 'annule').map(allocationRow)}{!archived.length && !ungrouped.some(a => a.statut === 'annule') && <Typography color="text.secondary">Aucun enregistrement terminé ou annulé.</Typography>}</Box>
        </Box>
      </>}
    </CardContent></Card>
    {action && <CreditOperationDialog {...action} partyType={partyType} partyId={partyId} onClose={() => setAction(null)} onSaved={() => setAction(null)} />}
    {settlement && <AdvanceSettlementDialog {...settlement} partyType={partyType} partyId={partyId} onClose={() => setSettlement(null)} onSaved={() => setSettlement(null)} />}
  </Box>;
}
