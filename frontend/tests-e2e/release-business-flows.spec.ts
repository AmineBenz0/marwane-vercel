import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const MUTATION_TESTS_ENABLED = process.env.E2E_MUTATION_TESTS === 'true';

async function login(page: Page) {
  await page.goto('/login');
  if (/\/dashboard$/.test(page.url())) return;

  await page.locator('input[name="email"]').fill(EMAIL || '');
  await page.locator('input[name="password"]').fill(PASSWORD || '');
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function api<T>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  return page.evaluate(async ({ method: requestMethod, path: requestPath, body: requestBody }) => {
    const token = window.localStorage.getItem('access_token');
    const response = await window.fetch(`/api/v1${requestPath}`, {
      method: requestMethod,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(requestBody === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!response.ok) {
      throw new Error(`${requestMethod} ${requestPath} failed (${response.status}): ${text}`);
    }
    return data;
  }, { method, path, body }) as Promise<T>;
}

test.describe('Authenticated release business workflows', () => {
  test.beforeEach(async ({}, testInfo) => {
    testInfo.skip(
      !EMAIL || !PASSWORD || !MUTATION_TESTS_ENABLED,
      'Set E2E_EMAIL, E2E_PASSWORD, and E2E_MUTATION_TESTS=true against a disposable staging target',
    );
  });

  test('client, supplier, payments, charge allocation, BOM costing, and report flow', async ({ page }) => {
    await login(page);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const today = new Date().toISOString().slice(0, 10);

    const client = await api<{ id_client: number }>(page, 'POST', '/clients', {
      nom_client: `E2E Client ${suffix}`,
      est_actif: true,
    });
    const supplier = await api<{ id_fournisseur: number }>(page, 'POST', '/fournisseurs', {
      nom_fournisseur: `E2E Fournisseur ${suffix}`,
      est_actif: true,
    });
    const bank = await api<{ id_compte: number }>(page, 'POST', '/comptes-bancaires', {
      nom_banque: `E2E Banque ${suffix}`,
      numero_compte: `E2E-${suffix}`,
      solde_initial: 100,
    });
    const service = await api<{ id_produit: number }>(page, 'POST', '/produits', {
      nom_produit: `E2E Service ${suffix}`,
      type_produit: 'service',
      pour_clients: true,
      pour_fournisseurs: false,
    });
    const raw = await api<{ id_produit: number }>(page, 'POST', '/produits', {
      nom_produit: `E2E Matiere ${suffix}`,
      type_produit: 'matiere_premiere',
      pour_clients: false,
      pour_fournisseurs: true,
    });
    const finished = await api<{ id_produit: number }>(page, 'POST', '/produits', {
      nom_produit: `E2E Produit fini ${suffix}`,
      type_produit: 'produit_fini',
      pour_clients: true,
      pour_fournisseurs: false,
    });

    const sale = await api<{ id_transaction: number }>(page, 'POST', '/transactions', {
      date_transaction: today,
      date_echeance: today,
      id_produit: service.id_produit,
      quantite: 1,
      prix_unitaire: 100,
      id_client: client.id_client,
    });
    const firstPaymentKey = `e2e-payment-${suffix}`;
    const firstPayment = await api<{ id_paiement: number }>(page, 'POST', '/paiements', {
      id_transaction: sale.id_transaction,
      date_paiement: today,
      montant: 40,
      type_paiement: 'cash',
      cle_idempotence: firstPaymentKey,
    });
    const repeatedPayment = await api<{ id_paiement: number }>(page, 'POST', '/paiements', {
      id_transaction: sale.id_transaction,
      date_paiement: today,
      montant: 40,
      type_paiement: 'cash',
      cle_idempotence: firstPaymentKey,
    });
    expect(repeatedPayment.id_paiement).toBe(firstPayment.id_paiement);
    await api(page, 'POST', '/paiements', {
      id_transaction: sale.id_transaction,
      date_paiement: today,
      montant: 60,
      type_paiement: 'cash',
      cle_idempotence: `e2e-payment-2-${suffix}`,
    });
    const paymentSummary = await api<{ statut_paiement: string; montant_restant: string }>(
      page,
      'GET',
      `/transactions/${sale.id_transaction}/payment-summary`,
    );
    expect(paymentSummary.statut_paiement).toBe('paye');
    expect(Number(paymentSummary.montant_restant)).toBe(0);

    await api(page, 'POST', '/transactions', {
      date_transaction: today,
      id_produit: raw.id_produit,
      quantite: 10,
      prix_unitaire: 4,
      id_fournisseur: supplier.id_fournisseur,
    });
    await api(page, 'POST', '/charges', {
      libelle: `E2E Charge ${suffix}`,
      montant: 50,
      date_charge: today,
      categorie: 'Divers',
      id_compte: bank.id_compte,
    });
    const accounts = await api<Array<{ id_compte: number; solde_actuel: string }>>(page, 'GET', '/comptes-bancaires');
    expect(Number(accounts.find((item) => item.id_compte === bank.id_compte)?.solde_actuel)).toBe(50);

    const bom = await api<{ id_nomenclature: number }>(page, 'POST', '/product-boms', {
      id_produit_sortie: finished.id_produit,
      version: 1,
      quantite_sortie: 1,
      lignes: [{ id_produit_entree: raw.id_produit, quantite: 2 }],
    });
    const transformation = await api<{ id_transformation: number }>(page, 'POST', '/transformations', {
      date_transformation: today,
      id_nomenclature: bom.id_nomenclature,
      quantite_sortie: 3,
      cle_idempotence: `e2e-transformation-${suffix}`,
    });
    expect(transformation.id_transformation).toBeTruthy();
    const stock = await api<Array<{ id_produit: number; quantite_disponible: string }>>(page, 'GET', '/stock');
    expect(Number(stock.find((item) => item.id_produit === raw.id_produit)?.quantite_disponible)).toBe(4);
    expect(Number(stock.find((item) => item.id_produit === finished.id_produit)?.quantite_disponible)).toBe(3);

    await page.goto('/creances');
    await expect(page.getByRole('heading', { name: /créances clients/i })).toBeVisible();
    await expect(page.getByText(`E2E Client ${suffix}`)).toBeVisible();
    await page.goto('/dettes');
    await expect(page.getByRole('heading', { name: /dettes fournisseurs/i })).toBeVisible();
    await page.goto('/production/boms');
    await expect(page.getByRole('heading', { name: /bom & transformations/i })).toBeVisible();
    await page.goto('/rapports/mensuel');
    await expect(page.getByRole('heading', { name: /rapport mensuel/i })).toBeVisible();
    await expect(page.getByText('Variation nette stock')).toBeVisible();
  });
});

test.describe('Responsive release smoke', () => {
  test.beforeEach(async ({}, testInfo) => {
    testInfo.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL and E2E_PASSWORD must be configured');
  });

  test('finance and production pages do not overflow the viewport', async ({ page }) => {
    await login(page);
    for (const route of ['/creances', '/dettes', '/production/boms', '/rapports/mensuel']) {
      await page.goto(route);
      await expect(page.locator('body')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} has horizontal overflow`).toBeLessThanOrEqual(1);
    }
  });
});
