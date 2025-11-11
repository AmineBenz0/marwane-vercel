/**
 * Fonction utilitaire pour exporter des données vers PDF.
 * 
 * @param {Array} data - Les données à exporter (tableau d'objets)
 * @param {Array} columns - Configuration des colonnes (même format que DataGrid)
 * @param {string} title - Titre du rapport
 * @param {string} filename - Nom du fichier PDF (sans extension)
 * @param {Object} options - Options supplémentaires (formatters personnalisés, etc.)
 */

import jsPDF from 'jspdf';
import { format, parseISO } from 'date-fns';
import fr from 'date-fns/locale/fr';

/**
 * Exporte les données vers PDF avec formatage de tableau.
 */
export const exportToPDF = (
  data,
  columns,
  title = 'Rapport',
  filename = 'rapport',
  options = {}
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
    // Créer un nouveau document PDF
    const doc = new jsPDF({
      orientation: 'landscape', // Paysage pour les tableaux larges
      unit: 'mm',
      format: 'a4',
    });

    // Configuration
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const startY = 30;
    let currentY = startY;

    // Couleurs
    const headerColor = [66, 133, 244]; // Bleu
    const textColor = [33, 33, 33];
    const borderColor = [200, 200, 200];

    // Fonction pour ajouter une nouvelle page si nécessaire
    const checkPageBreak = (requiredHeight) => {
      if (currentY + requiredHeight > pageHeight - margin) {
        doc.addPage();
        currentY = margin;
        return true;
      }
      return false;
    };

    // En-tête du document
    doc.setFontSize(18);
    doc.setTextColor(...textColor);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, currentY);
    currentY += 10;

    // Date d'export
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Exporté le ${format(new Date(), 'dd MMMM yyyy à HH:mm', { locale: fr })}`,
      margin,
      currentY
    );
    currentY += 15;

    // Préparer les en-têtes de colonnes
    const headers = columns.map((col) => col.label || col.id);
    const columnCount = headers.length;

    // Calculer la largeur des colonnes
    const availableWidth = pageWidth - 2 * margin;
    const columnWidth = availableWidth / columnCount;
    const rowHeight = 8;

    // Dessiner l'en-tête du tableau
    checkPageBreak(rowHeight + 5);
    doc.setFillColor(...headerColor);
    doc.rect(margin, currentY, availableWidth, rowHeight, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);

    headers.forEach((header, index) => {
      const x = margin + index * columnWidth;
      doc.text(header, x + 2, currentY + rowHeight / 2 + 2, {
        maxWidth: columnWidth - 4,
        align: 'left',
      });
    });

    currentY += rowHeight;

    // Dessiner les lignes de données
    doc.setTextColor(...textColor);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    data.forEach((row, rowIndex) => {
      checkPageBreak(rowHeight + 2);

      // Alterner les couleurs de fond pour la lisibilité
      if (rowIndex % 2 === 0) {
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, currentY, availableWidth, rowHeight, 'F');
      }

      // Dessiner les bordures
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(0.1);
      doc.line(margin, currentY, margin + availableWidth, currentY);

      // Dessiner les cellules
      columns.forEach((column, colIndex) => {
        const x = margin + colIndex * columnWidth;
        const cellValue = row[column.id];
        
        // Formater la valeur
        let displayValue = '';
        
        // Utiliser un formatter personnalisé si disponible
        if (options.customFormatters && options.customFormatters[column.id]) {
          displayValue = String(options.customFormatters[column.id](cellValue, row));
        } else if (column.format && typeof column.format === 'function') {
          // Pour l'export PDF, on préfère la valeur brute formatée
          // On ne peut pas utiliser les composants React, donc on formate directement
          if (cellValue === null || cellValue === undefined) {
            displayValue = '-';
          } else if (typeof cellValue === 'boolean') {
            displayValue = cellValue ? 'Oui' : 'Non';
          } else if (cellValue instanceof Date) {
            displayValue = format(cellValue, 'dd/MM/yyyy', { locale: fr });
          } else {
            displayValue = String(cellValue);
          }
        } else {
          // Formatage par défaut
          if (cellValue === null || cellValue === undefined) {
            displayValue = '-';
          } else if (typeof cellValue === 'boolean') {
            displayValue = cellValue ? 'Oui' : 'Non';
          } else if (cellValue instanceof Date) {
            displayValue = format(new Date(cellValue), 'dd/MM/yyyy', { locale: fr });
          } else {
            displayValue = String(cellValue);
          }
        }

        // Tronquer le texte si trop long
        const maxWidth = columnWidth - 4;
        if (displayValue.length > 30) {
          displayValue = displayValue.substring(0, 27) + '...';
        }

        // Alignement selon la configuration de la colonne
        const align = column.align || 'left';
        doc.text(displayValue, x + 2, currentY + rowHeight / 2 + 2, {
          maxWidth: maxWidth,
          align: align,
        });

        // Dessiner la bordure verticale
        if (colIndex < columnCount - 1) {
          doc.line(x + columnWidth, currentY, x + columnWidth, currentY + rowHeight);
        }
      });

      currentY += rowHeight;
    });

    // Dessiner la bordure inférieure du tableau
    doc.line(margin, currentY, margin + availableWidth, currentY);

    // Pied de page
    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Page ${i} sur ${totalPages}`,
        pageWidth - margin - 20,
        pageHeight - 10
      );
    }

    // Sauvegarder le PDF
    doc.save(`${filename}_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.pdf`);
  } catch (error) {
    console.error('Erreur lors de l\'export PDF:', error);
    throw new Error('Une erreur est survenue lors de l\'export PDF');
  }
};

/**
 * Exporte un rapport de caisse avec formatage spécialisé.
 */
export const exportCaisseReport = (mouvements, solde, dateDebut, dateFin) => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let currentY = 30;

    // Couleurs
    const headerColor = [66, 133, 244];
    const textColor = [33, 33, 33];
    const successColor = [76, 175, 80];
    const errorColor = [244, 67, 54];

    // Titre
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...textColor);
    doc.text('Rapport de Caisse', margin, currentY);
    currentY += 15;

    // Informations générales
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Solde actuel : ${new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(solde)}`, margin, currentY);
    currentY += 8;

    if (dateDebut && dateFin) {
      doc.text(
        `Période : ${format(new Date(dateDebut), 'dd/MM/yyyy', { locale: fr })} - ${format(new Date(dateFin), 'dd/MM/yyyy', { locale: fr })}`,
        margin,
        currentY
      );
      currentY += 8;
    }

    doc.text(
      `Exporté le ${format(new Date(), 'dd MMMM yyyy à HH:mm', { locale: fr })}`,
      margin,
      currentY
    );
    currentY += 20;

    // Tableau des mouvements
    if (mouvements && mouvements.length > 0) {
      const headers = ['Date', 'Type', 'Montant', 'Transaction ID'];
      const columnWidths = [50, 40, 50, 40];
      const rowHeight = 8;
      const tableWidth = columnWidths.reduce((sum, w) => sum + w, 0);

      // En-tête du tableau
      doc.setFillColor(...headerColor);
      doc.rect(margin, currentY, tableWidth, rowHeight, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);

      let x = margin;
      headers.forEach((header, index) => {
        doc.text(header, x + 2, currentY + rowHeight / 2 + 2);
        x += columnWidths[index];
      });

      currentY += rowHeight;

      // Lignes de données
      doc.setTextColor(...textColor);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      mouvements.forEach((mouvement, index) => {
        // Vérifier si on doit ajouter une nouvelle page
        if (currentY + rowHeight > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          currentY = 20;
        }

        // Alterner les couleurs
        if (index % 2 === 0) {
          doc.setFillColor(245, 245, 245);
          doc.rect(margin, currentY, tableWidth, rowHeight, 'F');
        }

        x = margin;
        const dateStr = format(parseISO(mouvement.date_mouvement), 'dd/MM/yyyy HH:mm', { locale: fr });
        const typeStr = mouvement.type_mouvement;
        const montantStr = new Intl.NumberFormat('fr-FR', {
          style: 'currency',
          currency: 'EUR',
        }).format(parseFloat(mouvement.montant || 0));
        const transactionId = `#${mouvement.id_transaction}`;

        // Date
        doc.text(dateStr, x + 2, currentY + rowHeight / 2 + 2);
        x += columnWidths[0];

        // Type (avec couleur)
        doc.setTextColor(
          ...(typeStr === 'ENTREE' ? successColor : errorColor)
        );
        doc.text(typeStr, x + 2, currentY + rowHeight / 2 + 2);
        doc.setTextColor(...textColor);
        x += columnWidths[1];

        // Montant
        doc.text(montantStr, x + 2, currentY + rowHeight / 2 + 2);
        x += columnWidths[2];

        // Transaction ID
        doc.text(transactionId, x + 2, currentY + rowHeight / 2 + 2);

        currentY += rowHeight;
      });
    } else {
      doc.setFontSize(10);
      doc.text('Aucun mouvement pour la période sélectionnée.', margin, currentY);
    }

    // Sauvegarder
    doc.save(`rapport_caisse_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.pdf`);
  } catch (error) {
    console.error('Erreur lors de l\'export du rapport de caisse:', error);
    throw new Error('Une erreur est survenue lors de l\'export PDF');
  }
};

