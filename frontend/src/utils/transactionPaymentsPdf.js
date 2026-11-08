import { PDF_COLORS, pdfClean, pdfDate, pdfMoney } from './financialPdfStyles';

const LEFT = 11.5;
const TOP = 43;
const BOTTOM_MARGIN = 20;
const HEAD_HEIGHT = 10;
const FONT_SIZE = 8;
const PADDING = 2;
const WIDTHS = [21, 39, 38, 21, 29, 23, 42, 32, 29];
const HEADINGS = ['TRANSACTION', 'PARTENAIRE', 'PRODUIT', 'DATE RÈGL.',
  'OPÉRATION', 'MOYEN', 'RÉFÉRENCE', 'MONTANT', 'STATUT'];
const TYPES = {
  cash: 'Espèces', cheque: 'Chèque', virement: 'Virement', lc: 'LC',
  carte: 'Carte', compensation: 'Compensation', autre: 'Autre',
};
const OPERATIONS = {
  paiement: 'Paiement', remboursement: 'Remboursement',
  credit_recu: 'Crédit utilisé', credit_transfere: 'Crédit transféré',
};
const STATUSES = {
  valide: 'Validé', en_attente: 'En attente', annule: 'Annulé', rejete: 'Rejeté',
  emis: 'Émis', a_encaisser: 'À encaisser', encaisse: 'Encaissé',
};

function paymentCells(payment) {
  const credit = ['credit_recu', 'credit_transfere'].includes(payment.nature);
  // Cancellation/rejection takes precedence over a cheque's historical state.
  const status = ['annule', 'rejete'].includes(payment.statut) ? payment.statut
    : payment.type_paiement === 'cheque' && payment.statut_cheque
      ? payment.statut_cheque : payment.statut;
  const reference = credit ? '-' : ({
    cheque: payment.numero_cheque,
    virement: payment.reference_virement,
    lc: payment.numero_reference_lc,
  }[payment.type_paiement] || '-');
  return {
    muted: ['annule', 'rejete'].includes(status),
    pending: ['en_attente', 'emis', 'a_encaisser'].includes(status),
    cells: [
      pdfDate(payment.date_paiement),
      OPERATIONS[payment.nature || 'paiement'] || payment.nature,
      credit ? '-' : TYPES[payment.type_paiement] || payment.type_paiement || '-',
      reference,
      payment.montant == null ? '-' : pdfMoney(payment.montant, false),
      STATUSES[status] || status || '-',
    ].map(pdfClean),
  };
}

/** Draw the approved continuous register with page-local merged cells.
 * Row spans are laid out per page: a large payment history fills the available
 * space and repeats its transaction context on the next page, without relying
 * on AutoTable's unsupported cross-page row spans.
 */
export function addTransactionPaymentsSection(doc, sections, source) {
  const groups = source.filter(row => Array.isArray(row.paiements) && row.paiements.length);
  if (!groups.length) return;

  const edges = WIDTHS.reduce((all, width) => [...all, all.at(-1) + width], [LEFT]);
  const right = edges.at(-1);
  const bottom = doc.internal.pageSize.getHeight() - BOTTOM_MARGIN;
  const bodyTop = TOP + HEAD_HEIGHT;
  const lineHeight = FONT_SIZE * 1.15 / doc.internal.scaleFactor;
  const pageLines = Math.floor((bottom - bodyTop - 2 * PADDING) / lineHeight);
  const wrap = (value, column, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(FONT_SIZE);
    return doc.splitTextToSize(pdfClean(value), WIDTHS[column] - 2 * PADDING);
  };
  const height = lines => Math.max(10.5,
    Math.max(...lines.map(cell => cell.length)) * lineHeight + 2 * PADDING);
  const fill = (x, y, width, h, color) => {
    doc.setFillColor(...color);
    doc.rect(x, y, width, h, 'F');
  };
  const rule = (x1, y1, x2, y2) => {
    doc.setDrawColor(...PDF_COLORS.line);
    doc.setLineWidth(0.15);
    doc.line(x1, y1, x2, y2);
  };
  const text = (lines, column, y, color = PDF_COLORS.ink, bold = false, align = 'left') => {
    if (!lines.length) return;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(FONT_SIZE);
    doc.setTextColor(...color);
    doc.text(lines, align === 'right' ? edges[column + 1] - PADDING : edges[column] + PADDING,
      y + PADDING + FONT_SIZE / doc.internal.scaleFactor, { align, lineHeightFactor: 1.15 });
  };
  let y;
  const newPage = () => {
    doc.addPage();
    fill(LEFT, TOP, right - LEFT, HEAD_HEIGHT, PDF_COLORS.darkNavy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.9);
    doc.setTextColor(...PDF_COLORS.white);
    HEADINGS.forEach((heading, index) => doc.text(heading, edges[index] + PADDING, TOP + 6.2));
    y = bodyTop;
  };
  newPage();
  const firstPage = doc.getNumberOfPages();

  groups.forEach((group, groupIndex) => {
    const kind = group.id_client != null ? 'Vente' : 'Achat';
    const context = [
      wrap(pdfDate(group.date_transaction) + '\n' + kind +
        (group.est_actif === false ? '\nAnnulée' : ''), 0),
      wrap(group.partner, 1, true),
      wrap(group.product, 2),
    ];
    const money = wrap(pdfMoney(group.montant_total), 1, true);
    // Split only pathological cells taller than an entire page. Ordinary
    // payments and references stay together; no text is discarded.
    const payments = group.paiements.flatMap(payment => {
      const record = paymentCells(payment);
      const lines = record.cells.map((cell, index) => wrap(cell, index + 3, index === 4));
      const fragments = Math.ceil(Math.max(...lines.map(cell => cell.length)) / pageLines);
      return Array.from({ length: fragments }, (_, fragment) => ({
        ...record,
        lines: lines.map(cell => cell.slice(fragment * pageLines, (fragment + 1) * pageLines)),
      }));
    });
    let offset = 0;
    let contextOffset = 0;
    let continued = false;
    while (offset < payments.length || contextOffset) {
      // Normal context repeats on every continuation. An abnormally long name
      // flows in full-page slices rather than overflowing the footer.
      const maxContextLines = pageLines - money.length - 3;
      const visibleContext = context.map(cell => cell.slice(contextOffset, contextOffset + maxContextLines));
      if (continued && !contextOffset) visibleContext[0] = [...context[0], '(suite)'];
      const contextHeight = Math.max(height(visibleContext),
        (visibleContext[1].length + money.length + 1) * lineHeight + 2 * PADDING);
      if (y + contextHeight > bottom + 0.001) newPage();
      let end = offset;
      let rowsHeight = 0;
      while (end < payments.length) {
        const next = height(payments[end].lines);
        if (y + Math.max(contextHeight, rowsHeight + next) > bottom + 0.001) break;
        rowsHeight += next;
        end += 1;
      }
      if (end === offset && offset < payments.length && y > bodyTop + 0.001) {
        newPage();
        continue;
      }
      const blockHeight = Math.max(contextHeight, rowsHeight);
      const bg = groupIndex % 2 ? PDF_COLORS.white : PDF_COLORS.pale;
      const contextBg = groupIndex % 2 ? [242, 248, 247] : PDF_COLORS.paleTeal;
      fill(LEFT, y, right - LEFT, blockHeight, bg);
      fill(LEFT, y, edges[3] - LEFT, blockHeight, contextBg);
      fill(LEFT, y, 0.65, blockHeight, PDF_COLORS.teal);
      const contextColor = group.est_actif === false ? PDF_COLORS.muted : PDF_COLORS.ink;
      visibleContext.forEach((cell, index) => text(cell, index, y + 1, contextColor, index === 1));
      text(money, 1, y + blockHeight - money.length * lineHeight - 2 * PADDING,
        group.est_actif === false ? PDF_COLORS.muted : PDF_COLORS.teal, true);
      let rowY = y;
      payments.slice(offset, end).forEach((payment, index) => {
        const rowHeight = height(payment.lines) + (index === end - offset - 1 ? blockHeight - rowsHeight : 0);
        const color = payment.muted || group.est_actif === false ? PDF_COLORS.muted : PDF_COLORS.ink;
        payment.lines.forEach((cell, column) => {
          if (column === 5) return;
          const cellY = rowY + (rowHeight - (cell.length * lineHeight + 2 * PADDING)) / 2;
          text(cell, column + 3, cellY, color, column === 4, column === 4 ? 'right' : 'left');
        });
        const label = payment.lines[5];
        if (label.length === 1 && label[0] !== '-') {
          const pillY = rowY + (rowHeight - 6) / 2;
          const pillColor = payment.muted ? PDF_COLORS.paleBlue
            : payment.pending ? [251, 243, 228] : PDF_COLORS.paleTeal;
          doc.setFillColor(...pillColor);
          doc.roundedRect(edges[8] + 2, pillY, WIDTHS[8] - 4, 6, 3, 3, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(...(payment.muted ? PDF_COLORS.muted
            : payment.pending ? PDF_COLORS.gold : PDF_COLORS.teal));
          doc.text(label[0], edges[8] + WIDTHS[8] / 2, pillY + 4, { align: 'center' });
        } else if (label.length) {
          text(label, 8, rowY + (rowHeight - height([label])) / 2, color);
        }
        rowY += rowHeight;
        if (index < end - offset - 1) rule(edges[3], rowY, right, rowY);
      });
      [1, 2, 3].forEach(index => rule(edges[index], y, edges[index], y + blockHeight));
      y += blockHeight;
      rule(LEFT, y, right, y);
      offset = end;
      const contextRemaining = Math.max(...context.map(cell => cell.length)) > contextOffset + maxContextLines;
      contextOffset = contextRemaining ? contextOffset + maxContextLines : 0;
      continued = true;
      if (offset < payments.length || contextOffset) newPage();
    }
  });
  sections.push({
    start: firstPage, end: doc.getNumberOfPages(), title: 'Règlements et références',
    subtitle: String(groups.length) + (groups.length === 1 ? ' transaction avec un règlement' : ' transactions avec un règlement') + ' | montants en MAD',
  });
}
