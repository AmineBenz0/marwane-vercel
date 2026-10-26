import { saleStockSummary } from './saleStockSummary';
import * as yup from 'yup';

const optionalNumber = () => yup
  .number()
  .nullable()
  .transform((value, originalValue) => (
    originalValue === '' || originalValue === null || originalValue === undefined
      ? null
      : value
  ));

const paymentSchema = yup.object().shape({
  date: yup.string().required('La date est requise'),
  montant: yup
    .number()
    .typeError('Le montant doit être un nombre')
    .required('Le montant est requis')
    .positive('Le montant doit être positif')
    .transform((value, originalValue) => (
      originalValue === '' || originalValue === null || originalValue === undefined
        ? undefined
        : value
    )),
  type: yup
    .string()
    .required('Le type est requis')
    .oneOf(['cash', 'cheque', 'virement', 'carte', 'compensation', 'lc', 'autre']),
  numero_cheque: yup.string().nullable(),
  banque: yup.string().nullable(),
  reference: yup.string().nullable(),
  id_lc: optionalNumber().when('type', {
    is: 'lc',
    then: (schema) => schema.required('Veuillez sélectionner une LC').positive(),
  }),
  source_reglement: yup.string().nullable().oneOf(['caisse', 'banque', null]),
  id_compte: optionalNumber().when(['source_reglement', 'type', 'id_paiement'], {
    is: (source, type, idPaiement) => !idPaiement && (source === 'banque' || (!source && type === 'virement')),
    then: (schema) => schema.required('Veuillez sélectionner un compte bancaire').positive(),
  }),
  notes: yup.string().nullable(),
  id_paiement: optionalNumber(),
});

const lineSchema = yup.object().shape({
  id_produit: optionalNumber(),
  id_production: optionalNumber(),
  date_production: yup.string().nullable(),
  source_ready: yup.boolean(),
  source_available: optionalNumber(),
  source_group: yup.string().nullable(),
  est_promesse: yup.boolean().default(false),
  date_livraison_prevue: yup.string().nullable().when('est_promesse', {
    is: true,
    then: (schema) => schema.required('La date prévue est requise').test(
      'date-promesse', 'La date prévue ne peut pas précéder la transaction',
      function(value) {
        const saleDate = this.from?.find(entry => entry.value?.date_transaction)?.value.date_transaction;
        return !value || !saleDate || value >= saleDate;
      },
    ),
    otherwise: (schema) => schema.strip(),
  }),
  id_batiment: optionalNumber(),
  quantite: yup
    .number()
    .typeError('La quantité doit être un nombre')
    .required('La quantité est requise')
    .positive('La quantité doit être supérieure à 0')
    .integer('La quantité doit être un nombre entier')
    .transform((value, originalValue) => (
      originalValue === '' || originalValue === null || originalValue === undefined
        ? undefined
        : value
    )),
  prix_unitaire: yup
    .number()
    .typeError('Le prix unitaire doit être un nombre')
    .required('Le prix unitaire est requis')
    .positive('Le prix unitaire doit être supérieur à 0')
    .transform((value, originalValue) => (
      originalValue === '' || originalValue === null || originalValue === undefined
        ? undefined
        : value
    )),
  ajouter_paiement: yup.boolean().default(false),
  paiements: yup.array().of(paymentSchema).when('ajouter_paiement', {
    is: true,
    then: (schema) => schema.required('Ajoutez au moins un paiement').min(1, 'Ajoutez au moins un paiement'),
    // Hidden payment values should not block submission or leak into the payload.
    otherwise: (schema) => schema.strip(),
  }),
});

export const transactionValidationSchema = yup.object().shape({
  date_transaction: yup
    .string()
    .required('La date de transaction est requise')
    .matches(/^\d{4}-\d{2}-\d{2}$/, 'La date doit être au format YYYY-MM-DD'),
  date_echeance: yup
    .string()
    .nullable()
    .transform((value, originalValue) => (
      originalValue === '' || originalValue === null || originalValue === undefined
        ? null
        : value
    ))
    .matches(/^\d{4}-\d{2}-\d{2}$/, 'La date doit être au format YYYY-MM-DD')
    .test('date-apres-transaction', 'La date d’échéance doit être après la date de transaction', function(value) {
      if (!value) return true;
      const dateTransaction = this.parent.date_transaction;
      if (!dateTransaction) return true;
      return new Date(value) >= new Date(dateTransaction);
    }),
  type_entite: yup
    .string()
    .required('Vous devez sélectionner un client ou un fournisseur')
    .oneOf(['client', 'fournisseur'], 'Vous devez sélectionner un client ou un fournisseur'),
  id_client: optionalNumber().when('type_entite', {
    is: 'client',
    then: (schema) => schema.required('Le client est requis').positive('Le client est requis'),
  }),
  id_fournisseur: optionalNumber().when('type_entite', {
    is: 'fournisseur',
    then: (schema) => schema.required('Le fournisseur est requis').positive('Le fournisseur est requis'),
  }),
  lignes: yup
    .array()
    .when('type_entite', {
      is: 'client',
      then: (schema) => schema.of(lineSchema.shape({
        id_batiment: optionalNumber().required('Le bâtiment source est requis').positive(),
        id_produit: optionalNumber().required('Choisissez le type d’œufs').positive(),
        date_production: yup.string().nullable(),
        id_production: optionalNumber().when('est_promesse', {
          is: false,
          then: (field) => field.required('Choisissez le type d’œufs').positive(),
          otherwise: (field) => field.nullable(),
        }),
        source_ready: yup.boolean().oneOf([true], 'Chargez le stock disponible'),
      })),
      otherwise: (schema) => schema.of(lineSchema.shape({
        id_produit: optionalNumber().required('Le produit est requis').positive('Le produit est requis'),
      })),
    })
    .test('production-stock', 'Stock de production insuffisant', function(lines) {
      if (this.parent.type_entite !== 'client') return true;
      for (let i = 0; i < (lines || []).length; i += 1) {
        const line = lines[i];
        if (!line.est_promesse && line.date_production && line.date_production > this.parent.date_transaction) return this.createError({
          path: `lignes.${i}.date_production`, message: 'La vente ne peut pas précéder la production',
        });
        const stock = saleStockSummary(line, i, lines);
        if (!line.est_promesse && line.source_available != null && stock.pending > 0) return this.createError({
          path: `lignes.${i}.quantite`, message: 'La quantité dépasse le stock disponible. Choisissez la livraison différée pour fournir le reste.',
        });
      }
      return true;
    })
    .min(1, 'Au moins une ligne est requise')
    .required('Au moins une ligne est requise'),
});
