import { test, expect, type Page } from '@playwright/test';
const post = (page: Page, path: string, data: unknown = {}) => page.request.post('/api' + path, { headers: { 'x-tripwire-client': 'web' }, data });
test.beforeEach(async ({ page }) => { await post(page, '/operator/reset'); });

test('acceptance 1: $40 to City Electric sends with no Tripwire', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Send money' }).click();
  await page.getByRole('button', { name: /City Electric · \$40/ }).click();
  await page.getByRole('button', { name: 'Send $40' }).click();
  await expect(page.getByRole('heading', { name: 'Sent.' })).toBeVisible();
  await expect(page.getByText('No red flags found.')).toBeVisible();
  await expect(page.getByText(/safety teller/)).toHaveCount(0);
});

for (let run = 1; run <= 3; run++) test(`acceptance 2-6 (teller offline): Tripwire opens, Diego's phone rings, FORCE RESULT holds, case file, RESET — run ${run}`, async ({ browser }) => {
  const context = await browser.newContext({ permissions: ['microphone'] });
  const rosa = await context.newPage(); const diego = await context.newPage(); const monitor = await context.newPage(); const operator = await context.newPage();
  await operator.goto('/operator'); await expect(operator.getByRole('heading', { name: 'Operator' })).toBeVisible();
  await monitor.goto('/case/latest'); await expect(monitor.getByRole('heading', { name: 'Waiting for the next job…' })).toBeVisible();
  await diego.goto('/call?who=diego'); await diego.getByRole('button', { name: 'Ready' }).click(); await expect(diego.getByText('Ready. Ringer on.')).toBeVisible();
  await rosa.goto('/');
  await rosa.getByRole('button', { name: 'Send money' }).click();
  await expect(rosa.getByLabel('To', { exact: true })).toHaveValue('M. Ellis Legal');
  await rosa.getByRole('button', { name: 'Send $2,500' }).click();
  await expect(rosa.getByText('Tripwire · your bank’s safety teller')).toBeVisible();
  // Without a Gemini key the teller is offline; the money stays put while family is checked.
  await expect(rosa.getByText('Your money is staying put while we check with your family.')).toBeVisible();
  await expect(operator.getByText(/29x typical/).first()).toBeVisible();
  const rang = Date.now();
  await operator.getByRole('button', { name: 'CALL DIEGO (manual)' }).click();
  await expect(diego.getByText('Incoming call')).toBeVisible(); expect(Date.now() - rang).toBeLessThan(2000);
  await expect(diego.getByRole('heading', { name: 'Tripwire · Rosa’s bank' })).toBeVisible();
  await expect(rosa.getByText('Calling Diego…')).toBeVisible();
  await operator.getByRole('button', { name: 'FORCE RESULT · not me' }).click();
  await expect(rosa.getByRole('heading', { name: 'Your $2,500 is safe.' })).toBeVisible();
  await expect(rosa.getByText('They pretended to be Diego.')).toBeVisible();
  await expect(monitor.getByRole('heading', { name: /FILE \d+ \/\/ THE RUSH JOB/ })).toBeVisible();
  await expect(monitor.getByText('FOILED', { exact: true })).toBeVisible();
  await expect(monitor.getByText('Tripwire called the real Diego on his saved number')).toBeVisible();
  if (run === 1) { await rosa.screenshot({ path: 'test-results/rosa-safe.png' }); await monitor.screenshot({ path: 'test-results/case-file.png' }); }
  const reset = Date.now();
  await operator.getByRole('button', { name: 'RESET' }).click();
  await expect(rosa.getByRole('heading', { name: 'Hello, Rosa.' })).toBeVisible(); expect(Date.now() - reset).toBeLessThan(1000);
  await context.close();
});

test('START SCAM CALL rings Rosa’s phone with Diego as the caller ID', async ({ browser }) => {
  const context = await browser.newContext({ permissions: ['microphone'] });
  const phone = await context.newPage(); const operator = await context.newPage();
  await phone.goto('/call?who=rosa'); await phone.getByRole('button', { name: 'Ready' }).click();
  await operator.goto('/operator'); await operator.getByRole('button', { name: 'START SCAM CALL' }).click();
  await expect(phone.getByText('Incoming call')).toBeVisible(); await expect(phone.getByRole('heading', { name: 'Diego' })).toBeVisible();
  // Agents aren't configured in tests: answering explains the fallback instead of hanging.
  await phone.getByRole('button', { name: 'Answer' }).click();
  await expect(phone.getByText(/EL_AGENT_SCAMMER_ID|ElevenLabs is not configured/)).toBeVisible();
  await context.close();
});

test('the server refuses foreign origins and the teller tools need an active payment', async ({ page }) => {
  expect((await page.request.post('/api/operator/reset', { headers: { 'x-tripwire-client': 'web', Origin: 'https://attacker.example' }, data: {} })).status()).toBe(403);
  expect((await page.request.post('/api/operator/reset', { data: {} })).status()).toBe(403);
  expect((await post(page, '/ring', { contact: 'diego', claim_summary: 'x' })).status()).toBe(400);
  expect((await post(page, '/token', { payee: 'City Electric', amount: 40, rail: 'bill-pay' })).ok()).toBe(true);
});

test('the dashboard follows the job live on the detective board', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Before the money moves.' })).toBeVisible();
  await expect(page.getByText('The vault is quiet.')).toBeVisible();
  await post(page, '/send', { payee: 'M. Ellis Legal', amount: 2500, rail: 'instant' });
  await expect(page.getByRole('heading', { name: 'The teller is on the line.' })).toBeVisible();
  await expect(page.getByText('29×')).toBeVisible();
  await post(page, '/caption', { who: 'rosa', text: 'My grandson Diego is in jail.' });
  await expect(page.getByText('My grandson Diego is in jail.')).toBeVisible();
  await post(page, '/operator/call-diego');
  await expect(page.locator('.call-card.ringing')).toBeVisible();
  await post(page, '/operator/force', { status: 'not_me' });
  await post(page, '/decision', { decision: 'hold', reason: 'Diego did not ask for money.', source: 'rules' });
  await post(page, '/finish', { source: 'rules', rosa_said: 'He got arrested and needs bail today' });
  await expect(page.getByRole('heading', { name: 'Heist foiled.' })).toBeVisible();
  await expect(page.locator('.verdict-stamp.hold')).toHaveText('HELD');
  await expect(page.getByRole('heading', { name: /FILE \d+ \/\/ THE BAIL JOB/ })).toBeVisible();
  await page.getByRole('link', { name: 'Case files' }).first().click();
  await expect(page.getByRole('heading', { name: 'The case files.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The Bail Job' }).first()).toBeVisible();
});
