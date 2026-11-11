import { test, expect, type Page } from '@playwright/test';
import { mockAuthenticatedSession } from './auth';

// Only synthetic data in a disposable Vite server. This suite never uses
// real staging credentials or touches a Supabase database.
type Status = 'success' | 'stale' | 'network-retry' | 'unsupported';
const original = {
  id_transaction: 7, id_client: 1, id_produit: 1, id_batiment: 1,
  est_promesse: true, allocation_automatique: true, est_actif: true,
  date_transaction: '2026-10-22', date_livraison_prevue: '2026-11-20',
  quantite: 1000, quantite_couverte: 600, quantite_completee: 600,
  quantite_reservee: 0, quantite_annulee: 0, quantite_en_attente: 400,
  montant_total: '1500.00', montant_avoir: '0.00', montant_net: '1500.00',
  montant_paye: '1500.00', montant_restant: '0.00', row_version: 3,
  statut_paiement: 'paye', avoirs_livraison_differee: [],
};
const quote = {
  id_transaction: 7, date_effet: '2026-11-11', expected_version: 3,
  quantite_en_attente_attendue: 400, quantite_couverte: 600,
  quantite_annulee: 400, quantite_annulee_cumulee: 400,
  montant_initial: '1500.00', montant_avoir: '600.00',
  montant_avoirs_cumule: '600.00', montant_net: '900.00',
  montant_paye: '1500.00', montant_restant: '-600.00',
  credit_client: '600.00',
};
const receipt = {
  ...quote, id_avoir: 'e655bf4e-8be3-4662-ad3e-1a2f923bd9b3',
  quantite_en_attente: 0, rejoue: false,
};
const adjusted = {
  ...original, row_version: 4,
  quantite_annulee: 400, quantite_en_attente: 0,
  montant_avoir: '600.00', montant_net: '900.00',
  montant_restant: '-600.00', statut_paiement: 'surpaye',
  avoirs_livraison_differee: [{
    id_avoir: receipt.id_avoir, quantite_annulee: 400,
    montant_avoir: '600.00', avoir_cumule: '600.00',
    date_effet: '2026-11-11',
  }],
};
const summary = {
  ...original, nom_client: 'Marché Central', nom_produit: 'Œufs normaux',
  nom_batiment: 'Bâtiment A',
};

async function mockPhase8Api(page: Page, mode: Status) {
  const errors: string[] = [];
  const requests: { method: string; path: string; body?: any }[] = [];
  let canceled = false, attempts = 0, originalUUID: string | null = null;
  page.on('pageerror', error => errors.push(error.message));
  await mockAuthenticatedSession(page);
  await page.route('**/api/v1/**', async route => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;
    if (pathname === '/api/v1/auth/refresh') return route.fallback();
    const path = pathname.replace('/api/v1', ''), method = req.method();
    const body = method === 'POST' ? req.postDataJSON() : undefined;
    requests.push({ method, path, body });
    const fulfill = (status: number, data: unknown) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(data),
    });
    if (method !== 'GET' && path !== '/transactions/7/cancel-remainder') {
      return fulfill(405, { detail: 'Unexpected write' });
    }
    if (path === '/transactions/deferred-sales') {
      return fulfill(200, canceled ? [] : [summary]);
    }
    if (path === '/transactions/7' && method === 'GET') {
      return fulfill(200, canceled ? adjusted : original);
    }
    if (path === '/transactions/7/cancel-remainder/preview') {
      return mode === 'unsupported'
        ? fulfill(409, { detail: 'Des œufs réservés mais non livrés demandent un traitement distinct.' })
        : fulfill(200, quote);
    }
    if (path === '/transactions/7/cancel-remainder' && method === 'POST') {
      attempts += 1;
      expect(body).toMatchObject({
        expected_version: 3, quantite_en_attente_attendue: 400,
        montant_paye_attendu: '1500.00', date_effet_attendue: '2026-11-11',
      });
      expect(body.operation_id).toMatch(/^[0-9a-f-]{36}$/i);
      if (originalUUID === null) originalUUID = body.operation_id;
      expect(body.operation_id).toBe(originalUUID);
      if (mode === 'stale') {
        return fulfill(409, { detail: 'La quantité restante a changé. Actualisez la vente.' });
      }
      if (mode === 'network-retry' && attempts === 1) {
        canceled = true; // server COMMITTED, but client received no usable reply
        return fulfill(502, { detail: 'Connexion interrompue.' });
      }
      canceled = true;
      return fulfill(200, { ...receipt, rejoue: attempts > 1 });
    }
    if (path === '/transactions/7/completion-history') {
      return fulfill(200, canceled
        ? [{ id: 8, type: 'cancel_remainder', date: '2026-11-11',
          quantite: 400, montant_avoir: '600.00', repartition_stock: [] }]
        : []);
    }
    if (path === '/alerts/summary') return fulfill(200, { unread_count: 0 });
    return fulfill(200, []);
  });
  return {
    requests, errors,
    attempts: () => attempts,
    canceled: () => canceled,
    writeRequests: () => requests.filter(r => r.method !== 'GET'),
  };
}

for (const width of [390, 1280]) {
  test(`Release 4 browser: explicit cancellation updates credit and audit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 880 });
    const state = await mockPhase8Api(page, 'success');
    await page.goto('/livraisons-a-suivre?vente=7');
    const drawer = page.getByRole('dialog', { name: 'Vente #7' });
    await expect(drawer.getByText('Marché Central')).toBeVisible();
    const trigger = drawer.getByRole('button', { name: 'Annuler les œufs restants' });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Annuler les œufs restants ?' });
    await expect(dialog.getByText('Œufs à annuler')).toBeVisible();
    await expect(dialog.getByText('400 œufs')).toBeVisible();
    await expect(dialog.getByText('11/11/26')).toBeVisible();
    await expect(dialog.getByText(/Aucun remboursement ni mouvement de caisse/)).toBeVisible();
    expect(state.writeRequests()).toHaveLength(0);
    await dialog.getByRole('button', { name: "Confirmer l'annulation des œufs restants" }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.attempts()).toBe(1);
    await expect(drawer.getByText('Crédit client', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Montant net', { exact: true })).toBeVisible();
    await expect(drawer.getByText(/Avoir de .*600/)).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Annuler les œufs restants' })).toHaveCount(0);
    await drawer.getByRole('button', { name: 'Historique du stock et des avoirs' }).click();
    await expect(drawer.getByText('Annulation des œufs restants')).toBeVisible();
    await expect(drawer.getByText(/Avoir commercial : .*600/)).toBeVisible();
    await expect(page.getByText('Aucune livraison en attente de production.')).toBeVisible();
    await expect(drawer.getByText('Marché Central')).toBeVisible();
    expect(state.writeRequests()).toHaveLength(1);
    expect(state.errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('Release 4 browser: stale quote never submits a second write', async ({ page }) => {
  const state = await mockPhase8Api(page, 'stale');
  await page.goto('/livraisons-a-suivre?vente=7');
  const drawer = page.getByRole('dialog', { name: 'Vente #7' });
  await drawer.getByRole('button', { name: 'Annuler les œufs restants' }).click();
  const dialog = page.getByRole('dialog', { name: 'Annuler les œufs restants ?' });
  await expect(dialog.getByText('Œufs à annuler')).toBeVisible();
  await dialog.getByRole('button', { name: "Confirmer l'annulation des œufs restants" }).click();
  await expect(dialog.getByText(/quantité restante a changé/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Actualiser la vente' }).click();
  expect(state.writeRequests()).toHaveLength(1);
  expect(state.canceled()).toBe(false);
  expect(state.errors).toEqual([]);
});

test('Release 4 browser: lost reply preserves operation ID on retry', async ({ page }) => {
  const state = await mockPhase8Api(page, 'network-retry');
  await page.goto('/livraisons-a-suivre?vente=7');
  const drawer = page.getByRole('dialog', { name: 'Vente #7' });
  await drawer.getByRole('button', { name: 'Annuler les œufs restants' }).click();
  const dialog = page.getByRole('dialog', { name: 'Annuler les œufs restants ?' });
  await expect(dialog.getByText('Œufs à annuler')).toBeVisible();
  await dialog.getByRole('button', { name: "Confirmer l'annulation des œufs restants" }).click();
  await expect(dialog.getByText(/Connexion interrompue/)).toBeVisible();
  expect(state.canceled()).toBe(true);
  await dialog.getByRole('button', { name: 'Réessayer' }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.attempts()).toBe(2);
  const writes = state.writeRequests();
  expect(writes).toHaveLength(2);
  expect(writes[0].body).toEqual(writes[1].body);
  await expect(drawer.getByText('Crédit client', { exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('Release 4 browser: cannot confirm when reserved undelivered eggs make quote unsafe', async ({ page }) => {
  const state = await mockPhase8Api(page, 'unsupported');
  await page.goto('/livraisons-a-suivre?vente=7');
  const drawer = page.getByRole('dialog', { name: 'Vente #7' });
  await drawer.getByRole('button', { name: 'Annuler les œufs restants' }).click();
  const dialog = page.getByRole('dialog', { name: 'Annuler les œufs restants ?' });
  await expect(dialog.getByText(/réservés mais non livrés/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: "Confirmer l'annulation des œufs restants" })).toBeDisabled();
  expect(state.writeRequests()).toHaveLength(0);
  expect(state.errors).toEqual([]);
});
