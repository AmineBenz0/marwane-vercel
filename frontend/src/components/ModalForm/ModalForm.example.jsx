/**
 * Exemple d'utilisation du composant ModalForm.
 * 
 * Ce fichier montre comment utiliser ModalForm pour créer et éditer des entités.
 * Il peut être utilisé comme référence lors de l'implémentation des pages CRUD.
 */

import React, { useState } from 'react';
import * as yup from 'yup';
import ModalForm from './ModalForm';
import { Button } from '@mui/material';
import { Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';
import { post, put } from '../../services/api';

/**
 * Exemple : Formulaire pour créer/éditer un client.
 */
function ClientFormExample() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [editingClient, setEditingClient] = useState(null);

  // Schéma de validation Yup
  const clientValidationSchema = yup.object().shape({
    nom_client: yup
      .string()
      .required('Le nom du client est requis')
      .min(2, 'Le nom doit contenir au moins 2 caractères')
      .max(100, 'Le nom ne peut pas dépasser 100 caractères'),
    est_actif: yup
      .boolean()
      .required('Le statut est requis'),
  });

  // Configuration des champs du formulaire
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
   * Gère l'ouverture de la modal pour créer un nouveau client.
   */
  const handleCreate = () => {
    setEditingClient(null);
    setErrorMessage(null);
    setOpen(true);
  };

  /**
   * Gère l'ouverture de la modal pour éditer un client existant.
   */
  const handleEdit = (client) => {
    setEditingClient(client);
    setErrorMessage(null);
    setOpen(true);
  };

  /**
   * Gère la soumission du formulaire.
   */
  const handleSubmit = async (data) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      if (editingClient) {
        // Mode édition : PUT
        await put(`/clients/${editingClient.id_client}`, data);
        console.log('Client modifié avec succès');
      } else {
        // Mode création : POST
        await post('/clients', data);
        console.log('Client créé avec succès');
      }

      // Fermer la modal et rafraîchir la liste
      setOpen(false);
      // TODO: Rafraîchir la liste des clients
    } catch (error) {
      console.error('Erreur lors de la soumission:', error);
      setErrorMessage(
        error?.message || 'Une erreur est survenue lors de l\'enregistrement'
      );
      throw error; // Re-throw pour que ModalForm puisse gérer les erreurs de validation
    } finally {
      setLoading(false);
    }
  };

  /**
   * Gère la fermeture de la modal.
   */
  const handleClose = () => {
    if (!loading) {
      setOpen(false);
      setEditingClient(null);
      setErrorMessage(null);
    }
  };

  return (
    <>
      <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={handleCreate}
        sx={{ mb: 2 }}
      >
        Créer un client
      </Button>

      <Button
        variant="outlined"
        startIcon={<EditIcon />}
        onClick={() => handleEdit({ id_client: 1, nom_client: 'Client Test', est_actif: true })}
        sx={{ mb: 2, ml: 2 }}
      >
        Éditer un client (exemple)
      </Button>

      <ModalForm
        open={open}
        onClose={handleClose}
        onSubmit={handleSubmit}
        initialValues={editingClient || {}}
        validationSchema={clientValidationSchema}
        fields={clientFields}
        title={editingClient ? 'Modifier le client' : 'Créer un nouveau client'}
        submitLabel={editingClient ? 'Modifier' : 'Créer'}
        loading={loading}
        errorMessage={errorMessage}
      />
    </>
  );
}

/**
 * Exemple : Formulaire pour créer/éditer un fournisseur.
 */
function FournisseurFormExample() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingFournisseur, setEditingFournisseur] = useState(null);

  // Schéma de validation Yup
  const fournisseurValidationSchema = yup.object().shape({
    nom_fournisseur: yup
      .string()
      .required('Le nom du fournisseur est requis')
      .min(2, 'Le nom doit contenir au moins 2 caractères')
      .max(100, 'Le nom ne peut pas dépasser 100 caractères'),
  });

  // Configuration des champs
  const fournisseurFields = [
    {
      name: 'nom_fournisseur',
      label: 'Nom du fournisseur',
      type: 'text',
      placeholder: 'Entrez le nom du fournisseur',
      required: true,
    },
  ];

  return (
    <>
      <Button variant="contained" onClick={() => setOpen(true)}>
        Créer un fournisseur
      </Button>

      <ModalForm
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={handleSubmit}
        initialValues={editingFournisseur || {}}
        validationSchema={fournisseurValidationSchema}
        fields={fournisseurFields}
        title="Créer un fournisseur"
        loading={loading}
      />
    </>
  );
}

/**
 * Exemple : Formulaire avec différents types de champs.
 */
function AdvancedFormExample() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Schéma de validation
  const advancedValidationSchema = yup.object().shape({
    nom: yup.string().required('Le nom est requis'),
    email: yup.string().email('Email invalide').required('L\'email est requis'),
    type: yup.string().required('Le type est requis'),
    montant: yup.number().positive('Le montant doit être positif').required('Le montant est requis'),
    date_transaction: yup.date().required('La date est requise'),
    est_actif: yup.boolean(),
  });

  // Configuration avec différents types de champs
  const advancedFields = [
    {
      name: 'nom',
      label: 'Nom',
      type: 'text',
      required: true,
    },
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      required: true,
    },
    {
      name: 'type',
      label: 'Type',
      type: 'select',
      required: true,
      options: [
        { value: 'client', label: 'Client' },
        { value: 'fournisseur', label: 'Fournisseur' },
      ],
    },
    {
      name: 'montant',
      label: 'Montant',
      type: 'number',
      required: true,
    },
    {
      name: 'date_transaction',
      label: 'Date de transaction',
      type: 'date',
      required: true,
    },
    {
      name: 'est_actif',
      label: 'Actif',
      type: 'switch',
    },
  ];

  const handleSubmit = async (data) => {
    setLoading(true);
    try {
      console.log('Données soumises:', data);
      // Simuler un appel API
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setOpen(false);
    } catch (error) {
      console.error('Erreur:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="contained" onClick={() => setOpen(true)}>
        Formulaire avancé
      </Button>

      <ModalForm
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={handleSubmit}
        initialValues={{}}
        validationSchema={advancedValidationSchema}
        fields={advancedFields}
        title="Formulaire avec différents types de champs"
        loading={loading}
      />
    </>
  );
}

export default ClientFormExample;
export { FournisseurFormExample };

