import { useRef, useState } from 'react';
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { post } from '../../services/api';
import { formatMontant } from '../../utils/formatNumber';

export default function TransactionConversionDialog({ transaction, products = [], clients = [], suppliers = [], onClose, onConverted }) {
  const toPurchase = Boolean(transaction.id_client);
  const side = toPurchase ? 'achat' : 'vente';
  const contacts = (toPurchase ? suppliers : clients).filter(x => x.est_actif !== false);
  const contactId = toPurchase ? 'id_fournisseur' : 'id_client';
  const contactName = toPurchase ? 'nom_fournisseur' : 'nom_client';
  const eligibleProducts = products.filter(x => x.est_actif !== false &&
    x.usage === (toPurchase ? 'achete' : 'vendu') && !/^oeufs\s*-/i.test(x.nom_produit || ''));
  const [values, setValues] = useState({
    id_contact_cible: '', id_produit_cible: '', quantite: String(transaction.quantite),
    prix_unitaire: String(transaction.prix_unitaire),
  });
  const [review, setReview] = useState(null);
  const [confirmPayments, setConfirmPayments] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const command = useRef(null);
  const running = useRef(false);
  const update = key => event => setValues(v => ({ ...v, [key]: event.target.value }));

  const preview = async event => {
    event.preventDefault();
    if (running.current || uncertain) return;
    const quantity = Number(values.quantite);
    const price = Number(values.prix_unitaire);
    if (!values.id_contact_cible || !values.id_produit_cible || !Number.isInteger(quantity) ||
        quantity <= 0 || !Number.isFinite(price) || price <= 0) {
      setError('Choisissez le contact, le produit, une quantité entière et un prix positif.');
      return;
    }
    const request = { expected_version: transaction.row_version,
      id_contact_cible: Number(values.id_contact_cible), id_produit_cible: Number(values.id_produit_cible),
      quantite: quantity, prix_unitaire: values.prix_unitaire };
    running.current = true; setBusy(true); setError(''); setStale(false);
    try {
      const result = await post('/transactions/' + transaction.id_transaction + '/conversion/preview', request);
      command.current = { ...request, operation_id: crypto.randomUUID(),
        dependency_fingerprint: result.dependency_fingerprint,
        annuler_paiements_existants: result.paiements_a_annuler.length > 0 };
      setReview(result);
      setConfirmPayments(false);
    } catch (err) {
      setError(err.message || 'La conversion ne peut pas être vérifiée.');
    } finally { running.current = false; setBusy(false); }
  };

  const save = async () => {
    if (running.current || !command.current || stale || !review ||
        (review.paiements_a_annuler.length > 0 && !confirmPayments)) return;
    running.current = true; setBusy(true); setError('');
    try {
      const result = await post('/transactions/' + transaction.id_transaction + '/conversion/apply', command.current);
      command.current = null;
      await onConverted(result);
    } catch (err) {
      const ambiguous = !err.status || err.status >= 500;
      setUncertain(ambiguous); setStale(err.status === 409);
      setError(ambiguous
        ? 'La réponse n’a pas été reçue. Vérifiez le même enregistrement sans le doubler.'
        : err.message || 'La conversion a échoué.');
    } finally { running.current = false; setBusy(false); }
  };
  const back = () => {
    if (busy || uncertain) return;
    command.current = null; setReview(null); setError(''); setStale(false);
    setConfirmPayments(false);
  };
  const totalVoided = (review?.paiements_a_annuler || []).reduce((total, p) => total + Number(p.montant), 0);
  const targetStock = review?.stock.cible === 'aucun' ? 'sans mouvement'
    : (review?.stock.cible === 'entree' ? 'Entrée de ' : 'Sortie de ') + review?.stock.quantite_cible + ' unités';

  return <Dialog open fullWidth maxWidth="sm" aria-labelledby="conversion-title"
    onClose={() => !busy && !uncertain && onClose()} PaperProps={{ component: 'form', onSubmit: preview }}>
    <DialogTitle id="conversion-title">Convertir en {side}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {review ? <>
        <Typography>Nouvelle {side} · {review.nom_produit_cible} · {review.quantite} × {formatMontant(review.prix_unitaire)}</Typography>
        <Typography fontWeight={700}>Montant : {formatMontant(review.montant_total_cible)}</Typography>
        <Typography>Stock original : {review.stock.origine === 'aucun' ? 'sans mouvement' : 'mouvement annulé et conservé'} · Remplacement : {targetStock}</Typography>
        {review.paiements_a_annuler.length > 0 ? <>
          <Alert severity="warning">
            {review.paiements_a_annuler.length} règlement(s), soit {formatMontant(totalVoided)},
            seront annulés avec leurs mouvements de caisse ou de banque. Leur historique sera conservé.
          </Alert>
          <FormControlLabel control={<Checkbox checked={confirmPayments}
            onChange={event => setConfirmPayments(event.target.checked)} disabled={busy || uncertain} />}
            label="Confirmer l’annulation des règlements existants" />
        </> : <Typography>Aucun règlement actif à annuler.</Typography>}
        <Alert severity="info">La transaction d’origine reste consultable. La nouvelle {side} sera créée sans paiement.</Alert>
      </> : <>
        <Typography variant="body2" color="text.secondary">
          La date d’origine est conservée. Sélectionnez le contact et le produit de la nouvelle {side}.
        </Typography>
        <TextField select required fullWidth label={toPurchase ? 'Fournisseur' : 'Client'}
          value={values.id_contact_cible} onChange={update('id_contact_cible')} disabled={busy}>
          {contacts.map(row => <MenuItem key={row[contactId]} value={row[contactId]}>{row[contactName]}</MenuItem>)}
        </TextField>
        <TextField select required fullWidth label="Produit" value={values.id_produit_cible}
          onChange={update('id_produit_cible')} disabled={busy}>
          {eligibleProducts.map(row => <MenuItem key={row.id_produit} value={row.id_produit}>{row.nom_produit}</MenuItem>)}
        </TextField>
        {(!contacts.length || !eligibleProducts.length) && <Alert severity="warning">
          {!contacts.length && 'Aucun contact actif disponible. '}
          {!eligibleProducts.length && 'Aucun produit compatible hors œufs disponible.'}
        </Alert>}
        <TextField required label="Quantité" type="number" value={values.quantite}
          onChange={update('quantite')} disabled={busy} inputProps={{ min: 1, step: 1 }} />
        <TextField required label="Prix unitaire (MAD)" type="number" value={values.prix_unitaire}
          onChange={update('prix_unitaire')} disabled={busy} inputProps={{ min: 0.01, step: 0.01 }} />
      </>}
    </Stack></DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={busy || uncertain}>Annuler</Button>
      {review && !uncertain && <Button onClick={back} disabled={busy}>Revenir aux champs</Button>}
      {review ? <Button variant="contained" color="warning" onClick={save}
        disabled={busy || stale || (review.paiements_a_annuler.length > 0 && !confirmPayments)}>
        {uncertain ? 'Vérifier l’enregistrement' : 'Confirmer la conversion'}
      </Button> : <Button variant="contained" type="submit"
        disabled={busy || !contacts.length || !eligibleProducts.length}>Vérifier la conversion</Button>}
    </DialogActions>
  </Dialog>;
}
