import * as yup from 'yup';
import ModalForm from '../../components/ModalForm/ModalForm';
import { getProductUsage } from '../../utils/productUsage';

const produitValidationSchema = yup.object().shape({
  nom_produit: yup
    .string()
    .required('Le nom du produit est requis')
    .min(1, 'Le nom doit contenir au moins 1 caractère')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères')
    .trim(),
  est_actif: yup.boolean().required('Le statut est requis'),
  usage: yup.string().oneOf(['vendu', 'achete']).required('Choisissez vendu ou acheté'),
});

const produitFields = [
  {
    name: 'nom_produit',
    label: 'Nom du produit',
    type: 'text',
    placeholder: 'Ex. aliment, emballage, œufs...',
    required: true,
  },
  {
    name: 'usage',
    label: 'Utilisation',
    type: 'select',
    required: true,
    options: [
      { value: 'vendu', label: 'Vendu — transaction client' },
      { value: 'achete', label: 'Acheté — transaction fournisseur' },
    ],
  },
];

function ProduitForm({
  open = false,
  onClose,
  onSubmit,
  initialValues = {},
  loading = false,
  errorMessage = null,
}) {
  const isEditing = initialValues && initialValues.id_produit;

  const defaultInitialValues = isEditing
    ? {
        nom_produit: initialValues.nom_produit || '',
        est_actif:
          initialValues.est_actif !== undefined ? initialValues.est_actif : true,
        usage: getProductUsage(initialValues),
      }
    : {
        nom_produit: '',
        est_actif: true,
        usage: 'achete',
      };

  const handleSubmit = async (data) => {
    await onSubmit({
      nom_produit: data.nom_produit,
      est_actif: data.est_actif,
      usage: data.usage,
    });
  };

  return (
    <ModalForm
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      initialValues={defaultInitialValues}
      validationSchema={produitValidationSchema}
      fields={produitFields}
      title={isEditing ? 'Modifier le produit' : 'Créer un produit'}
      submitLabel={isEditing ? 'Modifier' : 'Créer'}
      loading={loading}
      errorMessage={errorMessage}
    />
  );
}

export default ProduitForm;
