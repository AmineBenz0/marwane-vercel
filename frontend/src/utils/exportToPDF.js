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
import 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import fr from 'date-fns/locale/fr';

/**
 * Exporte les données vers PDF avec formatage de tableau professionnel.
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

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;

    // En-tête du document
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(33, 33, 33);
    doc.text(title, margin, 20);

    // Date d'export
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Exporté le ${format(new Date(), 'dd MMMM yyyy à HH:mm', { locale: fr })}`,
      margin,
      28
    );

    // Préparer les en-têtes de colonnes
    const headers = columns.map((col) => {
      // Si label est un objet React (comme pour Option 3), extraire le texte
      if (typeof col.label === 'object' && col.label !== null) {
        return col.id; // Fallback sur l'ID
      }
      return col.label || col.id;
    });

    // Préparer les données du tableau
    const tableData = data.map((row) => {
      return columns.map((column) => {
        const cellValue = row[column.id];
        
        // Utiliser un formatter personnalisé si disponible
        if (options.customFormatters && options.customFormatters[column.id]) {
          return String(options.customFormatters[column.id](cellValue, row));
        }
        
        // Formatage par défaut
        if (cellValue === null || cellValue === undefined) {
          return '-';
        } else if (typeof cellValue === 'boolean') {
          return cellValue ? 'Actif' : 'Inactif';
        } else if (cellValue instanceof Date) {
          return format(new Date(cellValue), 'dd/MM/yyyy', { locale: fr });
        } else {
          return String(cellValue);
        }
      });
    });

    // Calculer les largeurs de colonnes de manière intelligente
    const columnWidths = columns.map((col) => {
      // Largeurs personnalisées selon le type de colonne
      if (col.id === 'id_transaction' || col.id === 'id') return 15;
      if (col.id === 'date_transaction') return 25;
      if (col.id === 'quantite') return 20;
      if (col.id === 'prix_unitaire') return 'wrap'; // Laisse la colonne s'adapter au contenu
      if (col.id === 'montant_total') return 'wrap'; // Laisse la colonne s'adapter au contenu
      if (col.id === 'est_actif') return 20;
      // Colonnes texte (client, fournisseur, produit)
      return 'auto'; // Laisse autotable calculer
    });

    // Utiliser autoTable pour un rendu professionnel
    doc.autoTable({
      startY: 35,
      head: [headers],
      body: tableData,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 3,
        overflow: 'linebreak',
        halign: 'left',
        valign: 'middle',
        minCellHeight: 8, // Hauteur minimale pour éviter le texte compressé
      },
      headStyles: {
        fillColor: [66, 133, 244],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
        halign: 'left',
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      columnStyles: columns.reduce((acc, col, index) => {
        const isMontantTotal = col.id === 'montant_total';
        const isPrixUnitaire = col.id === 'prix_unitaire';

        acc[index] = {
          halign: isMontantTotal || isPrixUnitaire ? 'right' : col.align || 'left',
          cellWidth: columnWidths[index] === 'auto' ? 'auto' : columnWidths[index],
          overflow: isMontantTotal || isPrixUnitaire ? 'visible' : undefined,
        };
        
        // Style spécial pour les montants (gras)
        if (isMontantTotal) {
          acc[index].fontStyle = 'bold';
        }
        
        return acc;
      }, {}),
      didParseCell: function(data) {
        // Colorer les montants selon le type de transaction
        if (data.column.index === columns.findIndex(c => c.id === 'montant_total') && data.section === 'body') {
          const row = tableData[data.row.index];
          const originalRow = data.row.raw;
          
          // Vérifier si c'est une entrée (client) ou sortie (fournisseur)
          const dataRow = tableData[data.row.index];
          const clientColIndex = columns.findIndex(c => c.id === 'client_ou_fournisseur');
          
          // Si on peut détecter le type depuis les données originales
          if (options.colorByType) {
            const isEntree = options.colorByType(data.row.index, tableData);
            if (isEntree === true) {
              data.cell.styles.textColor = [76, 175, 80]; // Vert
            } else if (isEntree === false) {
              data.cell.styles.textColor = [244, 67, 54]; // Rouge
            }
          }
        }
      },
      margin: { top: 35, right: margin, bottom: 20, left: margin },
      didDrawPage: function(data) {
        // Pied de page
        const pageCount = doc.internal.pages.length - 1;
        const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;
        
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(
          `Page ${pageNumber} sur ${pageCount}`,
          pageWidth - margin - 20,
          doc.internal.pageSize.getHeight() - 10
        );
      },
    });

    // Afficher les totaux sous le tableau si demandés
    if (options.footerTotals && doc.lastAutoTable) {
      const { label = 'Total :', value = '', columnId = 'montant_total' } = options.footerTotals;
      const table = doc.lastAutoTable.table;
      const finalY = doc.lastAutoTable.finalY || 35;
      const pageHeight = doc.internal.pageSize.getHeight();
      const montantIndex = columns.findIndex((col) => col.id === columnId);
      const targetColumn = table?.columns?.[montantIndex];
      const columnRight = targetColumn
        ? targetColumn.x + targetColumn.width
        : pageWidth - margin;

      let startY = finalY + 10;
      if (startY + 10 > pageHeight - margin) {
        doc.addPage();
        startY = margin;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(33, 33, 33);
      doc.text(`${label} ${value}`, columnRight, startY, { align: 'right' });
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

    // Couleurs
    const headerColor = [66, 133, 244];
    const textColor = [33, 33, 33];
    const successColor = [76, 175, 80];
    const errorColor = [244, 67, 54];

    // Titre
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...textColor);
    doc.text('Rapport de Caisse', margin, 30);

    // Informations générales
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Solde actuel : ${new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'MAD',
    }).format(solde)}`, margin, 45);

    if (dateDebut && dateFin) {
      doc.text(
        `Période : ${format(new Date(dateDebut), 'dd/MM/yyyy', { locale: fr })} - ${format(new Date(dateFin), 'dd/MM/yyyy', { locale: fr })}`,
        margin,
        53
      );
    }

    doc.text(
      `Exporté le ${format(new Date(), 'dd MMMM yyyy à HH:mm', { locale: fr })}`,
      margin,
      61
    );

    // Tableau des mouvements avec autoTable
    if (mouvements && mouvements.length > 0) {
      const headers = ['Date', 'Type', 'Montant', 'Transaction ID'];
      
      const tableData = mouvements.map((mouvement) => [
        format(parseISO(mouvement.date_mouvement), 'dd/MM/yyyy HH:mm', { locale: fr }),
        mouvement.type_mouvement,
        new Intl.NumberFormat('fr-FR', {
          style: 'currency',
          currency: 'MAD',
        }).format(parseFloat(mouvement.montant || 0)),
        `#${mouvement.id_transaction}`,
      ]);

      doc.autoTable({
        startY: 70,
        head: [headers],
        body: tableData,
        theme: 'grid',
        styles: {
          fontSize: 9,
          cellPadding: 3,
        },
        headStyles: {
          fillColor: headerColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 10,
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 40, halign: 'center' },
          2: { cellWidth: 50, halign: 'right', fontStyle: 'bold' },
          3: { cellWidth: 40, halign: 'center' },
        },
        didParseCell: function(data) {
          // Colorer le type de mouvement
          if (data.column.index === 1 && data.section === 'body') {
            const type = data.cell.raw;
            data.cell.styles.textColor = type === 'ENTREE' ? successColor : errorColor;
            data.cell.styles.fontStyle = 'bold';
          }
          // Colorer le montant
          if (data.column.index === 2 && data.section === 'body') {
            const rowData = mouvements[data.row.index];
            data.cell.styles.textColor = rowData.type_mouvement === 'ENTREE' ? successColor : errorColor;
          }
        },
        margin: { top: 70, right: margin, bottom: 20, left: margin },
      });
    } else {
      doc.setFontSize(10);
      doc.text('Aucun mouvement pour la période sélectionnée.', margin, 70);
    }

    // Sauvegarder
    doc.save(`rapport_caisse_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.pdf`);
  } catch (error) {
    console.error('Erreur lors de l\'export du rapport de caisse:', error);
    throw new Error('Une erreur est survenue lors de l\'export PDF');
  }
};
