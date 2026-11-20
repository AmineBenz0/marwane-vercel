import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { displayValue, fieldLabels, money } from './correctionValues';

const total = allocations => (allocations || []).reduce((sum, row) => sum + Number(row.quantite), 0);
function Effect({ title, before, after, names }) {
  return <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}>
    <Typography fontWeight={700}>{title}</Typography>
    <Typography variant="body2">{before ? `${before.direction === 'SORTIE' ? 'Sortie' : 'Entrée'} de ${money(before.amount)} le ${displayValue('date_paiement', before.date)}${before.account_id ? ` · ${displayValue('id_compte', before.account_id, names)}` : ''}` : 'Aucun mouvement'}
      {' → '}{after ? `${after.direction === 'SORTIE' ? 'Sortie' : 'Entrée'} de ${money(after.amount)} le ${displayValue('date_paiement', after.date)}${after.account_id ? ` · ${displayValue('id_compte', after.account_id, names)}` : ''}` : 'Aucun mouvement'}</Typography>
  </Box>;
}
export function CorrectionImpact({ preview, names = {}, transaction }) {
  const { before, after, target, impact } = preview;
  const stock = impact?.stock;
  const nextRemaining = impact?.balance ? Number(impact.balance.remaining) : transaction ? (target.entity_type === 'transaction'
    ? Number(after.montant_total) - Number(transaction.montant_paye || 0)
    : Number(transaction.montant_restant || 0) + Number(before.montant) - Number(after.montant)) : null;
  const fields = Object.keys(fieldLabels).filter(field => field in after && String(before[field] ?? '') !== String(after[field] ?? '')
    && !(field === 'montant_total' && !('montant_total' in preview.changes)));
  return <Stack spacing={1.5}>
    {fields.map(field => <Typography key={field} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
      <Box component="span" color="text.secondary">{fieldLabels[field]} : </Box>
      <Box component="span" sx={{ color: 'text.secondary', textDecoration: 'line-through' }}>{displayValue(field, before[field], names)}</Box>
      {' → '}<strong>{displayValue(field, after[field], names)}</strong>
    </Typography>)}
    {nextRemaining !== null && Number.isFinite(nextRemaining) && <Typography variant="body2" sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
      {nextRemaining < 0
        ? <>Crédit {impact?.balance?.side || (transaction?.id_client ? 'client' : 'fournisseur')} : <strong>{money(-nextRemaining)}</strong> · aucun remboursement automatique</>
        : <>{transaction?.id_client ? 'Reste à encaisser' : 'Reste à payer'} : <strong>{money(nextRemaining)}</strong></>}
    </Typography>}
    {impact?.cash && typeof impact.cash === 'object' && <Effect title="Caisse" {...impact.cash} names={names} />}
    {impact?.bank && typeof impact.bank === 'object' && <Effect title="Banque" {...impact.bank} names={names} />}
    {impact?.bank?.account_balances?.map(account => <Typography variant="body2" key={account.account_id}>
      Solde de {displayValue('id_compte', account.account_id, names)} : {money(account.before)} → {money(account.after)}
    </Typography>)}
    {stock?.kind === 'inventory' && Object.entries(stock.final_quantities).map(([id, quantity]) => <Typography variant="body2" key={id}>
      <Box component="span" color="text.secondary">Stock de {displayValue('id_produit', id, names)} : </Box>{Number(quantity).toLocaleString('fr-FR')}
    </Typography>)}
    {stock?.kind === 'eggs' && <Stack spacing={1}>
      <Typography variant="body2" fontWeight={700}>Œufs utilisés</Typography>
      {Object.entries(stock.after).map(([id, allocations]) => <Box key={id} sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
        <Typography fontWeight={600}>Vente n° {id} : {total(stock.before[id])} → {total(allocations)} œufs affectés</Typography>
        {allocations.map(row => <Typography variant="body2" key={row.id_production}>
          {displayValue('id_production', row.id_production, names)} : {row.quantite.toLocaleString('fr-FR')} œufs{row.quantite_livree > 0 ? `, dont ${row.quantite_livree} déjà fournis` : ''}
        </Typography>)}
      </Box>)}
    </Stack>}
    {impact?.contact_balance && <Typography variant="body2" color="text.secondary">Les paiements suivront le nouveau contact.</Typography>}
  </Stack>;
}
export default function CorrectionReview({ flow, names, transaction }) {
  return <Stack spacing={2} aria-label="Confirmer la modification">
    <Typography component="h2" variant="subtitle1" fontWeight={800}>Confirmer la modification</Typography>
    <CorrectionImpact preview={flow.review} names={names} transaction={transaction} />
    {flow.error && <Alert severity="error" role="alert">{flow.error}</Alert>}
    <Stack direction="row" spacing={1} justifyContent="flex-end">
      <Button color="inherit" onClick={flow.edit} disabled={flow.busy || flow.uncertain}>Retour</Button>
      {flow.stale ? <Button variant="contained" onClick={flow.refresh} disabled={flow.busy}>Actualiser</Button>
        : <Button variant="contained" onClick={flow.confirm} disabled={flow.busy}>{flow.busy ? 'Enregistrement…' : flow.uncertain ? 'Réessayer' : 'Enregistrer'}</Button>}
    </Stack>
  </Stack>;
}
