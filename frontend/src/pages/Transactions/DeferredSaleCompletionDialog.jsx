import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { get, post } from '../../services/api';
import { formatShortDate } from '../../utils/dateFormatting';

export default function DeferredSaleCompletionDialog({ open, transactionId, onClose, onCompleted }) {
  const [proposal, setProposal] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true); setProposal(null); setError(''); setStale(false);
    get(`/transactions/${transactionId}/completion`).then(data => {
      if (!cancelled) { setProposal(data); setQuantity(data.quantite_proposee ? String(data.quantite_proposee) : ''); }
    }).catch(err => { if (!cancelled) setError(err.message || 'Impossible de charger le stock réservé.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, transactionId, revision]);

  const requested = Number(quantity);
  const valid = proposal && Number.isInteger(requested) && requested > 0 && requested <= proposal.quantite_proposee;
  let remaining = valid ? requested : 0;
  const breakdown = (proposal?.repartition_stock || []).map(source => {
    const used = Math.min(remaining, source.quantite);
    remaining -= used;
    return { ...source, used };
  });
  const confirm = async () => {
    if (!valid || saving || stale) return;
    setSaving(true); setError('');
    try {
      const updated = await post(`/transactions/${transactionId}/completion`, {
        quantite: requested, quantite_couverte_attendue: proposal.quantite_couverte,
        empreinte_stock: proposal.empreinte_stock,
      });
      onCompleted(updated);
    } catch (err) {
      setError(err.message || 'Impossible de compléter cette vente.');
      // A timeout may follow a successful commit: reload before any retry.
      setStale(true);
    } finally { setSaving(false); }
  };

  return <Dialog open={open} onClose={() => !saving && onClose()} fullWidth maxWidth="sm">
    <DialogTitle>Compléter la livraison différée</DialogTitle>
    <DialogContent dividers>
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress aria-label="Chargement du stock réservé" /></Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button disabled={saving} onClick={() => setRevision(value => value + 1)}>Recharger</Button>}>{error}</Alert>}
      {proposal && <Stack spacing={2}>
        <Typography>Vente #{transactionId} · {proposal.quantite_en_attente.toLocaleString('fr-FR')} œufs restent à fournir.</Typography>
        <Alert severity={proposal.quantite_proposee ? 'info' : 'warning'}>
          {proposal.quantite_proposee ? `${proposal.quantite_proposee.toLocaleString('fr-FR')} œufs réservés disponibles pour compléter cette vente.` : 'Aucun stock réservé disponible pour le moment. Saisissez la nouvelle production, puis rechargez.'}
        </Alert>
        {!!proposal.quantite_proposee && <>
          <TextField label="Quantité à compléter" type="number" fullWidth size="small" value={quantity}
            onChange={event => setQuantity(event.target.value)} disabled={saving || stale}
            inputProps={{ min: 1, max: proposal.quantite_proposee, step: 1 }}
            error={!valid} helperText={!valid ? `Indiquez un nombre entier entre 1 et ${proposal.quantite_proposee}.` : 'Vous pouvez compléter une partie de la quantité disponible.'} />
          <Box sx={{ overflowX: 'auto' }}><Table size="small" aria-label="Prélèvements proposés pour compléter la vente">
            <TableHead><TableRow><TableCell>Production</TableCell><TableCell align="right">Réservés</TableCell><TableCell align="right">À prélever</TableCell></TableRow></TableHead>
            <TableBody>{breakdown.map(source => <TableRow key={source.id_production}>
              <TableCell>{formatShortDate(source.date_production)}</TableCell><TableCell align="right">{source.quantite.toLocaleString('fr-FR')}</TableCell><TableCell align="right">{source.used.toLocaleString('fr-FR')}</TableCell>
            </TableRow>)}</TableBody>
          </Table></Box>
          <Typography aria-live="polite" fontWeight={700}>Après confirmation : {Math.max(0, proposal.quantite_en_attente - (valid ? requested : 0)).toLocaleString('fr-FR')} œufs restent à fournir.</Typography>
        </>}
        <Typography variant="body2" color="text.secondary">Cette action complète le stock de la vente initiale. Son montant et ses paiements sont conservés.</Typography>
      </Stack>}
    </DialogContent>
    <DialogActions>
      <Button disabled={saving} onClick={onClose}>Fermer</Button>
      {proposal && !proposal.quantite_proposee && <Button onClick={() => setRevision(value => value + 1)} disabled={loading}>Recharger le stock</Button>}
      <Button variant="contained" disabled={!valid || loading || saving || stale} onClick={confirm}>
        {saving ? 'Enregistrement…' : `Confirmer${valid ? ` ${requested.toLocaleString('fr-FR')} œufs` : ''}`}
      </Button>
    </DialogActions>
  </Dialog>;
}
