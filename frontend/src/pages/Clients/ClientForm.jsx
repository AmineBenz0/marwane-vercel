/**
 * Composant ClientForm.
 * 
 * Formulaire pour créer et éditer des clients.
 * Utilise ModalForm avec validation en temps réel.
 * 
 * Ce composant encapsule la configuration spécifique aux clients (schéma de validation,
 * champs du formulaire) et délègue l'affichage et la gestion à ModalForm.
 * 
 * Le parent est responsable de :
 * - Gérer les appels API (POST pour création, PUT pour édition)
 * - Gérer l'état de chargement
 * - Gérer les erreurs
 * - Rafraîchir la liste après succès
 * 
 * @param {boolean} open - Contrôle l'ouverture/fermeture de la modal
 * @param {Function} onClose - Callback appelé lors de la fermeture de la modal
 * @param {Function} onSubmit - Callback appelé lors de la soumission du formulaire (reçoit les données validées)
 * @param {object} initialValues - Valeurs initiales pour le formulaire (pour l'édition)
 * @param {boolean} loading - Indique si la soumission est en cours
 * @param {string} errorMessage - Message d'erreur serveur à afficher
 */

import React from 'react';
import * as yup from 'yup';
import ModalForm from '../../components/ModalForm/ModalForm';

/**
 * Schéma de validation Yup pour le formulaire client.
 */
const clientValidationSchema = yup.object().shape({
  nom_client: yup
    .string()
    .required('Le nom du client est requis')
    .min(1, 'Le nom doit contenir au moins 1 caractère')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères')
    .trim(),
  est_actif: yup.boolean().required('Le statut est requis'),
});

/**
 * Configuration des champs du formulaire.
 */
const clientFields = [
  {
    name: 'nom_client',
    label: 'Nom du client',
    type: 'text',
    placeholder: 'Entrez le nom du client',
    required: true,
  },
  {
    name: 'est_actif',
    label: 'Actif',
    type: 'switch', // Utilise un Switch de MUI
  },
];

/**
 * Composant ClientForm.
 * 
 * @param {object} props - Les propriétés du composant
 * @param {boolean} props.open - Contrôle l'ouverture/fermeture de la modal
 * @param {Function} props.onClose - Callback appelé lors de la fermeture de la modal
 * @param {Function} props.onSubmit - Callback appelé lors de la soumission du formulaire (reçoit les données validées)
 * @param {object} props.initialValues - Valeurs initiales pour le formulaire (pour l'édition)
 * @param {boolean} props.loading - Indique si la soumission est en cours
 * @param {string} props.errorMessage - Message d'erreur serveur à afficher
 */
function ClientForm({
  open = false,
  onClose,
  onSubmit,
  initialValues = {},
  loading = false,
  errorMessage = null,
}) {
  /**
   * Détermine si on est en mode édition ou création.
   */
  const isEditing = initialValues && initialValues.id_client;

  /**
   * Valeurs initiales par défaut pour le formulaire.
   */
  const defaultInitialValues = isEditing
    ? {
        nom_client: initialValues.nom_client || '',
        est_actif: initialValues.est_actif !== undefined ? initialValues.est_actif : true,
      }
    : {
        nom_client: '',
        est_actif: true,
      };

  return (
    <ModalForm
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      initialValues={defaultInitialValues}
      validationSchema={clientValidationSchema}
      fields={clientFields}
      title={isEditing ? 'Modifier le client' : 'Créer un nouveau client'}
      submitLabel={isEditing ? 'Modifier' : 'Créer'}
      loading={loading}
      errorMessage={errorMessage}
    />
  );
}

export default ClientForm;

