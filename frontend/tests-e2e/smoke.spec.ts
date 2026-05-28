import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || 'admin.marwane@example.com';
const PASSWORD = process.env.E2E_PASSWORD || 'MarwaneLocalAdmin!2026';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');

  // If we're already authenticated (previous run), the app may redirect immediately.
  if (/\/dashboard$/.test(page.url())) return;

  // Login form uses MUI TextField with `name` attributes.
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe('UI smoke (non-technical user flows)', () => {
  test('Login -> dashboard loads without server error banner', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: /accueil quotidien/i })).toBeVisible();
    await expect(page.getByText(/impossible de contacter le serveur/i)).toHaveCount(0);
  });

  test('Navigate: Calendar + Tasks pages render', async ({ page }) => {
    await login(page);

    await page.goto('/calendar');
    await expect(page.getByRole('heading', { name: /calendrier/i })).toBeVisible();
    await expect(page.getByText(/impossible de contacter le serveur/i)).toHaveCount(0);

    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: /mes t[aâ]ches/i })).toBeVisible();
    await expect(page.getByText(/impossible de contacter le serveur/i)).toHaveCount(0);
  });

  test('Navigate: Production overview and batiment page render', async ({ page }) => {
    await login(page);

    await page.goto('/production');
    await expect(page.getByRole('heading', { name: /production & stock/i })).toBeVisible();
    await expect(page.getByText(/impossible de contacter le serveur/i)).toHaveCount(0);

    // Go to batiment 1 directly (stable path in this environment)
    await page.goto('/production/batiment/1');
    await expect(page.getByText(/stock du b[aâ]timent/i)).toBeVisible();
    await expect(page.getByText(/impossible de contacter le serveur/i)).toHaveCount(0);
  });

  test('Navigate: Transactions list renders with table-like layout', async ({ page }) => {
    await login(page);

    await page.goto('/transactions');
    await expect(page.getByRole('heading', { name: /transactions/i })).toBeVisible();
    await expect(page.getByText(/impossible de contacter le serveur/i)).toHaveCount(0);

    // Table should be present (either a real table or a grid with column headers)
    const maybeTable = page.locator('table, [role=\"table\"], [data-testid*=\"table\"], [class*=\"Table\"]').first();
    await expect(maybeTable).toBeVisible();
  });

  test('Navigate: LC, Bank, Caisse pages render and show key cards', async ({ page }) => {
    await login(page);

    await page.goto('/lettres-credit');
    await expect(page.getByRole('heading', { name: /lettres de cr[ée]dit/i })).toBeVisible();
    await expect(page.getByText(/impossible de contacter le serveur/i)).toHaveCount(0);

    await page.goto('/comptes-bancaires');
    await expect(page.getByRole('heading', { name: /comptes bancaires/i })).toBeVisible();
    await expect(page.getByText(/impossible de contacter le serveur/i)).toHaveCount(0);

    await page.goto('/caisse');
    await expect(page.getByRole('heading', { name: 'Caisse', exact: true })).toBeVisible();
    await expect(page.getByText(/total disponible/i)).toBeVisible();
    await expect(page.getByText(/impossible de contacter le serveur/i)).toHaveCount(0);
  });
});
