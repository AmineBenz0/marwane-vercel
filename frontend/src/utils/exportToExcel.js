/**
 * Export utilities for client-side Excel workbooks.
 *
 * ExcelJS is loaded only when an export is requested. This keeps the primary
 * application bundle smaller while avoiding the unmaintained SheetJS runtime.
 */

const EXCEL_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const normaliseCellValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (value instanceof Date) return value.toLocaleDateString('fr-FR');
  if (typeof value === 'number') return value;
  return String(value);
};

const buildRows = (data, columns, customFormatters = {}) => data.map((row) => columns.map((column) => {
  const cellValue = row[column.id];
  const formattedValue = typeof customFormatters[column.id] === 'function'
    ? customFormatters[column.id](cellValue, row)
    : cellValue;

  return normaliseCellValue(formattedValue);
}));

const downloadWorkbook = async (rows, columns, filename, sheetName) => {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(String(sheetName || 'Données').slice(0, 31));
  const headers = columns.map((column) => column.label || column.id);

  worksheet.addRow(headers);
  rows.forEach((row) => worksheet.addRow(row));
  worksheet.columns = columns.map((column) => ({
    width: Math.max(String(column.label || column.id).length + 2, 15),
  }));

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4285F4' },
  };
  headerRow.alignment = { vertical: 'middle' };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = {
    from: 'A1',
    to: `${String.fromCharCode(65 + Math.max(columns.length - 1, 0))}1`,
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: EXCEL_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const validateExportInput = (data, columns) => {
  if (!data || data.length === 0) {
    console.warn('Aucune donnée à exporter');
    return false;
  }

  if (!columns || columns.length === 0) {
    console.warn("Aucune colonne définie pour l'export");
    return false;
  }

  return true;
};

const exportWorkbook = async (data, columns, filename, sheetName, customFormatters) => {
  if (!validateExportInput(data, columns)) return;

  try {
    await downloadWorkbook(
      buildRows(data, columns, customFormatters),
      columns,
      filename,
      sheetName
    );
  } catch (error) {
    console.error("Erreur lors de l'export Excel:", error);
    throw new Error("Une erreur est survenue lors de l'export Excel");
  }
};

/**
 * Exporte des données vers Excel.
 */
export const exportToExcel = (data, columns, filename = 'export', sheetName = 'Données') => (
  exportWorkbook(data, columns, filename, sheetName)
);

/**
 * Exporte des données vers Excel avec des formatters par colonne.
 */
export const exportToExcelAdvanced = (
  data,
  columns,
  filename = 'export',
  sheetName = 'Données',
  customFormatters = {}
) => exportWorkbook(data, columns, filename, sheetName, customFormatters);
