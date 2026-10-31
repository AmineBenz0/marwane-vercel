import { Alert, Box, Button, Divider, Stack, Typography } from '@mui/material';
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
    {fields.map(field => <Box key={field} sx={{ overflowWrap: 'anywhere' }}>
      <Typography variant="body2" color="text.secondary">{fieldLabels[field]}</Typography>
      <Typography>{displayValue(field, before[field], names)} → <strong>{displayValue(field, after[field], names)}</strong></Typography>
    </Box>)}
    {nextRemaining !== null && Number.isFinite(nextRemaining) && <Alert severity={nextRemaining < 0 ? 'info' : 'success'}>
      {nextRemaining < 0 ? `Crédit ${(impact?.balance?.side || (transaction?.id_client ? 'client' : 'fournisseur'))} après correction : ${money(-nextRemaining)}. Aucun remboursement n’est enregistré.`
        : `Reste à régler après correction : ${money(nextRemaining)}.`}
    </Alert>}
    {impact?.cash && typeof impact.cash === 'object' && <Effect title="Caisse" {...impact.cash} names={names} />}
    {impact?.bank && typeof impact.bank === 'object' && <Effect title="Banque" {...impact.bank} names={names} />}
    {impact?.bank?.account_balances?.map(account => <Typography variant="body2" key={account.account_id}>
      Solde de {displayValue('id_compte', account.account_id, names)} : {money(account.before)} → {money(account.after)}
    </Typography>)}
    {stock?.kind === 'inventory' && <Box>
      <Typography fontWeight={700}>Stock après correction</Typography>
      {Object.entries(stock.final_quantities).map(([id, quantity]) => <Typography variant="body2" key={id}>{displayValue('id_produit', id, names)} : {Number(quantity).toLocaleString('fr-FR')} unité(s)</Typography>)}
      {stock.after && <Typography variant="body2">Coût unitaire enregistré : {Number(stock.after.cout_unitaire).toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} MAD</Typography>}
    </Box>}
    {stock?.kind === 'eggs' && <Stack spacing={1}>
      <Typography fontWeight={700}>Répartition des œufs</Typography>
      {Object.entries(stock.after).map(([id, allocations]) => <Box key={id} sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
        <Typography fontWeight={600}>Vente n° {id} : {total(stock.before[id])} → {total(allocations)} œufs affectés</Typography>
        {allocations.map(row => <Typography variant="body2" key={row.id_production}>
          {displayValue('id_production', row.id_production, names)} : {row.quantite.toLocaleString('fr-FR')} œufs{row.quantite_livree > 0 ? `, dont ${row.quantite_livree} déjà fournis` : ''}
        </Typography>)}
      </Box>)}
      <Typography variant="body2" color="text.secondary">Les livraisons déjà enregistrées et la priorité des commandes sont conservées.</Typography>
    </Stack>}
    {impact?.contact_balance && <Alert severity="info">Le solde et les paiements liés seront attribués au contact choisi.</Alert>}
    {impact?.reporting_periods && <Typography variant="body2">Les opérations seront rattachées à la nouvelle date dans les états correspondants.</Typography>}
  </Stack>;
}
export default function CorrectionReview({ flow, names, transaction, onCancel }) {
  return <Stack spacing={2} aria-label="Vérification de la correction">
    <Typography component="h2" variant="h6">Vérifier la correction</Typography>
    <CorrectionImpact preview={flow.review} names={names} transaction={transaction} />
    <Divider />
    <Typography variant="body2" color="text.secondary">Les anciennes valeurs restent dans l’historique.</Typography>
    {flow.error && <Alert severity="error" role="alert">{flow.error}</Alert>}
    <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1} justifyContent="flex-end">
      <Button onClick={onCancel} disabled={flow.busy || flow.uncertain}>Annuler</Button>
      <Button onClick={flow.edit} disabled={flow.busy || flow.uncertain}>Revenir aux champs</Button>
      {flow.stale ? <Button variant="contained" onClick={flow.refresh} disabled={flow.busy}>Actualiser l’aperçu</Button>
        : <Button variant="contained" onClick={flow.confirm} disabled={flow.busy}>{flow.busy ? 'Enregistrement…' : flow.uncertain ? 'Vérifier et réessayer' : 'Confirmer la correction'}</Button>}
    </Stack>
  </Stack>;
}
