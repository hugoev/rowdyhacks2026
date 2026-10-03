import { test, expect, type APIRequestContext } from '@playwright/test';
const headers = (role: string) => ({ 'x-tripwire-client': 'web', 'x-tripwire-role': role });
async function login(api: APIRequestContext, role: string) { await api.post('/api/session', { headers: headers(role), data: { role } }); }
test.beforeEach(async ({ request }) => { await login(request, 'guardian'); await request.post('/api/demo/reset', { headers: headers('guardian'), data: {} }); });

test('unauthenticated and wrong-role callers cannot approve payments', async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:3101' });
  const guest = await api.get('/api/state', { headers: headers('guardian') }); expect(guest.status()).toBe(401);
  await login(api, 'protected');
  const denied = await api.post('/api/payments/decide', { headers: headers('protected'), data: { id: '00000000-0000-4000-8000-000000000000', decision: 'approve' } }); expect(denied.status()).toBe(403);
  const csrf = await api.post('/api/call/start', { headers: { ...headers('protected'), Origin: 'https://attacker.example' }, data: { consent: true } }); expect(csrf.status()).toBe(403); await api.dispose();
});

for (let run = 1; run <= 3; run++) test(`grandson demo completes across three views — run ${run}`, async ({ browser }) => {
  const context = await browser.newContext(); const rosa = await context.newPage(); const guardian = await context.newPage(); const relative = await context.newPage();
  await guardian.goto('/guardian'); await expect(guardian.getByRole('heading', { name: 'Every second counts.' })).toBeVisible();
  await relative.goto('/relative'); await expect(relative.getByRole('heading', { name: 'You’re part of her safety net.' })).toBeVisible();
  await rosa.goto('/protected'); await rosa.getByLabel('Read critical warnings aloud').uncheck();
  await rosa.getByRole('button', { name: 'Start scripted demo' }).click();
  await rosa.getByRole('button', { name: 'Next scripted line' }).click();
  await rosa.getByRole('button', { name: 'Next scripted line' }).click();
  await expect(guardian.getByText('Keep-it-secret request', { exact: true })).toBeVisible();
  await rosa.getByRole('button', { name: 'Check with Alex' }).click();
  await expect(relative.getByRole('button', { name: 'No, that’s not me' })).toBeVisible();
  await relative.getByRole('button', { name: 'No, that’s not me' }).click();
  await expect(rosa.getByText('Alex says: “That isn’t me calling.” Hang up and call his saved number.')).toBeVisible();
  await rosa.getByRole('button', { name: 'Check & send demo payment' }).click();
  await expect(rosa.getByRole('heading', { name: 'Your money can wait.' })).toBeVisible();
  await guardian.getByRole('button', { name: 'Deny payment', exact: true }).click();
  await guardian.getByRole('dialog').getByRole('button', { name: 'Deny payment' }).click();
  await expect(rosa.getByRole('heading', { name: 'Elena stopped this payment.' })).toBeVisible();
  await expect(guardian.locator('.payment-item').getByText('HEIST FOILED', { exact: true })).toBeVisible();
  await guardian.goto('/cases'); await expect(guardian.getByRole('heading', { name: 'The Grandson Job' })).toBeVisible();
  await context.close();
});

test('normal $40 bill completes with no friction', async ({ page }) => {
  await page.goto('/protected'); await page.getByRole('button', { name: 'Try a $40 bill' }).click(); await page.getByRole('button', { name: 'Check & send demo payment' }).click();
  await expect(page.getByRole('heading', { name: 'Demo payment completed.' })).toBeVisible(); await expect(page.getByText('PAYMENT HELD', { exact: true })).toHaveCount(0);
});
test('safe word setup and incorrect answer escalate the call', async ({ page }) => {
  await page.goto('/settings');
  if (await page.getByRole('button', { name: 'Set safe word', exact: true }).isVisible()) { await page.getByLabel('Your family word').fill('marigold'); await page.getByRole('button', { name: 'Set safe word', exact: true }).click(); }
  await page.goto('/protected'); await page.getByLabel('Read critical warnings aloud').uncheck(); await page.getByRole('button', { name: 'Start scripted demo' }).click();
  await page.getByLabel('What word did they say?').fill('wrong answer'); await page.getByRole('button', { name: 'Check their answer' }).click();
  await expect(page.getByText('That word did not match. Please hang up and call Alex.')).toBeVisible(); await expect(page.getByText(/CRITICAL ·/)).toBeVisible();
});
test('Inspector flags a romance sample and does not mislabel an ordinary message', async ({ page }) => {
  await page.goto('/inspector'); await page.getByRole('button', { name: 'Romance · plane ticket' }).click(); await page.getByRole('button', { name: 'Inspect this message' }).click();
  await expect(page.getByRole('heading', { name: 'Strong scam warning signs' })).toBeVisible();
  await page.getByRole('button', { name: 'Dinner plans', exact: true }).click(); await page.getByRole('button', { name: 'Inspect this message' }).click();
  await expect(page.getByRole('heading', { name: 'No red flags found' })).toBeVisible();
});
test('phone layouts have no horizontal overflow and navigation works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/guardian', '/protected', '/relative', '/inspector', '/settings', '/cases']) {
    await page.goto(route); await expect(page.locator('main h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'Open navigation' }).click(); await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'The Inspector' }).click();
  await expect(page.getByRole('heading', { name: 'Something feel off?' })).toBeVisible();
});
