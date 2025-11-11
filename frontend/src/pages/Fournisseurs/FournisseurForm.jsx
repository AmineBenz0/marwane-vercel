/**
 * Composant FournisseurForm.
 * 
 * Formulaire réutilisable pour créer et éditer un fournisseur.
 * Ce composant encapsule la logique du formulaire et peut être utilisé
 * dans différents contextes (modal, page dédiée, etc.).
 */

import React from 'react';
import * as yup from 'yup';
import ModalForm from '../../components/ModalForm/ModalForm';

/**
 * Schéma de validation Yup pour le formulaire fournisseur.
 */
export const fournisseurValidationSchema = yup.object().shape({
  nom_fournisseur: yup
    .string()
    .required('Le nom du fournisseur est requis')
    .min(1, 'Le nom doit contenir au moins 1 caractère')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères')
    .trim(),
  est_actif: yup.boolean().required('Le statut est requis'),
});

/**
 * Configuration des champs du formulaire.
 */
export const fournisseurFields = [
  {
    name: 'nom_fournisseur',
    label: 'Nom du fournisseur',
    type: 'text',
    placeholder: 'Entrez le nom du fournisseur',
    required: true,
  },
  {
    name: 'est_actif',
    label: 'Actif',
    type: 'switch',
  },
];

/**
 * Composant FournisseurForm.
 * 
 * @param {boolean} open - Contrôle l'ouverture/fermeture de la modal
 * @param {Function} onClose - Callback appelé lors de la fermeture de la modal
 * @param {Function} onSubmit - Callback appelé lors de la soumission du formulaire
 * @param {object} initialValues - Valeurs initiales pour le formulaire (pour l'édition)
 * @param {boolean} loading - Indique si la soumission est en cours
 * @param {string} errorMessage - Message d'erreur serveur à afficher
 * @param {object} editingFournisseur - Fournisseur en cours d'édition (null pour création)
 */
function FournisseurForm({
  open = false,
  onClose,
  onSubmit,
  initialValues = null,
  loading = false,
  errorMessage = null,
  editingFournisseur = null,
}) {
  // Déterminer les valeurs initiales
  const defaultInitialValues = editingFournisseur
    ? {
        nom_fournisseur: editingFournisseur.nom_fournisseur || '',
        est_actif: editingFournisseur.est_actif ?? true,
      }
    : {
        nom_fournisseur: '',
        est_actif: true,
      };

  const formInitialValues = initialValues || defaultInitialValues;

  return (
    <ModalForm
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      initialValues={formInitialValues}
      validationSchema={fournisseurValidationSchema}
      fields={fournisseurFields}
      title={editingFournisseur ? 'Modifier le fournisseur' : 'Créer un nouveau fournisseur'}
      submitLabel={editingFournisseur ? 'Modifier' : 'Créer'}
      loading={loading}
      errorMessage={errorMessage}
    />
  );
}

export default FournisseurForm;

