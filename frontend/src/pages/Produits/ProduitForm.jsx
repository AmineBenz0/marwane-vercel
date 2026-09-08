import React from 'react';
import * as yup from 'yup';
import ModalForm from '../../components/ModalForm/ModalForm';

const produitValidationSchema = yup.object().shape({
  nom_produit: yup
    .string()
    .required('Le nom du produit est requis')
    .min(1, 'Le nom doit contenir au moins 1 caractère')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères')
    .trim(),
  est_actif: yup.boolean().required('Le statut est requis'),
  type_produit: yup.string().oneOf(['matiere_premiere', 'produit_fini', 'service']).required('Le type est requis'),
});

const produitFields = [
  {
    name: 'nom_produit',
    label: 'Nom du produit',
    type: 'text',
    placeholder: 'Ex. aliment, emballage, médicament...',
    required: true,
  },
  {
    name: 'type_produit',
    label: 'Type de produit',
    type: 'select',
    required: true,
    options: [
      { value: 'matiere_premiere', label: 'Matière première' },
      { value: 'produit_fini', label: 'Produit fini' },
      { value: 'service', label: 'Service' },
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
        type_produit: initialValues.type_produit || 'matiere_premiere',
      }
    : {
        nom_produit: '',
        est_actif: true,
        type_produit: 'matiere_premiere',
      };

  const handleSubmit = async (data) => {
    const type = data.type_produit || 'matiere_premiere';
    await onSubmit({
      ...data,
      type_produit: type,
      pour_clients: type !== 'matiere_premiere',
      pour_fournisseurs: type !== 'produit_fini',
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
