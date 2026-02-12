import { test, expect } from '@playwright/test';

test('shows workshop waiting screen when no team is active', async ({ page }) => {
  await page.goto('/');

  // The app should show the "no team" state with the workshop title
  await expect(page.locator('text=Workshop in the Woods')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=Waiting for an agent team')).toBeVisible();
});

test('page loads without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.goto('/');
  await page.waitForTimeout(2000);

  // Filter out expected WebSocket reconnection errors (server may not push data)
  const realErrors = errors.filter(
    (e) => !e.includes('WebSocket') && !e.includes('ws://') && !e.includes('ERR_CONNECTION_REFUSED')
  );
  expect(realErrors).toEqual([]);
});
