import { test, expect, type Page } from '@playwright/test';
const post = (page: Page, path: string, data: unknown = {}) => page.request.post('/api' + path, { headers: { 'x-tripwire-client': 'web' }, data });
test.beforeEach(async ({ page }) => { await post(page, '/operator/reset'); });

test('home opens the dashboard and the demo enters through the vault', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Before the money moves.' })).toBeVisible();
  await page.getByRole('link', { name: 'Demo', exact: true }).click();
  await expect(page).toHaveURL('/demo');
  await expect(page.locator('.vault-transition')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start the demo' })).toBeVisible();
  await expect(page.locator('.vault-transition')).toHaveCount(0);
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Before the money moves.' })).toBeVisible();
});

test('demo respects reduced-motion preferences', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/demo');
  await expect(page.getByRole('button', { name: 'Start the demo' })).toBeVisible();
  await expect(page.locator('.vault-transition')).toHaveCount(0);
});

test('acceptance 1: $40 to City Electric sends with no Tripwire', async ({ page }) => {
  await page.goto('/bank');
  await page.getByRole('button', { name: 'Send money' }).click();
  await page.getByRole('button', { name: /City Electric · \$40/ }).click();
  await page.getByRole('button', { name: 'Send $40' }).click();
  await expect(page.getByRole('heading', { name: 'Sent.' })).toBeVisible();
  await expect(page.getByText('No red flags found.')).toBeVisible();
  await expect(page.getByText(/safety teller/)).toHaveCount(0);
});

for (let run = 1; run <= 3; run++) test(`acceptance 2-6 (teller offline): callback, backup result, saved review, reset — run ${run}`, async ({ browser }) => {
  const context = await browser.newContext({ permissions: ['microphone'] });
  const rosa = await context.newPage(); const diego = await context.newPage(); const monitor = await context.newPage(); const operator = await context.newPage();
  await operator.goto('/demo'); await expect(operator.getByRole('button', { name: 'Start the demo' })).toBeVisible();
  await monitor.goto('/calls'); await expect(monitor.getByRole('heading', { name: 'Saved calls.' })).toBeVisible();
  await diego.goto('/call?who=diego'); await diego.getByRole('button', { name: 'Ready' }).click(); await expect(diego.getByText('Ready. Ringer on.')).toBeVisible();
  await rosa.goto('/bank');
  await rosa.getByRole('button', { name: 'Send money' }).click();
  await expect(rosa.getByLabel('To', { exact: true })).toHaveValue('M. Ellis Legal');
  await rosa.getByRole('button', { name: 'Send $2,500' }).click();
  await expect(rosa.getByText('Tripwire · your bank’s safety teller')).toBeVisible();
  // Without a Gemini key the teller is offline; the money stays put while family is checked.
  await expect(rosa.getByText('Your money is staying put while we check with your family.')).toBeVisible();
  await expect(operator.getByText('29×')).toBeVisible();
  const rang = Date.now();
  await post(operator, '/operator/call-diego');
  await expect(diego.getByText('Incoming call')).toBeVisible(); expect(Date.now() - rang).toBeLessThan(2000);
  await expect(diego.getByRole('heading', { name: 'Tripwire · Rosa’s bank' })).toBeVisible();
  await expect(rosa.getByText('Calling Diego…')).toBeVisible();
  await operator.getByRole('button', { name: 'Backup: Diego says “not me”' }).click();
  await expect(rosa.getByRole('heading', { name: 'Your $2,500 is safe.' })).toBeVisible();
  await expect(rosa.getByText('They pretended to be Diego.')).toBeVisible();
  await expect(monitor.getByRole('heading', { name: 'The Rush Job' }).first()).toBeVisible();
  await monitor.getByText('Review call', { exact: true }).first().click();
  await expect(monitor.getByText('FOILED', { exact: true }).first()).toBeVisible();
  await expect(monitor.getByText('Tripwire called the real Diego on his saved number').first()).toBeVisible();
  if (run === 1) { await rosa.screenshot({ path: 'test-results/rosa-safe.png' }); await monitor.screenshot({ path: 'test-results/case-file.png' }); }
  const reset = Date.now();
  await operator.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(rosa.getByRole('heading', { name: 'Hello, Rosa.' })).toBeVisible(); expect(Date.now() - reset).toBeLessThan(1000);
  await context.close();
});

test('RING ROSA rings Rosa’s phone with Diego as the caller ID', async ({ browser }) => {
  const context = await browser.newContext({ permissions: ['microphone'] });
  const phone = await context.newPage(); const operator = await context.newPage();
  await phone.goto('/call?who=rosa'); await phone.getByRole('button', { name: 'Ready' }).click();
  await post(operator, '/operator/scam');
  await expect(phone.getByText('Incoming call')).toBeVisible(); await expect(phone.getByRole('heading', { name: 'Diego' })).toBeVisible();
  await phone.getByRole('button', { name: 'Decline' }).click();
  await expect(phone.getByText('Ready. Ringer on.')).toBeVisible();
  await context.close();
});

test('the server refuses foreign origins and the teller tools need an active payment', async ({ page }) => {
  expect((await page.request.post('/api/operator/reset', { headers: { 'x-tripwire-client': 'web', Origin: 'https://attacker.example' }, data: {} })).status()).toBe(403);
  expect((await page.request.post('/api/operator/reset', { data: {} })).status()).toBe(403);
  expect((await post(page, '/ring', { contact: 'diego', claim_summary: 'x' })).status()).toBe(400);
  expect((await post(page, '/token', { payee: 'City Electric', amount: 40, rail: 'bill-pay' })).ok()).toBe(true);
});

test('completed calls appear in the dashboard with expandable reviews', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Before the money moves.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Operator', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Case monitor', exact: true })).toHaveCount(0);
  await expect(page.locator('.connection.connected')).toHaveCount(0);
  await post(page, '/send', { payee: 'M. Ellis Legal', amount: 2500, rail: 'instant' });
  await post(page, '/operator/force', { status: 'not_me' });
  await post(page, '/decision', { decision: 'hold', reason: 'Diego did not ask for money.', source: 'rules' });
  await post(page, '/finish', { source: 'rules', rosa_said: 'He got arrested and needs bail today' });
  await expect(page.getByRole('heading', { name: 'The Bail Job' }).first()).toBeVisible();
  await page.getByText('Review call', { exact: true }).first().click();
  await expect(page.getByText('Tripwire called the real Diego on his saved number').first()).toBeVisible();
  await page.getByRole('link', { name: 'Saved calls', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved calls.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The Bail Job' }).first()).toBeVisible();
});

test('retired operator and case-monitor screens are unavailable', async ({ page }) => {
  expect((await page.request.get('/operator')).status()).toBe(404);
  expect((await page.request.get('/case/latest')).status()).toBe(404);
});
