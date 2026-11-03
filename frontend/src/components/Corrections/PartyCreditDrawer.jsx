import { useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Drawer, IconButton, Stack, Typography } from '@mui/material';
import { AccountBalanceWalletOutlined, Close, HistoryOutlined, ReceiptLongOutlined } from '@mui/icons-material';
import { formatMontant } from '../../utils/formatNumber';
import { formatShortDate } from '../../utils/dateFormatting';
import ExpandableDetails from '../ExpandableDetails';
import CreditOperationDialog from './CreditOperationDialog';

const money = amount => formatMontant(amount, { useCompactNotation: false, minimumFractionDigits: 2 });

export default function PartyCreditDrawer({ partyType, partyId, partyName, open, onClose, data, error, onRetry }) {
  const [action, setAction] = useState(null);
  const client = partyType === 'client';
  const operationOpen = Boolean(action);
  const close = () => { if (!operationOpen) onClose(); };
  const advances = data?.advances || [];
  const allocations = data?.allocations || [];
  const roots = advances.filter(a => a.nature === 'avance');
  const active = roots.filter(a => a.statut === 'active' && Number(a.available) > 0);
  const archived = roots.filter(a => a.statut !== 'active' || Number(a.available) === 0);
  const rootIds = new Set(roots.map(a => a.id_avance));
  const ungrouped = allocations.filter(a => !rootIds.has(a.id_avance));
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
          {!history && <Typography variant="caption" color="text.secondary">au compte</Typography>}</Box>
      </Stack>
      {a.reason && <Typography variant="body2" color="text.secondary" sx={{ mt: 1, overflowWrap: 'anywhere' }}>{a.reason}</Typography>}
      {!history && <Stack spacing={1.5} sx={{ mt: 1.5 }}>
        <Typography variant="body2" color="text.secondary">{client ? 'Reçue' : 'Versée'} : {money(a.montant)}{used > 0 ? ` · Affectée (historique) : ${money(used)}` : ''}</Typography>
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button size="small" onClick={() => setAction({ action: 'return_advance', advance: a })}>Restituer</Button>
          {Number(a.available) === Number(a.montant) && <Button size="small" color="error" onClick={() => setAction({ action: 'cancel_advance', advance: a })}>Annuler l’enregistrement</Button>}
        </Stack>
      </Stack>}
      {(uses.length > 0 || returns.length > 0) && <ExpandableDetails label="Utilisations et restitutions" icon={<ReceiptLongOutlined />} defaultExpanded={history} sx={{ mt: 1.5 }}>
        {uses.map(allocationRow)}
        {returns.map(r => <Stack key={r.id_avance} direction="row" spacing={1} justifyContent="space-between" sx={{ borderTop: 1, borderColor: 'divider', pt: 1, mt: 1 }}>
          <Typography variant="body2">Restitution du {formatShortDate(r.date_effet)} · {money(r.montant)}{r.statut === 'annule' ? ' · Annulée' : ''}</Typography>
          {r.statut === 'active' && <Button size="small" onClick={() => setAction({ action: 'cancel_advance', advance: r })}>Annuler l’enregistrement</Button>}
        </Stack>)}
      </ExpandableDetails>}
    </Box>;
  };
  return <>
    <Drawer anchor="right" open={open} onClose={close} PaperProps={{ role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'party-credit-title', sx: { width: { xs: '100%', sm: 540 }, maxWidth: '100%', bgcolor: 'background.paper', color: 'text.primary', overflow: 'hidden' } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} sx={{ p: { xs: 2, sm: 3 }, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ minWidth: 0 }}><Typography id="party-credit-title" component="h2" variant="h6" fontWeight={700}>Avances et crédits</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>{partyName || `${client ? 'Client' : 'Fournisseur'} n°${partyId}`}</Typography></Box>
        <IconButton aria-label="Fermer les avances et crédits" onClick={close} disabled={operationOpen}><Close /></IconButton>
      </Stack>
      <Box sx={{ p: { xs: 2, sm: 3 }, flex: 1, minHeight: 0, overflowY: 'auto', bgcolor: 'background.default' }}>
        {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={onRetry}>Réessayer</Button>}>{error}</Alert>}
        {!data && !error && <Box sx={{ py: 3 }}><CircularProgress size={24} aria-label="Chargement des avances" /></Box>}
        {data && <Box sx={{ p: 2, mb: 2, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
            <Box><Typography variant="body2" color="text.secondary">{client ? 'Avances reçues au compte' : 'Avances versées au compte'}</Typography>
              <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>{money(data.available)}</Typography></Box>
            <AccountBalanceWalletOutlined color="primary" />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Ces avances sont déjà déduites du solde global du contact.</Typography>
        </Box>}
        <Button variant="contained" fullWidth sx={{ mb: 2 }} onClick={() => setAction({ action: 'advance' })}>{client ? 'Enregistrer une avance reçue' : 'Enregistrer une avance versée'}</Button>
        {data && <>
          {active.map(a => advanceCard(a))}
          {!active.length && <Typography color="text.secondary" sx={{ py: 2 }}>Aucune avance au compte actuellement.</Typography>}
          {ungrouped.filter(a => a.statut === 'active').length > 0 && <Box sx={{ mt: 1, mb: 2 }}><Typography variant="subtitle2">Crédits entre transactions</Typography>{ungrouped.filter(a => a.statut === 'active').map(allocationRow)}</Box>}
          <ExpandableDetails label="Historique" icon={<HistoryOutlined />} meta={`${archived.length} ${archived.length === 1 ? 'avance terminée' : 'avances terminées'}`} sx={{ mt: 1 }}>
            {archived.map(a => advanceCard(a, true))}{ungrouped.filter(a => a.statut === 'annule').map(allocationRow)}{!archived.length && !ungrouped.some(a => a.statut === 'annule') && <Typography color="text.secondary">Aucun enregistrement terminé ou annulé.</Typography>}
          </ExpandableDetails>
        </>}
      </Box>
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end', borderTop: 1, borderColor: 'divider' }}><Button variant="outlined" onClick={close} disabled={operationOpen}>Fermer</Button></Box>
    </Drawer>
    {action && <CreditOperationDialog {...action} partyType={partyType} partyId={partyId} onClose={() => setAction(null)} onSaved={() => setAction(null)} />}
  </>;
}
