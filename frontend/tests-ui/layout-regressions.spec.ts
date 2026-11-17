import { expect, test } from '@playwright/test';
import { mockAuthenticatedSession } from './auth';

test.beforeEach(async ({ page }) => {
  await mockAuthenticatedSession(page);
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/refresh') return route.fallback();
    if (path === '/api/v1/alerts/summary') return route.fulfill({ json: { unread_count: 0 } });
    if (path === '/api/v1/produits') {
      return route.fulfill({ json: [
        { id_produit: 1, nom_produit: 'Produit vendu', usage: 'vendu' },
        { id_produit: 2, nom_produit: 'Produit acheté', usage: 'achete' },
      ] });
    }
    return route.fulfill({ json: [] });
  });
});

test('the mobile menu, complete search field and alerts have separate space', async ({ page }) => {
  await page.goto('/clients');
  for (const width of [320, 390, 768, 899]) {
    await page.setViewportSize({ width, height: 900 });
    const menu = page.getByRole('button', { name: 'Ouvrir le menu' });
    const search = page.getByRole('textbox', { name: 'Recherche globale' });
    const alerts = page.getByRole('button', { name: 'Ouvrir les alertes' });
    await expect(menu).toBeVisible();
    const fieldBounds = await search.evaluate(input => input.parentElement!.getBoundingClientRect().toJSON());
    const menuBounds = (await menu.boundingBox())!;
    const alertBounds = (await alerts.boundingBox())!;
    expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(fieldBounds.left);
    expect(fieldBounds.right).toBeLessThanOrEqual(alertBounds.x);
    expect(alertBounds.x + alertBounds.width).toBeLessThanOrEqual(width);
  }
});

test('the product filter stays visible and works at tablet widths', async ({ page }) => {
  await page.goto('/produits');
  const filter = page.getByRole('combobox', { name: 'Utilisation' });
  const search = page.getByPlaceholder('Rechercher un produit');
  for (const width of [320, 390, 599, 600, 768, 899, 900, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(filter).toBeVisible();
    const bounds = await filter.evaluate(element => {
      const control = element.closest('.MuiFormControl-root')!;
      const container = control.closest('.MuiCard-root')!;
      return { control: control.getBoundingClientRect().right, container: container.getBoundingClientRect().right };
    });
    expect(bounds.control).toBeLessThanOrEqual(bounds.container);
    expect(bounds.control).toBeLessThanOrEqual(width);
    await expect(search).toBeVisible();
  }
  await page.setViewportSize({ width: 768, height: 900 });
  await filter.click();
  await page.getByRole('option', { name: 'Vendus' }).click();
  await expect(page.getByText('Produit vendu', { exact: true })).toBeVisible();
  await expect(page.getByText('Produit acheté', { exact: true })).toHaveCount(0);
  await search.fill('acheté');
  await expect(page.getByText('Produit vendu', { exact: true })).toHaveCount(0);
  await filter.click();
  await page.getByRole('option', { name: 'Tous les produits' }).click();
  await expect(page.getByText('Produit acheté', { exact: true })).toBeVisible();
});

test('the transaction header keeps all actions inside the page and opens the form on mobile', async ({ page }) => {
  await page.goto('/transactions');
  const title = page.getByRole('heading', { level: 1, name: 'Ventes & achats' });
  const header = page.locator('header').filter({ has: title });
  const create = header.getByRole('button', { name: 'Nouvelle transaction' });
  const actions = header.getByRole('button');

  await expect(actions).toHaveCount(3);
  for (const width of [320, 390, 600, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = (await header.boundingBox())!;
    for (const action of await actions.all()) {
      await expect(action).toBeVisible();
      const button = (await action.boundingBox())!;
      expect(button.x).toBeGreaterThanOrEqual(bounds.x);
      expect(button.x + button.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
      if (width < 600) expect(button.height).toBeGreaterThanOrEqual(44);
    }
  }

  await page.setViewportSize({ width: 320, height: 900 });
  await create.click();
  await expect(page.getByRole('dialog').getByText('Nouvelle transaction', { exact: true })).toBeVisible();
});

test('mobile navigation, search results and alerts open and close independently', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 680 });
  await page.route('**/api/v1/search?*', route => route.fulfill({ json: {
    results: [{ kind: 'produit', id: 1, label: 'Catalogue de test', href: '/produits' }],
  } }));
  await page.goto('/clients');

  const menu = page.getByRole('button', { name: 'Ouvrir le menu' });
  await menu.click();
  const drawer = page.locator('#mobile-navigation');
  await expect(drawer.getByRole('button', { name: 'Clients', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();

  const search = page.getByRole('textbox', { name: 'Recherche globale' });
  const result = page.getByRole('button', { name: /Catalogue de test/ });
  await search.fill('catalogue');
  await expect(result).toBeVisible();
  await search.press('Tab');
  await expect(result).toBeFocused();
  await result.press('Escape');
  await expect(result).toBeHidden({ timeout: 2000 });
  await expect(search).toBeFocused();

  await search.fill('catalogues');
  await expect(result).toBeVisible();
  await page.getByRole('heading', { name: 'Clients', exact: true }).click({ position: { x: 5, y: 10 } });
  await expect(result).toBeHidden();

  await page.getByRole('button', { name: 'Ouvrir les alertes' }).click();
  await expect(page.getByText('Aucune alerte.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Aucune alerte.')).toBeHidden();

  await search.focus();
  await result.click();
  await expect(page).toHaveURL(/\/produits$/);
  await expect(search).toHaveValue('');
});

for (const type of ['client', 'fournisseur'] as const) {
  test(`the ${type} empty state opens a named and labelled form on a narrow phone`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 680 });
    await page.goto(type === 'client' ? '/clients' : '/fournisseurs');
    await expect(page.getByRole('heading', { name: `Aucun ${type} trouvé` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exporter Excel' })).toBeDisabled();

    const create = page.getByRole('button', { name: `Nouveau ${type}` });
    await create.click();
    const dialog = page.getByRole('dialog', { name: `Nouveau ${type}` });
    const name = dialog.getByRole('textbox', { name: `Nom du ${type}`, exact: true });
    await expect(name).toBeVisible({ timeout: 2000 });
    const submit = dialog.getByRole('button', { name: `Créer le ${type}` });
    await expect(submit).toBeDisabled();
    await name.fill('  ');
    await submit.click();
    await expect(dialog.getByText(`Le nom du ${type} est requis`)).toBeVisible();
    await dialog.getByRole('button', { name: 'Fermer le formulaire' }).click();
    await expect(dialog).toBeHidden();
    await expect(create).toBeFocused();
  });
}

test('navigation keeps the desktop sidebar collapsed between pages', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/clients');
  await page.getByRole('button', { name: 'Réduire la navigation' }).click();
  await page.getByRole('button', { name: 'Produits', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Produits' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Développer la navigation' })).toBeVisible();
});

test('a contact list that fails to load offers a retry instead of an empty result', async ({ page }) => {
  let available = false;
  await page.route('**/api/v1/clients?*', route => available
    ? route.fulfill({ json: [{ id_client: 1, nom_client: 'Client rétabli', outstanding_balance: 0 }] })
    : route.fulfill({ status: 500, json: { detail: 'Chargement indisponible' } }));
  await page.goto('/clients');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aucun client trouvé' })).toHaveCount(0);
  available = true;
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByRole('link', { name: 'Voir le profil de Client rétabli' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
