import { test, expect } from '@playwright/test';
const headers = (role: string) => ({ 'x-tripwire-client': 'web', 'x-tripwire-role': role });

test('payment details collapse independently while decisions stay available', async ({ page, request }) => {
  await request.post('/api/session', { headers: headers('guardian'), data: { role: 'guardian' } });
  await request.post('/api/demo/reset', { headers: headers('guardian'), data: {} });
  await request.post('/api/session', { headers: headers('protected'), data: { role: 'protected' } });
  for (const payee of ['First request', 'Second request']) {
    const response = await request.post('/api/payments', { headers: headers('protected'), data: { payee, amount: 2500, rail: 'gift-card', newPayee: true } });
    expect(response.ok()).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/guardian');
  const first = page.locator('.payment-item').filter({ has: page.getByRole('heading', { name: 'First request' }) });
  const second = page.locator('.payment-item').filter({ has: page.getByRole('heading', { name: 'Second request' }) });
  await expect(first).toBeVisible();
  await expect(first.locator('.payment-summary')).toBeHidden();
  await expect(second.locator('.payment-summary')).toBeHidden();
  await expect(first.getByRole('button', { name: 'Approve after verifying' })).toBeVisible();
  await expect(first.getByRole('button', { name: 'Deny payment', exact: true })).toBeVisible();
  const collapsedHeight = (await first.boundingBox())!.height;
  await first.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(first.locator('.payment-summary')).toBeVisible();
  expect((await first.boundingBox())!.height).toBeGreaterThan(collapsedHeight);
  await expect(second.locator('.payment-summary')).toBeHidden();
  await first.locator('summary').click();
  await expect(first.locator('.payment-summary')).toBeHidden();
  await first.getByRole('button', { name: 'Deny payment', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Deny payment', exact: true }).click();
  await expect(first.getByText('HEIST FOILED', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
