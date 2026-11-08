import { expect, test } from '@playwright/test';

// Foundation checks only. Real account/workout journeys are added with their UI
// checkpoints; a passing smoke run is never evidence of saved workout behavior.
test('both local servers respond and the mobile shell has no blocking errors', async ({ page, request }) => {
  const clientErrors: string[] = [];
  page.on('pageerror', (error) => clientErrors.push(error.message));
  const health = await request.get('http://127.0.0.1:8000/api/v1/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ data: { status: 'ok' }, error: null });

  // Every page except sign-in/sign-up is private, so a signed-out visit to the
  // dashboard lands on sign-in and remembers nothing else.
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('main')).toBeVisible();
  expect(clientErrors).toEqual([]);
});

test('the API rejects unauthenticated personal-data requests', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:8000/api/v1/session');
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.data).toBeNull();
  expect(body.error.code).toBeTruthy();
});
