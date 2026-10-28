import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import DateField from '../../utils/DateField';
import { formatShortDate } from '../../utils/dateFormatting';
import { formatMontant } from '../../utils/formatNumber';

/** Edit existing records without rebuilding payments or selecting stock again. */
export default function TransactionEditForm({ open, onClose, onSubmit, initialValues, loading = false, errorMessage }) {
  const navigate = useNavigate();
  const transaction = initialValues;
  const hasHistory = Boolean(transaction.paiements?.length);
  const inactive = transaction.est_actif === false;
  const financialLocked = hasHistory || inactive;
  const originalDueDate = transaction.date_echeance?.slice(0, 10) || '';
  const [dueDate, setDueDate] = useState(originalDueDate);
  const [quantity, setQuantity] = useState(String(transaction.quantite));
  const [price, setPrice] = useState(String(transaction.prix_unitaire));
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setDueDate(originalDueDate);
    setQuantity(String(transaction.quantite));
    setPrice(String(transaction.prix_unitaire));
    setError('');
  }, [open, transaction.id_transaction, originalDueDate, transaction.quantite, transaction.prix_unitaire]);

  const minimumQuantity = Math.max(1, Number(transaction.quantite_couverte || 0) + Number(transaction.quantite_annulee || 0));
  const changes = {};
  if (dueDate !== originalDueDate) changes.date_echeance = dueDate || null;
  if (!financialLocked && Number(quantity) !== Number(transaction.quantite)) changes.quantite = Number(quantity);
  if (!financialLocked && Number(price) !== Number(transaction.prix_unitaire)) changes.prix_unitaire = Number(price);

  const save = async event => {
    event.preventDefault();
    if (loading || inactive || !Object.keys(changes).length) return;
    if (dueDate && dueDate < transaction.date_transaction.slice(0, 10)) {
      setError('La date d’échéance ne peut pas précéder la transaction.');
      return;
    }
    if (!financialLocked && (!Number.isInteger(Number(quantity)) || Number(quantity) < minimumQuantity || !Number.isFinite(Number(price)) || Number(price) <= 0)) {
      setError(`Saisissez une quantité entière d’au moins ${minimumQuantity} et un prix positif.`);
      return;
    }
    setError('');
    try { await onSubmit(changes); }
    catch (err) { setError(err?.message || 'La modification n’a pas pu être enregistrée.'); }
  };

  return <Dialog open={open} onClose={() => !loading && onClose()} fullWidth maxWidth="sm"
    PaperProps={{ component: 'form', onSubmit: save }} aria-labelledby="transaction-edit-title">
    <DialogTitle id="transaction-edit-title">Modifier la transaction n° {transaction.id_transaction}</DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Alert severity="info">{inactive
          ? 'Cette transaction est annulée. Réactivez-la depuis son détail avant de la modifier.'
          : hasHistory
            ? 'Cette transaction possède un historique de paiement, même si les paiements ont été annulés. Seule la date d’échéance peut être modifiée ici. Pour corriger la quantité, le prix, le client ou le produit, annulez la transaction puis créez-en une nouvelle.'
            : 'Pour cette livraison différée, vous pouvez modifier la quantité, le prix et l’échéance. Le client, le produit, l’origine du stock et la date de vente sont fixes. La date de livraison se modifie depuis le détail de la vente.'}</Alert>
        {(error || errorMessage) && <Alert severity="error">{error || errorMessage}</Alert>}
        <Typography variant="body2" color="text.secondary">
          {transaction.id_client ? 'Vente' : 'Achat'} du {formatShortDate(transaction.date_transaction)}
          {transaction.nom_batiment_source && ` · ${transaction.nom_batiment_source}`}
        </Typography>
        <TextField label="Quantité" type="number" value={quantity} onChange={event => setQuantity(event.target.value)}
          InputProps={{ readOnly: financialLocked }} disabled={loading} required inputProps={{ min: minimumQuantity, step: 1 }}
          helperText={!financialLocked ? `Minimum : ${minimumQuantity.toLocaleString('fr-FR')} (quantité déjà affectée ou clôturée incluse)` : 'Quantité enregistrée · non modifiable'} />
        <TextField label="Prix unitaire (MAD)" type="number" value={price} onChange={event => setPrice(event.target.value)}
          InputProps={{ readOnly: financialLocked }} disabled={loading} required inputProps={{ min: 0, step: 'any' }} />
        <Typography fontWeight={700}>Montant total : {formatMontant(financialLocked ? transaction.montant_total : Number(quantity) * Number(price), { useCompactNotation: false })}</Typography>
        <DateField label="Date d’échéance du paiement (optionnel)" value={dueDate} onChange={event => setDueDate(event.target.value)}
          disabled={loading || inactive} fullWidth helperText="Date limite pour le paiement" />
        <Button onClick={() => navigate(`/transactions/${transaction.id_transaction}`)} disabled={loading}>Ouvrir le détail et les actions</Button>
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={loading}>Annuler</Button>
      <Button type="submit" variant="contained" disabled={loading || inactive || !Object.keys(changes).length}>{loading ? 'Enregistrement…' : 'Enregistrer'}</Button>
    </DialogActions>
  </Dialog>;
}
