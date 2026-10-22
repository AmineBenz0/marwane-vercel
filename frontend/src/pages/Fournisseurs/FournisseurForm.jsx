import * as yup from 'yup';
import ModalForm from '../../components/ModalForm/ModalForm';

export const fournisseurValidationSchema = yup.object().shape({
  nom_fournisseur: yup
    .string()
    .required('Le nom du fournisseur est requis')
    .min(1, 'Le nom doit contenir au moins 1 caractère')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères')
    .trim(),
  mode_reglement_prefere: yup
    .string()
    .oneOf(['caisse', 'banque'], 'Choisissez un mode de règlement')
    .required('Le mode de règlement préféré est requis'),
});

export const fournisseurFields = [
  {
    name: 'nom_fournisseur',
    label: 'Nom du fournisseur',
    type: 'text',
    placeholder: 'Ex. Coop Agadir',
    required: true,
    helperText: "Utilisez le nom que l'équipe reconnaît au quotidien.",
  },
  {
    name: 'mode_reglement_prefere',
    label: 'Source de règlement préférée',
    type: 'select',
    required: true,
    options: [
      { value: 'caisse', label: 'Caisse' },
      { value: 'banque', label: 'Compte bancaire' },
    ],
    helperText: 'Les paiements débitent cette source, quel que soit le type de paiement choisi.',
  },
];

function FournisseurForm({
  open = false,
  onClose,
  onSubmit,
  initialValues = null,
  loading = false,
  errorMessage = null,
  editingFournisseur = null,
}) {
  const defaultInitialValues = {
    nom_fournisseur: editingFournisseur?.nom_fournisseur || '',
    mode_reglement_prefere: editingFournisseur?.mode_reglement_prefere || '',
  };

  const formInitialValues = initialValues || defaultInitialValues;

  const handleSubmit = async (data) => {
    await onSubmit({
      ...data,
      est_actif: true,
    });
  };

  return (
    <ModalForm
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      initialValues={formInitialValues}
      validationSchema={fournisseurValidationSchema}
      fields={fournisseurFields}
      title={editingFournisseur ? 'Modifier ce fournisseur' : 'Nouveau fournisseur'}
      submitLabel={editingFournisseur ? 'Enregistrer' : 'Créer le fournisseur'}
      loading={loading}
      errorMessage={errorMessage}
    />
  );
}

export default FournisseurForm;
