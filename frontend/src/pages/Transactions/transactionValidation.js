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
  notes: yup.string().nullable(),
  id_paiement: optionalNumber(),
});

const lineSchema = yup.object().shape({
  id_produit: yup
    .number()
    .typeError('Le produit est requis')
    .required('Le produit est requis')
    .positive('Le produit est requis'),
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
    .of(lineSchema)
    .min(1, 'Au moins une ligne est requise')
    .required('Au moins une ligne est requise'),
});
