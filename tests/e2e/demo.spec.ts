import { test, expect, type APIRequestContext } from '@playwright/test';
const headers = (role: string) => ({ 'x-tripwire-client': 'web', 'x-tripwire-role': role });
async function login(api: APIRequestContext, role: string) { await api.post('/api/session', { headers: headers(role), data: { role } }); }
test.beforeEach(async ({ request }) => {
  await login(request, 'guardian'); await request.post('/api/demo/reset', { headers: headers('guardian'), data: {} });
  await request.post('/api/safe-word/set', { headers: headers('guardian'), data: { word: 'Marigold' } });
});

test('unauthenticated and wrong-role callers cannot act for the family', async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:3101' });
  const guest = await api.get('/api/state', { headers: headers('guardian') }); expect(guest.status()).toBe(401);
  await login(api, 'protected');
  expect((await api.get('/api/analytics', { headers: headers('protected') })).status()).toBe(403);
  expect((await api.post('/api/payments/decide', { headers: headers('protected'), data: { id: '00000000-0000-4000-8000-000000000000', decision: 'approve' } })).status()).toBe(403);
  expect((await api.post('/api/guardian/reply', { headers: headers('protected'), data: { id: '00000000-0000-4000-8000-000000000000', answer: 'release' } })).status()).toBe(403);
  expect((await api.post('/api/call/start', { headers: { ...headers('protected'), Origin: 'https://attacker.example' }, data: { consent: true } })).status()).toBe(403);
  expect((await api.post('/api/live/token', { headers: headers('protected'), data: {} })).status()).toBe(503);
  await login(api, 'relative');
  const relative = await (await api.get('/api/state', { headers: headers('relative') })).json();
  expect(relative).not.toHaveProperty('riskHistory'); expect(relative.call.transcript).toEqual([]);
  expect((await api.post('/api/live/tool', { headers: headers('relative'), data: { callId: '00000000-0000-4000-8000-000000000000', name: 'hold_payment', args: {} } })).status()).toBe(403);
  await api.dispose();
});

for (let run = 1; run <= 3; run++) test(`hero flow: con, family word, Teller pause, Diego blocks — run ${run}`, async ({ browser }) => {
  const context = await browser.newContext(); const rosa = await context.newPage(); const mc = await context.newPage(); const diego = await context.newPage();
  await mc.goto('/guardian'); await expect(mc.getByRole('heading', { name: 'Listening for the con.' })).toBeVisible();
  await diego.goto('/relative'); await expect(diego.getByRole('heading', { name: 'You’re Grandma’s trusted contact.' })).toBeVisible();
  await rosa.goto('/protected'); await expect(rosa.getByRole('heading', { name: 'Hello, Rosa.' })).toBeVisible();
  await rosa.getByText('Operator', { exact: true }).click();
  await rosa.getByLabel('Caller channel').selectOption('script');
  await rosa.getByRole('button', { name: 'Ring Rosa’s phone' }).click();
  await rosa.getByRole('button', { name: 'Answer' }).click();
  await expect(rosa.getByText('Tripwire rules ·')).toBeVisible();
  const started = Date.now();
  await rosa.getByRole('button', { name: /Next caller line/ }).click();
  await rosa.getByRole('button', { name: /Next caller line/ }).click();
  const meter = mc.getByRole('list', { name: 'Con Meter' });
  await expect(meter.getByText('don’t tell Mom', { exact: false })).toBeVisible();
  await expect(meter.getByText('I got arrested', { exact: false })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(10000);
  await expect(mc.getByRole('list', { name: 'Agent tool calls' }).getByText('report_signal').first()).toBeVisible();
  if (run === 1) await mc.screenshot({ path: 'test-results/mission-control-con.png', fullPage: true });
  await expect(rosa.getByText('Ask him for your family word.')).toBeVisible();
  await rosa.getByRole('button', { name: 'I asked' }).click();
  await rosa.getByLabel('What did they say?').fill('no time');
  await rosa.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(rosa.getByText('That wasn’t your family word. Please don’t send money.')).toBeVisible();
  await expect(meter.locator('.tumbler.red')).toHaveCount(1);
  await rosa.getByRole('button', { name: 'Open my bank app' }).click();
  await rosa.getByRole('button', { name: /Send money \$2,500/ }).click();
  await expect(rosa.getByRole('heading', { name: 'Paused.' })).toBeVisible();
  await expect(rosa.getByText(/The caller asked you to keep this secret from your family and refused your family word\./)).toBeVisible();
  await expect(rosa.getByText('We’ve asked Diego.', { exact: false })).toBeVisible();
  await expect(diego.getByRole('heading', { name: /Someone using your name is asking Grandma for \$2,500 in gift cards in bail money right now/ })).toBeVisible();
  if (run === 1) await rosa.screenshot({ path: 'test-results/rosa-paused.png', fullPage: true });
  const tapped = Date.now();
  await diego.getByRole('button', { name: 'Not me, block' }).click();
  await expect(rosa.getByRole('heading', { name: 'Your money hasn’t moved.' })).toBeVisible();
  expect(Date.now() - tapped).toBeLessThan(5000);
  await expect(rosa.getByText('Rosa, Diego just confirmed he’s safe and it wasn’t him.', { exact: false })).toBeVisible();
  await expect(diego.getByRole('heading', { name: 'Blocked. Grandma’s money hasn’t moved.' })).toBeVisible();
  await expect(mc.locator('.kraft-file').getByText('HEIST FOILED', { exact: true })).toBeVisible();
  await expect(mc.locator('.kraft-levers').getByText('Isolation')).toBeVisible();
  if (run === 1) await mc.screenshot({ path: 'test-results/mission-control-foiled.png', fullPage: true });
  await mc.goto('/cases'); await expect(mc.getByRole('heading', { name: 'The Grandson Job' })).toBeVisible();
  await context.close();
});

test('normal $40 bill with no call goes straight through', async ({ page }) => {
  await page.goto('/protected'); await page.getByText('Operator', { exact: true }).click();
  await page.getByRole('button', { name: '$40 bill' }).click();
  await page.getByRole('button', { name: /Send money \$40/ }).click();
  await expect(page.getByRole('heading', { name: 'Sent.' })).toBeVisible(); await expect(page.getByText('No red flags found.')).toBeVisible();
});

test('every view renders', async ({ page }) => {
  for (const route of ['/guardian', '/protected', '/relative', '/settings', '/cases', '/stage']) {
    const response = await page.goto(route); expect(response?.status()).toBe(200);
  }
});
