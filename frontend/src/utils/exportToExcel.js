/**
 * Fonction utilitaire pour exporter des données vers Excel.
 * 
 * @param {Array} data - Les données à exporter (tableau d'objets)
 * @param {Array} columns - Configuration des colonnes (même format que DataGrid)
 * @param {string} filename - Nom du fichier Excel (sans extension)
 * @param {string} sheetName - Nom de la feuille Excel (défaut: 'Données')
 */

import * as XLSX from 'xlsx';

/**
 * Convertit une valeur formatée en valeur brute pour Excel.
 * Gère les composants React (comme les Chips) en extrayant le texte.
 */
const extractValue = (value, column) => {
  // Si une fonction de formatage est définie, on doit extraire la valeur brute
  // Pour l'export, on utilise directement la valeur brute de la ligne
  if (value === null || value === undefined) {
    return '';
  }
  
  // Si c'est un objet React (comme un Chip), on essaie d'extraire le texte
  if (typeof value === 'object' && value !== null) {
    // Si c'est un Chip ou autre composant React, on retourne la valeur brute
    // Pour l'export, on préfère utiliser la valeur brute de la ligne originale
    return String(value);
  }
  
  return value;
};

/**
 * Exporte les données vers Excel.
 */
export const exportToExcel = (data, columns, filename = 'export', sheetName = 'Données') => {
  if (!data || data.length === 0) {
    console.warn('Aucune donnée à exporter');
    return;
  }

  if (!columns || columns.length === 0) {
    console.warn('Aucune colonne définie pour l\'export');
    return;
  }

  try {
    // Préparer les en-têtes
    const headers = columns.map((col) => col.label || col.id);

    // Préparer les données
    const rows = data.map((row) => {
      return columns.map((column) => {
        const cellValue = row[column.id];
        
        // Si une fonction de formatage existe, on essaie d'extraire la valeur brute
        // Sinon, on utilise directement la valeur
        let exportValue = cellValue;
        
        if (column.format && typeof column.format === 'function') {
          // Pour l'export, on préfère la valeur brute, mais on peut aussi formater
          // Ici, on utilise la valeur brute pour éviter les problèmes avec les composants React
          exportValue = cellValue;
        }
        
        // Gestion des valeurs null/undefined
        if (exportValue === null || exportValue === undefined) {
          return '';
        }
        
        // Gestion des booléens
        if (typeof exportValue === 'boolean') {
          return exportValue ? 'Oui' : 'Non';
        }
        
        // Gestion des dates
        if (exportValue instanceof Date) {
          return exportValue.toLocaleDateString('fr-FR');
        }
        
        // Gestion des nombres
        if (typeof exportValue === 'number') {
          return exportValue;
        }
        
        // Convertir en string pour tout le reste
        return String(exportValue);
      });
    });

    // Créer le workbook
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    
    // Ajuster la largeur des colonnes
    const columnWidths = columns.map((col) => ({
      wch: Math.max(col.label?.length || col.id.length || 10, 15),
    }));
    worksheet['!cols'] = columnWidths;

    // Créer le workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Générer le fichier Excel et le télécharger
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  } catch (error) {
    console.error('Erreur lors de l\'export Excel:', error);
    throw new Error('Une erreur est survenue lors de l\'export Excel');
  }
};

/**
 * Exporte les données avec formatage avancé (pour les cas spéciaux).
 * Cette version permet de spécifier des formatters personnalisés pour l'export.
 */
export const exportToExcelAdvanced = (
  data,
  columns,
  filename = 'export',
  sheetName = 'Données',
  customFormatters = {}
) => {
  if (!data || data.length === 0) {
    console.warn('Aucune donnée à exporter');
    return;
  }

  if (!columns || columns.length === 0) {
    console.warn('Aucune colonne définie pour l\'export');
    return;
  }

  try {
    // Préparer les en-têtes
    const headers = columns.map((col) => col.label || col.id);

    // Préparer les données
    const rows = data.map((row) => {
      return columns.map((column) => {
        const cellValue = row[column.id];
        
        // Vérifier si un formatter personnalisé existe pour cette colonne
        if (customFormatters[column.id] && typeof customFormatters[column.id] === 'function') {
          return customFormatters[column.id](cellValue, row);
        }
        
        // Gestion des valeurs null/undefined
        if (cellValue === null || cellValue === undefined) {
          return '';
        }
        
        // Gestion des booléens
        if (typeof cellValue === 'boolean') {
          return cellValue ? 'Oui' : 'Non';
        }
        
        // Gestion des dates
        if (cellValue instanceof Date) {
          return cellValue.toLocaleDateString('fr-FR');
        }
        
        // Gestion des nombres
        if (typeof cellValue === 'number') {
          return cellValue;
        }
        
        // Convertir en string pour tout le reste
        return String(cellValue);
      });
    });

    // Créer le workbook
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    
    // Ajuster la largeur des colonnes
    const columnWidths = columns.map((col) => ({
      wch: Math.max(col.label?.length || col.id.length || 10, 15),
    }));
    worksheet['!cols'] = columnWidths;

    // Créer le workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Générer le fichier Excel et le télécharger
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  } catch (error) {
    console.error('Erreur lors de l\'export Excel:', error);
    throw new Error('Une erreur est survenue lors de l\'export Excel');
  }
};

