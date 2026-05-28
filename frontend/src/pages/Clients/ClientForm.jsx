import React from 'react';
import * as yup from 'yup';
import ModalForm from '../../components/ModalForm/ModalForm';

const clientValidationSchema = yup.object().shape({
  nom_client: yup
    .string()
    .required('Le nom du client est requis')
    .min(1, 'Le nom doit contenir au moins 1 caractère')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères')
    .trim(),
});

const clientFields = [
  {
    name: 'nom_client',
    label: 'Nom du client',
    type: 'text',
    placeholder: 'Ex. Marché central',
    required: true,
    helperText: "Utilisez le nom que l'équipe reconnaît au quotidien.",
  },
];

function ClientForm({
  open = false,
  onClose,
  onSubmit,
  initialValues = {},
  loading = false,
  errorMessage = null,
}) {
  const isEditing = initialValues && initialValues.id_client;

  const defaultInitialValues = {
    nom_client: initialValues?.nom_client || '',
  };

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
      initialValues={defaultInitialValues}
      validationSchema={clientValidationSchema}
      fields={clientFields}
      title={isEditing ? 'Modifier ce client' : 'Nouveau client'}
      submitLabel={isEditing ? 'Enregistrer' : 'Créer le client'}
      loading={loading}
      errorMessage={errorMessage}
    />
  );
}

export default ClientForm;
