import { test, expect } from '@playwright/test';

// Run against `vite preview` to exercise the production bundle's icon imports.
// API fixtures keep this check independent of real farm records and credentials.
test('compiled dashboard renders pending deliveries and opens their filtered list', async ({ page, baseURL }) => {
  test.skip(!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Local preview with API fixtures only');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const token = `e30.${Buffer.from(JSON.stringify({ sub: '1', email: 'bundle-test@example.invalid', role: 'admin', exp: 4102444800 })).toString('base64url')}.fixture`;
  const sale = {
    id_client: 1, id_fournisseur: null, id_produit: 1, id_batiment: 1,
    est_actif: true, est_promesse: true, allocation_automatique: true,
    quantite: 70, quantite_couverte: 65, quantite_en_attente: 5, quantite_reservee: 65,
    prix_unitaire: 1.5, montant_total: 105, montant_paye: 0, montant_restant: 105,
    statut_paiement: 'impaye', date_transaction: '2026-10-26', paiements: [],
  };
  const sales = [
    { ...sale, id_transaction: 1 },
    { ...sale, id_transaction: 2, id_client: 2, quantite: 50, quantite_couverte: 0, quantite_reservee: 0, quantite_en_attente: 50 },
    { ...sale, id_transaction: 3, id_client: 3, quantite_couverte: 70, quantite_en_attente: 0 },
    { ...sale, id_transaction: 4, id_client: 3, est_actif: false },
  ];
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path.startsWith('/auth/')) data = { access_token: token, refresh_token: 'local-fixture', token_type: 'bearer' };
    else if (path === '/health/ready' || path === '/health/live') data = { status: 'ok' };
    else if (path === '/transactions/deferred-sales') data = sales.map(row => ({ ...row, nom_client: `Client ${row.id_client}`, nom_produit: 'Œufs moyens' }));
    else if (path === '/transactions') data = sales;
    else if (path === '/clients') data = [1, 2, 3].map(id => ({ id_client: id, nom_client: `Client ${id}` }));
    else if (path === '/produits') data = [{ id_produit: 1, nom_produit: 'Œufs moyens' }];
    else if (path === '/batiments') data = [{ id_batiment: 1, nom: 'Bâtiment A' }];
    else if (path === '/caisse/solde/complet') data = { solde_reel: 1000, solde_theorique: 1000 };
    return route.fulfill({ json: data });
  });
  await page.goto('/login');
  await page.locator('input[name="email"]').fill('bundle-test@example.invalid');
  await page.locator('input[name="password"]').fill('Local-fixture-123');
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const card = page.getByRole('region', { name: 'Livraisons différées' });
  await expect(card.getByText('2 ventes · 55 œufs à produire')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Voir les livraisons' })).toBeVisible();
  await expect(card.locator('svg')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card.getByRole('button', { name: 'Voir les livraisons' })).toBeVisible();
  const bounds = await card.boundingBox();
  expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390).toBeTruthy();
  await card.getByRole('button', { name: 'Voir les livraisons' }).click();
  await expect(page).toHaveURL(/\/transactions\?view=deferred&stock=pending$/);
  await expect(page.getByRole('button', { name: 'À produire', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Client 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Client 2', { exact: true })).toBeVisible();
  await expect(page.getByText('Client 3', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
