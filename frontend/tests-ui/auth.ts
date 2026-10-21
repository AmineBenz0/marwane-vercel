import type { Page } from '@playwright/test';

// Exercise the application's real refresh-on-start path with a synthetic session.
export async function mockAuthenticatedSession(page: Page) {
  const payload = Buffer.from(JSON.stringify({ sub: '1', email: 'ui-test@example.com', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const accessToken = `test.${payload}.test`;
  const refreshToken = 'ui-test-refresh-token';
  await page.addInitScript(({ accessToken, refreshToken }) => {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
  }, { accessToken, refreshToken });
  await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken, token_type: 'bearer' }) }));
}
