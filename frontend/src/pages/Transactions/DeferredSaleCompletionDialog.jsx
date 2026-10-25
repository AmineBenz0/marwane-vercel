import { useEffect, useId, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { get, post } from '../../services/api';
import { formatShortDate } from '../../utils/dateFormatting';
import ExpandableDetails from '../../components/ExpandableDetails';

export default function DeferredSaleCompletionDialog({ open, transactionId, onClose, onCompleted }) {
  const titleId = useId();
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
  const maximum = proposal ? Math.min(proposal.quantite_proposee, proposal.quantite_en_attente) : 0;
  const valid = proposal && Number.isInteger(requested) && requested > 0 && requested <= maximum;
  let remaining = valid ? requested : 0;
  const breakdown = (proposal?.repartition_stock || []).map(source => {
    const used = Math.min(remaining, source.quantite);
    remaining -= used;
    return { ...source, used };
  }).filter(source => source.used > 0);
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

  return <Dialog open={open} aria-labelledby={titleId} onClose={() => !saving && onClose()} fullWidth maxWidth="sm">
    <DialogTitle id={titleId}>Compléter la vente #{transactionId}</DialogTitle>
    <DialogContent dividers>
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress aria-label="Chargement du stock réservé" /></Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button disabled={saving || loading} onClick={() => setRevision(value => value + 1)}>Recharger</Button>}>{error}</Alert>}
      {proposal && <Stack spacing={2}>
        {(proposal.nom_client || proposal.nom_produit || proposal.nom_batiment) && <Box>
          {proposal.nom_client && <Typography fontWeight={700}>{proposal.nom_client}</Typography>}
          <Typography variant="body2" color="text.secondary">{[proposal.nom_produit, proposal.nom_batiment].filter(Boolean).join(' · ')}</Typography>
        </Box>}
        {proposal.quantite_en_attente === 0 ? <Box><Chip label="Stock complet" color="success" size="small" /></Box> : <>
          <Stack direction="row" spacing={2} justifyContent="space-between"><Typography color="text.secondary">Reste à compléter</Typography><Typography fontWeight={700}>{proposal.quantite_en_attente.toLocaleString('fr-FR')} œufs</Typography></Stack>
          {!maximum ? <Alert severity="warning">En attente de production.</Alert> : <>
            {maximum < proposal.quantite_en_attente && <Box><Chip size="small" label={`Stock disponible : ${maximum.toLocaleString('fr-FR')}`} /></Box>}
            <TextField label="Quantité à compléter" type="number" fullWidth size="small" value={quantity}
              onChange={event => setQuantity(event.target.value)} disabled={saving || stale}
              inputProps={{ min: 1, max: maximum, step: 1 }}
              error={!valid} helperText={!valid ? `Indiquez un nombre entier entre 1 et ${maximum}.` : undefined} />
            <ExpandableDetails label="Stock à utiliser">
              <Box sx={{ overflowX: 'auto' }}><Table size="small" aria-label="Prélèvements proposés pour compléter la vente">
                <TableHead><TableRow><TableCell>Production</TableCell><TableCell align="right">Œufs à prélever</TableCell></TableRow></TableHead>
                <TableBody>{breakdown.map(source => <TableRow key={source.id_production}>
                  <TableCell>{formatShortDate(source.date_production)}</TableCell><TableCell align="right">{source.used.toLocaleString('fr-FR')}</TableCell>
                </TableRow>)}</TableBody>
              </Table></Box>
            </ExpandableDetails>
            {valid && <Typography aria-live="polite" fontWeight={700}>Après confirmation : {(proposal.quantite_en_attente - requested).toLocaleString('fr-FR')} œufs restants</Typography>}
          </>}
        </>}
      </Stack>}
    </DialogContent>
    <DialogActions>
      <Button disabled={saving} onClick={onClose}>Fermer</Button>
      {proposal?.quantite_en_attente > 0 && !maximum && <Button onClick={() => setRevision(value => value + 1)} disabled={loading}>Recharger le stock</Button>}
      {proposal?.quantite_en_attente !== 0 && <Button variant="contained" disabled={!valid || loading || saving || stale} onClick={confirm}>
        {saving ? 'Enregistrement…' : `Confirmer${valid ? ` ${requested.toLocaleString('fr-FR')} œufs` : ''}`}
      </Button>}
    </DialogActions>
  </Dialog>;
}
