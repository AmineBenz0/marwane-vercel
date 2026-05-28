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
});

const produitFields = [
  {
    name: 'nom_produit',
    label: 'Nom du produit acheté',
    type: 'text',
    placeholder: 'Ex. aliment, emballage, médicament...',
    required: true,
  },
  {
    name: 'est_actif',
    label: 'Produit actif',
    type: 'switch',
    helperText: "Un produit inactif reste dans l'historique, mais n'apparaît plus dans les nouveaux achats.",
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
      }
    : {
        nom_produit: '',
        est_actif: true,
      };

  const handleSubmit = async (data) => {
    await onSubmit({
      ...data,
      type_produit: 'matiere_premiere',
      pour_clients: false,
      pour_fournisseurs: true,
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
      title={isEditing ? 'Modifier le produit acheté' : 'Créer un produit acheté'}
      submitLabel={isEditing ? 'Modifier' : 'Créer'}
      loading={loading}
      errorMessage={errorMessage}
    />
  );
}

export default ProduitForm;
