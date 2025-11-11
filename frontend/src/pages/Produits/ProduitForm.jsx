/**
 * Composant ProduitForm.
 * 
 * Formulaire pour créer et éditer des produits.
 * Utilise ModalForm avec validation en temps réel.
 * 
 * Ce composant encapsule la configuration spécifique aux produits (schéma de validation,
 * champs du formulaire) et délègue l'affichage et la gestion à ModalForm.
 * 
 * Le parent est responsable de :
 * - Gérer les appels API (POST pour création, PUT pour édition)
 * - Gérer l'état de chargement
 * - Gérer les erreurs (y compris l'unicité du nom_produit)
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
 * Schéma de validation Yup pour le formulaire produit.
 * 
 * Note: L'unicité du nom_produit est validée côté backend.
 * Le frontend valide uniquement que le champ est requis et respecte les contraintes de longueur.
 */
const produitValidationSchema = yup.object().shape({
  nom_produit: yup
    .string()
    .required('Le nom du produit est requis')
    .min(1, 'Le nom doit contenir au moins 1 caractère')
    .max(255, 'Le nom ne peut pas dépasser 255 caractères')
    .trim(),
  est_actif: yup.boolean().required('Le statut est requis'),
});

/**
 * Configuration des champs du formulaire.
 */
const produitFields = [
  {
    name: 'nom_produit',
    label: 'Nom du produit',
    type: 'text',
    placeholder: 'Entrez le nom du produit',
    required: true,
  },
  {
    name: 'est_actif',
    label: 'Actif',
    type: 'switch', // Utilise un Switch de MUI
  },
];

/**
 * Composant ProduitForm.
 * 
 * @param {object} props - Les propriétés du composant
 * @param {boolean} props.open - Contrôle l'ouverture/fermeture de la modal
 * @param {Function} props.onClose - Callback appelé lors de la fermeture de la modal
 * @param {Function} props.onSubmit - Callback appelé lors de la soumission du formulaire (reçoit les données validées)
 * @param {object} props.initialValues - Valeurs initiales pour le formulaire (pour l'édition)
 * @param {boolean} props.loading - Indique si la soumission est en cours
 * @param {string} props.errorMessage - Message d'erreur serveur à afficher
 */
function ProduitForm({
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
  const isEditing = initialValues && initialValues.id_produit;

  /**
   * Valeurs initiales par défaut pour le formulaire.
   */
  const defaultInitialValues = isEditing
    ? {
        nom_produit: initialValues.nom_produit || '',
        est_actif: initialValues.est_actif !== undefined ? initialValues.est_actif : true,
      }
    : {
        nom_produit: '',
        est_actif: true,
      };

  return (
    <ModalForm
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      initialValues={defaultInitialValues}
      validationSchema={produitValidationSchema}
      fields={produitFields}
      title={isEditing ? 'Modifier le produit' : 'Créer un nouveau produit'}
      submitLabel={isEditing ? 'Modifier' : 'Créer'}
      loading={loading}
      errorMessage={errorMessage}
    />
  );
}

export default ProduitForm;

