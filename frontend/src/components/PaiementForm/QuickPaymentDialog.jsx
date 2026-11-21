import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useForm, useFieldArray } from 'react-hook-form';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent } from '@mui/material';
import { get, post } from '../../services/api';
import { formatMontant } from '../../utils/formatNumber';
import DialogTitleWithClose from '../DialogTitleWithClose';
import MultiPaiementForm from './MultiPaiementForm';
import { buildPaymentBatch } from './paymentBatch';

const owed = (item) => Math.max(0, Number(item?.montant_du ?? item?.montant_restant ?? 0));

/**
 * Add one or more payments to a transaction from a list (À payer / À encaisser), with the same
 * form as the transaction page: Espèces, Chèque, Virement or Lettre de crédit, and the fields
 * each one needs (cheque details, transfer reference, LC, supplier cash/bank source).
 */
export default function QuickPaymentDialog({ item, open, onClose, onSaved }) {
  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { paiements: [] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'paiements' });
  const [availableLcs, setAvailableLcs] = useState([]);
  const [loadingLcs, setLoadingLcs] = useState(false);
  const [supplierSource, setSupplierSource] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !item) return undefined;
    let active = true;
    reset({ paiements: [] });
    setError('');
    setReady(false);
    setLoadingLcs(true);
    const params = item.id_client ? { id_client: item.id_client } : { id_fournisseur: item.id_fournisseur };
    Promise.all([
      get('/lettres-credit/disponibles', { params }).catch(() => []),
      // A supplier is paid from the cash box or the bank, as set on the supplier.
      item.id_fournisseur ? get(`/fournisseurs/${item.id_fournisseur}`).catch(() => null) : Promise.resolve(null),
    ]).then(([lcs, supplier]) => {
      if (!active) return;
      setAvailableLcs(lcs || []);
      setSupplierSource(supplier?.mode_reglement_prefere || null);
      setReady(true);
    }).finally(() => { if (active) setLoadingLcs(false); });
    return () => { active = false; };
  }, [open, item, reset]);

  const submit = async (data) => {
    setError('');
    const paiements = (data.paiements || []).filter((p) => Number(p.montant) > 0);
    if (!paiements.length) {
      setError('Indiquez un montant supérieur à zéro.');
      return;
    }
    if (paiements.some((p) => p.type_paiement === 'lc' && !p.id_lc)) {
      setError('Choisissez la lettre de crédit utilisée.');
      return;
    }
    try {
      await post('/paiements/batch', buildPaymentBatch(item.id_transaction, paiements));
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Le paiement n’a pas pu être enregistré.');
    }
  };

  const party = item?.client_nom || item?.fournisseur_nom;
  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} fullWidth maxWidth="md">
      <form onSubmit={handleSubmit(submit)} noValidate>
        <DialogTitleWithClose onClose={onClose} disabled={isSubmitting}
          subtitle={item ? `${party ? `${party} · ` : ''}Transaction n° ${item.id_transaction} · reste ${formatMontant(owed(item), { useCompactNotation: false, minimumFractionDigits: 2 })}` : null}>
          Ajouter un paiement
        </DialogTitleWithClose>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {open && ready && item && (
              <MultiPaiementForm
                supplierSource={supplierSource}
                transaction={item}
                fields={fields}
                append={append}
                remove={remove}
                register={register}
                errors={errors}
                watch={watch}
                setValue={setValue}
                availableLcs={availableLcs}
                loadingLcs={loadingLcs}
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={onClose} disabled={isSubmitting}>Annuler</Button>
          <Button type="submit" variant="contained" disabled={isSubmitting || !ready}>
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

QuickPaymentDialog.propTypes = {
  item: PropTypes.shape({
    id_transaction: PropTypes.number,
    id_client: PropTypes.number,
    id_fournisseur: PropTypes.number,
    client_nom: PropTypes.string,
    fournisseur_nom: PropTypes.string,
    montant_du: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    montant_restant: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func,
};
