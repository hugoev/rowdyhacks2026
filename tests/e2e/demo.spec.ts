import { test, expect, type APIRequestContext } from '@playwright/test';
const headers = (role: string) => ({ 'x-tripwire-client': 'web', 'x-tripwire-role': role });
async function login(api: APIRequestContext, role: string) { await api.post('/api/session', { headers: headers(role), data: { role } }); }
test.beforeEach(async ({ request }) => { await login(request, 'guardian'); await request.post('/api/demo/reset', { headers: headers('guardian'), data: {} }); });

test('unauthenticated and wrong-role callers cannot approve payments', async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:3101' });
  const guest = await api.get('/api/state', { headers: headers('guardian') }); expect(guest.status()).toBe(401);
  await login(api, 'protected');
  const analyticsDenied = await api.get('/api/analytics', { headers: headers('protected') }); expect(analyticsDenied.status()).toBe(403);
  const protectedState = await api.get('/api/state', { headers: headers('protected') }); expect(await protectedState.json()).not.toHaveProperty('riskHistory');
  const denied = await api.post('/api/payments/decide', { headers: headers('protected'), data: { id: '00000000-0000-4000-8000-000000000000', decision: 'approve' } }); expect(denied.status()).toBe(403);
  const csrf = await api.post('/api/call/start', { headers: { ...headers('protected'), Origin: 'https://attacker.example' }, data: { consent: true } }); expect(csrf.status()).toBe(403);
  await login(api, 'relative');
  const relativeState = await api.get('/api/state', { headers: headers('relative') }); expect(await relativeState.json()).not.toHaveProperty('riskHistory');
  await login(api, 'guardian');
  const analytics = await api.get('/api/analytics', { headers: headers('guardian') }); expect(analytics.status()).toBe(200); expect((await analytics.json()).history.source).toBe('local');
  await api.dispose();
});

for (let run = 1; run <= 3; run++) test(`grandson demo completes across three views — run ${run}`, async ({ browser }) => {
  const context = await browser.newContext(); const rosa = await context.newPage(); const guardian = await context.newPage(); const relative = await context.newPage();
  await guardian.goto('/guardian'); await expect(guardian.getByRole('heading', { name: 'Every second counts.' })).toBeVisible();
  await relative.goto('/relative'); await expect(relative.getByRole('heading', { name: 'You’re part of her safety net.' })).toBeVisible();
  await rosa.goto('/protected'); await rosa.getByRole('navigation', { name: 'Rosa’s tasks' }).getByRole('button', { name: 'Check a call' }).click(); await rosa.getByLabel('Read critical warnings aloud').uncheck();
  await rosa.getByText('Practice tools', { exact: true }).click(); await rosa.getByRole('button', { name: 'Start call practice' }).click();
  await rosa.getByRole('button', { name: 'Next caller statement' }).click();
  const detectionStarted = Date.now();
  await rosa.getByRole('button', { name: 'Next caller statement' }).click();
  await expect(guardian.getByText('Keep-it-secret request', { exact: true })).toBeVisible();
  expect(Date.now() - detectionStarted).toBeLessThan(10000);
  if (run === 1) await guardian.screenshot({ path: 'test-results/detective-active-call.png', fullPage: true });
  await rosa.getByRole('button', { name: 'Ask Alex', exact: true }).click(); await rosa.getByRole('button', { name: 'Check with Alex' }).click();
  await expect(relative.getByRole('button', { name: 'No, that’s not me' })).toBeVisible();
  const callbackStarted = Date.now();
  await relative.getByRole('button', { name: 'No, that’s not me' }).click();
  await expect(rosa.getByText('Alex says: “That isn’t me calling.” Hang up and call his saved number.')).toBeVisible();
  expect(Date.now() - callbackStarted).toBeLessThan(5000);
  await rosa.getByRole('navigation', { name: 'Rosa’s tasks' }).getByRole('button', { name: 'Send money' }).click(); await rosa.getByRole('button', { name: 'Review payment' }).click();
  await expect(rosa.getByRole('heading', { name: 'Your money can wait.' })).toBeVisible();
  if (run === 1) await guardian.screenshot({ path: 'test-results/detective-held-payment.png', fullPage: true });
  await guardian.getByRole('button', { name: 'Deny payment', exact: true }).click();
  await guardian.getByRole('dialog').getByRole('button', { name: 'Deny payment' }).click();
  await expect(rosa.getByRole('heading', { name: 'Elena stopped this payment.' })).toBeVisible();
  await expect(rosa.getByRole('heading', { name: 'What happened', exact: true })).toBeVisible();
  await expect(rosa.getByText('Your relative replied that they were not the person calling.')).toBeVisible();
  await expect(rosa.getByText('Call the person who asked for money using a number you already have saved.')).toBeVisible();
  await expect(guardian.locator('.payment-item').getByText('HEIST FOILED', { exact: true })).toBeVisible();
  await guardian.goto('/cases'); await expect(guardian.getByRole('heading', { name: 'The Grandson Job' })).toBeVisible();
  await expect(guardian.getByRole('heading', { name: 'Your next step', exact: true })).toBeVisible();
  if (run === 1) await guardian.screenshot({ path: 'test-results/detective-case-file.png', fullPage: true });
  await guardian.reload(); await expect(guardian.getByText('Your guardian denied this demo payment. It was not sent.')).toBeVisible();
  await context.close();
});

test('normal $40 bill completes with no friction', async ({ page }) => {
  await page.goto('/protected'); await page.getByRole('navigation', { name: 'Rosa’s tasks' }).getByRole('button', { name: 'Check a call' }).click(); await page.getByText('Practice tools', { exact: true }).click(); await page.getByRole('button', { name: 'Try a $40 bill' }).click(); await page.getByRole('navigation', { name: 'Rosa’s tasks' }).getByRole('button', { name: 'Send money' }).click(); await page.getByRole('button', { name: 'Review payment' }).click();
  await expect(page.getByRole('heading', { name: 'Payment review complete.' })).toBeVisible(); await expect(page.getByText('PAYMENT HELD', { exact: true })).toHaveCount(0);
});
test('safe word setup and incorrect answer escalate the call', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Set your safety net.' })).toBeVisible();
  if (await page.getByRole('button', { name: 'Set safe word', exact: true }).isVisible()) { await page.getByLabel('Your family word').fill('marigold'); await page.getByRole('button', { name: 'Set safe word', exact: true }).click(); await expect(page.getByText('SAFE WORD CONFIGURED', { exact: true })).toBeVisible(); }
  await page.goto('/protected'); await page.getByRole('navigation', { name: 'Rosa’s tasks' }).getByRole('button', { name: 'Check a call' }).click(); await page.getByLabel('Read critical warnings aloud').uncheck(); await page.getByText('Practice tools', { exact: true }).click(); await page.getByRole('button', { name: 'Start call practice' }).click();
  await page.getByRole('button', { name: 'Check the family word', exact: true }).click(); await page.getByLabel('What word did they say?').fill('wrong answer'); await page.getByRole('button', { name: 'Check their answer' }).click();
  await expect(page.getByText('That word did not match. Please hang up and call Alex.')).toBeVisible(); await expect(page.getByText(/CRITICAL ·/)).toBeVisible();
});
test('Inspector flags a romance sample and does not mislabel an ordinary message', async ({ page }) => {
  await page.goto('/inspector'); await page.getByRole('button', { name: 'Romance · plane ticket' }).click(); await page.getByRole('button', { name: 'Inspect this message' }).click();
  await expect(page.getByRole('heading', { name: 'Strong scam warning signs' })).toBeVisible();
  await page.getByRole('button', { name: 'Dinner plans', exact: true }).click(); await page.getByRole('button', { name: 'Inspect this message' }).click();
  await expect(page.getByRole('heading', { name: 'No red flags found' })).toBeVisible();
});
test('Heist Drill returns a scorecard for protective choices', async ({ page }) => {
  await page.goto('/drill'); await expect(page.getByRole('heading', { name: 'Heist Drill.' })).toBeVisible();
  await page.getByRole('button', { name: 'Start practice' }).click();
  await expect(page.getByText('A possible tell: Unverified family emergency')).toBeVisible();
  await page.getByRole('button', { name: /End the conversation and verify/ }).click();
  await page.getByRole('button', { name: /Pause and bring in someone I trust/ }).click();
  await page.getByRole('button', { name: /Stop\. I will not send money/ }).click();
  await expect(page.getByText('100/100', { exact: true })).toBeVisible();
  await expect(page.getByText('3 of 3 protective choices.')).toBeVisible();
});
test('student mode opens with a fake-job check scenario and student-specific safety guidance', async ({ page }) => {
  await page.goto('/student');
  await expect(page.getByRole('heading', { name: 'Check the offer.' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Student tasks' })).toBeVisible();
  await expect(page.getByText('Never send part of a check back to a new contact.')).toBeVisible();
  await page.getByRole('navigation', { name: 'Student tasks' }).getByRole('button', { name: 'Check a call' }).click();
  await expect(page.getByLabel('Choose a practice scenario')).toHaveValue('fakeJob');
});
test('Scam Weather clearly labels its 30-day synthetic aggregates', async ({ page, request }) => {
  const response = await request.get('/api/scam-weather', { headers: headers('guardian') });
  expect(response.ok()).toBeTruthy(); const report = await response.json();
  expect(report.source).toBe('seeded-demo'); expect(report.days).toHaveLength(30); expect(report.market).toBe('San Antonio');
  expect(JSON.stringify(report)).not.toContain('reporter');
  await login(request, 'relative');
  expect((await request.get('/api/scam-weather', { headers: headers('relative') })).status()).toBe(403);
  await page.goto('/weather'); await expect(page.getByRole('heading', { name: 'Scam Weather.' })).toBeVisible();
  await expect(page.getByText('SAMPLE DATA · NOT INCIDENT REPORTS')).toBeVisible();
  await expect(page.getByRole('img', { name: /synthetic scam report counts/ })).toBeVisible();
});
test('phone layouts have no horizontal overflow and navigation works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/guardian', '/protected', '/relative', '/inspector', '/settings', '/cases', '/drill', '/weather']) {
    await page.goto(route); await expect(page.locator('main h1')).toBeVisible(); await expect(page.getByText('Live connection', { exact: true })).toHaveCount(0); await expect(page.getByText('DEMO MODE', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'Open navigation' }).click(); await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'The Inspector' }).click();
  await expect(page.getByRole('heading', { name: 'Something feel off?' })).toBeVisible();
});
test('caseboard navigation hides its scrollbar while remaining scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 430 });
  await page.goto('/guardian');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByText('CASEBOARD', { exact: true })).toBeVisible();
  await expect(page.getByText('THE CREW', { exact: true })).toBeVisible();
  const sidebar = page.locator('.sidebar');
  expect(await sidebar.evaluate(element => getComputedStyle(element).scrollbarWidth)).toBe('none');
  const scroll = await sidebar.evaluate(element => { const before = element.scrollTop; element.scrollTop = element.scrollHeight; return { before, after: element.scrollTop, overflow: element.scrollHeight > element.clientHeight }; });
  expect(scroll.overflow).toBe(true);
  expect(scroll.after).toBeGreaterThan(scroll.before);
});
test('desktop and mobile views render without runtime errors', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto('/guardian');
  await expect(page.getByRole('heading', { name: 'Every second counts.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/tripwire-desktop.png', fullPage: true });
  await page.goto('/protected'); await page.getByRole('navigation', { name: 'Rosa’s tasks' }).getByRole('button', { name: 'Check a call' }).click(); await expect(page.getByRole('button', { name: 'Use microphone', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/tripwire-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('Rosa home, payment result and reduced motion remain readable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/protected');
  await expect(page.getByRole('heading', { name: 'Hello, Rosa.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/rosa-home.png', fullPage: true });
  await page.getByRole('navigation', { name: 'Rosa’s tasks' }).getByRole('button', { name: 'Send money' }).click();
  await page.getByRole('button', { name: 'Review payment' }).click();
  await expect(page.getByRole('heading', { name: 'Your money can wait.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review payment' })).toBeHidden();
  await expect(page.locator('.payment-result')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.senior-payment .payment-result > p').first()).toHaveCSS('font-size', '24px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/rosa-hold.png', fullPage: true });
  await page.getByRole('button', { name: 'Check another payment' }).click();
  await expect(page.getByLabel('Who are you paying?')).toHaveValue('Emergency gift cards');
});


test('Rosa header returns home and the command center retains its existing font and navigation', async ({ page }) => {
  await page.goto('/protected');
  await expect(page.getByRole('heading', { name: 'Hello, Rosa.' })).toBeVisible();
  await expect(page.locator('.family-brand')).toHaveAttribute('href', '/');
  await page.locator('.family-brand').click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Every second counts.' })).toBeVisible();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.footer')).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('font-family', 'Inter, "Inter Fallback", Arial, Helvetica, sans-serif');
});
