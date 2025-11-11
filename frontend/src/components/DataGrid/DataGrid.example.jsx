/**
 * Exemple d'utilisation du composant DataGrid.
 * 
 * Ce fichier montre comment utiliser le composant DataGrid
 * avec différentes configurations.
 */

import React from 'react';
import DataGrid from './DataGrid';

/**
 * Exemple 1 : Utilisation basique avec données simples.
 */
export function BasicDataGridExample() {
  const columns = [
    { id: 'id', label: 'ID', sortable: true },
    { id: 'nom', label: 'Nom', sortable: true, filterable: true },
    { id: 'email', label: 'Email', sortable: true, filterable: true },
    { id: 'date_creation', label: 'Date de création', sortable: true },
  ];

  const rows = [
    { id: 1, nom: 'John Doe', email: 'john@example.com', date_creation: '2024-01-15' },
    { id: 2, nom: 'Jane Smith', email: 'jane@example.com', date_creation: '2024-01-16' },
    { id: 3, nom: 'Bob Johnson', email: 'bob@example.com', date_creation: '2024-01-17' },
  ];

  return (
    <DataGrid
      rows={rows}
      columns={columns}
      pageSize={10}
    />
  );
}

/**
 * Exemple 2 : Avec actions (éditer et supprimer).
 */
export function DataGridWithActionsExample() {
  const columns = [
    { id: 'id', label: 'ID' },
    { id: 'nom_client', label: 'Nom du client', filterable: true },
    { id: 'montant', label: 'Montant', align: 'right' },
  ];

  const rows = [
    { id: 1, nom_client: 'Client A', montant: 1500.00 },
    { id: 2, nom_client: 'Client B', montant: 2300.50 },
    { id: 3, nom_client: 'Client C', montant: 980.25 },
  ];

  const handleEdit = (row) => {
    console.log('Éditer:', row);
    // Ouvrir un modal d'édition, etc.
  };

  const handleDelete = (row) => {
    if (window.confirm(`Voulez-vous vraiment supprimer ${row.nom_client} ?`)) {
      console.log('Supprimer:', row);
      // Appeler l'API pour supprimer, etc.
    }
  };

  return (
    <DataGrid
      rows={rows}
      columns={columns}
      onEdit={handleEdit}
      onDelete={handleDelete}
      pageSize={10}
    />
  );
}

/**
 * Exemple 3 : Avec formatage personnalisé.
 */
export function DataGridWithFormattingExample() {
  const columns = [
    { id: 'id', label: 'ID' },
    { id: 'nom', label: 'Nom' },
    {
      id: 'montant',
      label: 'Montant',
      align: 'right',
      format: (value) => new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
      }).format(value),
    },
    {
      id: 'date',
      label: 'Date',
      format: (value) => new Date(value).toLocaleDateString('fr-FR'),
    },
    {
      id: 'actif',
      label: 'Statut',
      format: (value) => value ? 'Actif' : 'Inactif',
    },
  ];

  const rows = [
    { id: 1, nom: 'Transaction 1', montant: 1500.00, date: '2024-01-15', actif: true },
    { id: 2, nom: 'Transaction 2', montant: 2300.50, date: '2024-01-16', actif: false },
    { id: 3, nom: 'Transaction 3', montant: 980.25, date: '2024-01-17', actif: true },
  ];

  return (
    <DataGrid
      rows={rows}
      columns={columns}
      pageSize={10}
    />
  );
}

/**
 * Exemple 4 : Avec état de chargement.
 */
export function DataGridWithLoadingExample() {
  const columns = [
    { id: 'id', label: 'ID' },
    { id: 'nom', label: 'Nom' },
  ];

  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState([]);

  React.useEffect(() => {
    // Simuler un chargement de données
    setTimeout(() => {
      setRows([
        { id: 1, nom: 'Donnée 1' },
        { id: 2, nom: 'Donnée 2' },
      ]);
      setLoading(false);
    }, 2000);
  }, []);

  return (
    <DataGrid
      rows={rows}
      columns={columns}
      loading={loading}
      pageSize={10}
    />
  );
}

/**
 * Exemple 5 : Sans actions.
 */
export function DataGridWithoutActionsExample() {
  const columns = [
    { id: 'id', label: 'ID' },
    { id: 'nom', label: 'Nom' },
    { id: 'description', label: 'Description' },
  ];

  const rows = [
    { id: 1, nom: 'Item 1', description: 'Description 1' },
    { id: 2, nom: 'Item 2', description: 'Description 2' },
  ];

  return (
    <DataGrid
      rows={rows}
      columns={columns}
      showActions={false}
      pageSize={10}
    />
  );
}

