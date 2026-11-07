/**
 * Phase 7 authenticated read-only acceptance.
 *
 * Intentionally creates/updates/deletes NOTHING on the staging application.
 * Enabled through the existing RUN_E2E gate once staging E2E credentials exist.
 * Checks downloaded workbook bytes rather than merely observing button clicks.
 */
import { test, expect, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

async function login(page: Page) {
  await page.goto('/login');
  if (/\/dashboard$/.test(page.url())) return;
  await page.locator('input[name="email"]').fill(EMAIL || '');
  await page.locator('input[name="password"]').fill(PASSWORD || '');
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function fetchJson<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(async (url) => {
    const token = window.localStorage.getItem('access_token');
    if (!token) throw new Error('Authenticated E2E access token is unavailable');
    const response = await window.fetch('/api/v1' + url, {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
    });
    if (!response.ok) throw new Error('Read-only API request failed: ' + response.status);
    return response.json();
  }, path) as Promise<T>;
}

type Tx = {
  id_transaction: number;
  date_transaction: string;
  est_actif: boolean;
  id_client: number | null;
  id_fournisseur: number | null;
  montant_total: number | string;
  quantite: number | string | null;
};

async function allTransactions(page: Page, active?: boolean): Promise<Tx[]> {
  const records: Tx[] = [];
  for (let offset = 0; offset < 50000; offset += 500) {
    const statusFilter = active === undefined ? '' : '&est_actif=' + active;
    const batch = await fetchJson<Tx[]>(page, '/transactions?skip=' + offset + '&limit=500' + statusFilter);
    records.push(...batch);
    if (batch.length < 500) return records;
  }
  throw new Error('Truncated staging transaction history: too many rows');
}

const cents = (value: unknown) => Math.round(Number(value || 0) * 100);
const moneyCellCents = (value: unknown) => {
  const clean = String(value ?? '').replace(/[^\d,.\-]/g, '').replace(',', '.');
  return cents(clean);
};

async function workbookForDownload(page: Page, click: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), click()]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  const filename = await download.path();
  if (!filename) throw new Error('Excel download has no local artifact');
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(filename);
  const sheet = book.worksheets[0];
  if (!sheet) throw new Error('Excel export is empty');
  return sheet;
}

test.describe('Phase 7: authenticated reporting reconciliation (read-only)', () => {
  test.beforeEach(async ({}, testInfo) => {
    testInfo.skip(!EMAIL || !PASSWORD, 'Staging E2E credentials are required');
  });

  test('transaction register workbook preserves canceled rows but sums only active amounts', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);
    const transactions = await allTransactions(page);
    test.skip(!transactions.length, 'No staging transactions to reconcile');
    // Match business rows as a multiset; IDs are internal and intentionally
    // absent from the client-facing export. Duplicate-looking rows are counted.
    const expectedRows = new Map<string, number>();
    const rowKey = (date: string, status: string, quantity: number, amountCents: number) =>
      JSON.stringify([date, status, quantity, amountCents]);
    const expectedCents = transactions.reduce((sum, tx) => {
      const iso = tx.date_transaction.slice(0, 10);
      const date = `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
      const status = tx.est_actif === false ? 'Annulée' : 'Active';
      const key = rowKey(date, status, Number(tx.quantite || 0), cents(tx.montant_total));
      expectedRows.set(key, (expectedRows.get(key) || 0) + 1);
      return sum + (tx.est_actif === false ? 0 : cents(tx.montant_total));
    }, 0);

    await page.goto('/transactions');
    const button = page.getByRole('button', { name: 'Exporter en Excel' });
    await expect(button).toBeEnabled();
    const sheet = await workbookForDownload(page, () => button.click());

    const columns = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => columns.set(String(cell.value), column));
    expect(columns.has('ID')).toBe(false);
    const dateCol = columns.get('Date');
    const stateCol = columns.get('État');
    const quantityCol = columns.get('Quantité');
    const amountCol = columns.get('Montant total');
    expect(dateCol).toBeTruthy();
    expect(stateCol).toBeTruthy();
    expect(quantityCol).toBeTruthy();
    expect(amountCol).toBeTruthy();

    const observedRows = new Map<string, number>();
    let footerCents: number | undefined;
    for (let i = 2; i <= sheet.rowCount; i += 1) {
      const row = sheet.getRow(i);
      const date = String(row.getCell(dateCol!).value ?? '');
      if (/^\\d{2}\\/\\d{2}\\/\\d{2}$/.test(date)) {
        const key = rowKey(
          date,
          String(row.getCell(stateCol!).value),
          Number(row.getCell(quantityCol!).value || 0),
          moneyCellCents(row.getCell(amountCol!).value),
        );
        expect(expectedRows.has(key)).toBe(true);
        observedRows.set(key, (observedRows.get(key) || 0) + 1);
      } else if (Array.isArray(row.values) && row.values.some((value: unknown) => String(value || '').startsWith('Total :'))) {
        footerCents = moneyCellCents(row.getCell(amountCol!).value);
      }
    }
    expect([...observedRows.entries()].sort()).toEqual([...expectedRows.entries()].sort());
    expect(footerCents).toBe(expectedCents);

    const [pdf] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exporter en PDF' }).click(),
    ]);
    const pdfPath = await pdf.path();
    if (!pdfPath) throw new Error('PDF download has no artifact');
    expect((await readFile(pdfPath)).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('monthly report workbook agrees with active transaction totals and downloaded PDF', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);
    const transactions = await allTransactions(page, true);
    test.skip(!transactions.length, 'No active staging transactions to reconcile');
    const month = transactions[0].date_transaction.slice(0, 7);
    const inMonth = transactions.filter(tx => tx.date_transaction.startsWith(month));
    const billedSales = inMonth.reduce((sum, tx) => (
      sum + (tx.id_client == null ? 0 : cents(tx.montant_total))
    ), 0);
    const billedPurchases = inMonth.reduce((sum, tx) => (
      sum + (tx.id_fournisseur == null ? 0 : cents(tx.montant_total))
    ), 0);

    const report = await fetchJson<{
      ventes: string;
      achats: string;
      charges: string;
      creances_actuelles: string;
      dettes_actuelles: string;
      solde_caisse: string;
      date_soldes_actuels: string;
    }>(page, '/reports/monthly?month=' + month);
    expect(cents(report.ventes)).toBe(billedSales);
    expect(cents(report.achats)).toBe(billedPurchases);

    // Reconcile the monthly report with the same-date financial position
    // used by the live cash and receivables/payables screens.
    const position = await fetchJson<{
      creances_clients: string;
      dettes_fournisseurs: string;
      solde_caisse: string;
    }>(page, '/caisse/solde/complet?date_as_of=' + report.date_soldes_actuels);
    expect(cents(report.creances_actuelles)).toBe(cents(position.creances_clients));
    expect(cents(report.dettes_actuelles)).toBe(cents(position.dettes_fournisseurs));
    expect(cents(report.solde_caisse)).toBe(cents(position.solde_caisse));

    await page.goto('/rapports/mensuel');
    await page.locator('input[type="month"]').fill(month);
    await expect(page.getByRole('heading', { name: 'Activité du mois' })).toBeVisible();
    const sheet = await workbookForDownload(
      page, () => page.getByRole('button', { name: 'Excel', exact: true }).click()
    );
    const rows = new Map<string, string>();
    for (let i = 2; i <= sheet.rowCount; i += 1) {
      const label = String(sheet.getRow(i).getCell(1).value ?? '');
      const value = String(sheet.getRow(i).getCell(2).value ?? '');
      if (label) rows.set(label, value);
    }
    expect(moneyCellCents(rows.get('Ventes'))).toBe(billedSales);
    expect(moneyCellCents(rows.get('Achats'))).toBe(billedPurchases);
    expect(moneyCellCents(rows.get('Charges'))).toBe(cents(report.charges));

    const [pdf] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'PDF', exact: true }).click(),
    ]);
    const pdfPath = await pdf.path();
    if (!pdfPath) throw new Error('Monthly PDF was not downloaded');
    expect((await readFile(pdfPath)).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
