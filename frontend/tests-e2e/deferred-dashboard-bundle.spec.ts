import { test, expect } from '@playwright/test';

// Run against `vite preview` to exercise the production bundle's icon imports.
// API fixtures keep this check independent of real farm records and credentials.
test('compiled dashboard opens delivery cards, details and return navigation', async ({ page, baseURL }) => {
  test.skip(!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Local preview with API fixtures only');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const token = `e30.${Buffer.from(JSON.stringify({ sub: '1', email: 'bundle-test@example.invalid', role: 'admin', exp: 4102444800 })).toString('base64url')}.fixture`;
  const sale = {
    id_client: 1, id_fournisseur: null, id_produit: 1, id_batiment: 1,
    est_actif: true, est_promesse: true, allocation_automatique: true,
    quantite: 70, quantite_couverte: 65, quantite_en_attente: 5, quantite_reservee: 65,
    prix_unitaire: 1.5, montant_total: 105, montant_paye: 0, montant_restant: 105,
    statut_paiement: 'impaye', date_transaction: '2026-10-26', date_livraison_prevue: '2026-10-27', paiements: [],
    repartition_stock: [{ id_production: 1, date_production: '2026-10-25', quantite: 65 }],
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
    else if (path.endsWith('/completion-history')) data = [
      { id: 'initial', type: 'initial', date: '2026-10-26', quantite: 60, operateur: 'Admin', repartition_stock: [{ id_production: 1, date_production: '2026-10-25', quantite: 60 }] },
      { id: 2, type: 'reservation', date: '2026-10-27', quantite: 5, operateur: 'Admin', repartition_stock: [{ id_production: 2, date_production: '2026-10-27', quantite: 5 }] },
    ];
    else if (path === '/transactions') data = sales;
    else if (/^\/transactions\/\d+$/.test(path)) data = sales.find(row => row.id_transaction === Number(path.split('/').pop()));
    else if (/^\/paiements\/transaction\/\d+\/statut$/.test(path)) data = sale;
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
  await expect(page).toHaveURL(/\/livraisons-a-suivre$/);
  await expect(page.getByRole('heading', { name: 'Livraisons à suivre' })).toBeVisible();
  await expect(page.getByText('Client 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Client 2', { exact: true })).toBeVisible();
  await expect(page.getByText('Client 3', { exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Rechercher un client' }).fill('Client 2');
  await expect(page.getByRole('button', { name: /Voir le détail de la vente #1/ })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Rechercher un client' }).fill('');
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: /Voir le détail de la vente #1/ }).click();
    const detail = page.getByRole('dialog', { name: 'Vente #1', exact: true });
    await expect(detail.getByRole('heading', { name: 'Production utilisée' })).toBeVisible();
    await expect(detail).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(detail.getByRole('heading', { name: 'Vente #1', exact: true })).toHaveCSS('color', 'rgb(15, 23, 42)');
    await expect(detail.getByText('65 œufs', { exact: true })).toBeVisible();
    const drawerBounds = await detail.boundingBox();
    expect(drawerBounds && drawerBounds.x >= 0 && drawerBounds.x + drawerBounds.width <= width + 1).toBeTruthy();
    if (width === 390) await expect(detail).toHaveCSS('width', '390px');
    const historyButton = detail.getByRole('button', { name: 'Historique des réservations' });
    await historyButton.click();
    await expect(historyButton).toHaveAttribute('aria-expanded', 'true');
    await expect(detail.getByText('Production du 27/10/26')).toBeVisible();
    await expect(detail.getByText('Enregistré par Admin')).toHaveCount(2);
    await expect(detail.getByRole('button', { name: 'Origine du stock' })).toHaveCount(0);
    await expect(detail.getByRole('heading', { name: 'Suivi du stock' })).toHaveCount(0);
    const history = detail.getByRole('region', { name: 'Suivi du stock' });
    await expect(history.locator('xpath=ancestor::*[contains(@class, "MuiCollapse-root")]')).toHaveClass(/MuiCollapse-entered/);
    const historyBounds = await history.boundingBox();
    expect(historyBounds && historyBounds.x >= 0 && historyBounds.x + historyBounds.width <= width + 1).toBeTruthy();
    expect(await history.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
    if (width === 390) await page.screenshot({ path: '/workspace/scratch/c8c21a888029/reservation-history-mobile.png', fullPage: true });
    if (width === 1280) await page.screenshot({ path: '/workspace/scratch/c8c21a888029/reservation-history-desktop.png', fullPage: true });
    await detail.getByRole('button', { name: 'Fermer le détail' }).click();
    await expect(detail).toHaveCount(0);
  }
  await page.getByRole('button', { name: /Voir le détail de la vente #1/ }).click();
  await page.getByRole('button', { name: 'Ouvrir la vente et ses paiements' }).click();
  await expect(page).toHaveURL(/\/transactions\/1\?from=deliveries$/);
  await page.getByRole('button', { name: 'Retour aux livraisons' }).click();
  await expect(page.getByRole('dialog', { name: 'Vente #1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer le détail' }).click();
  await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(errors).toEqual([]);
});
